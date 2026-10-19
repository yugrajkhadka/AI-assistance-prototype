// cineassist-onset — on-set guidance loop.
//
// Connects to a camera through any compiled-in backend, pulls settings and live
// view, runs the guidance engine, and prints an operator HUD. Commands typed on
// stdin drive the session (next shot, apply fix, roll, mark done, ask...).
// With --http, the same runtime is served to the web app (live view + control).
//
//   cineassist-onset --backend auto --http 8765          # web app bridge
//   cineassist-onset --backend sim  --project examples/sample_project.json
//   cineassist-onset --backend sony --project plan.json --save onset_progress.json
//   cineassist-onset --backend sim  --project plan.json --once --json
#include "cineassist/backends.h"
#include "cineassist/camera_math.h"
#include "cineassist/image_decode.h"
#include "cineassist/project.h"
#include "cineassist/version.h"

#include "http_bridge.h"
#include "onset_runtime.h"
#include "sim/sim_camera.h"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <future>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>

using namespace cineassist;

namespace {

struct Options {
    std::string backend = "sim";
    std::string cameraId;
    std::string projectPath;
    std::string savePath;
    std::string imagePath;    // sim: use a still as live view
    GuidanceMode mode = GuidanceMode::Suggest;
    int mainsHz = 60;
    double rateHz = 4;
    double liveFps = 30;      // live-view capture rate for the web bridge
    bool logEncoded = false;
    bool json = false;
    bool once = false;
    bool autoApply = false;
    bool list = false;
    bool color = true;
    double simSceneGain = -1;
    OnsetRuntime::NetworkCamera net;  // Wi-Fi/LAN camera settings
    int httpPort = 0;         // 0 = no bridge
    std::string httpHost = "127.0.0.1";
};

std::atomic<bool> gStop{false};

void usage() {
    std::string backends = "auto";
    for (const auto& n : availableCameraBackends()) backends += ", " + n;
    std::printf(
        "cineassist-onset %s — on-set camera guidance\n\n"
        "Usage: cineassist-onset [options]\n"
        "  --backend NAME     camera backend: %s (default sim)\n"
        "                     'auto' uses a real camera when present, else the simulator,\n"
        "                     and switches over when a camera is plugged in\n"
        "  --camera ID        camera id or model (default: first found); ip:ADDR[:MODEL] for network\n"
        "  --camera-ip ADDR   Wi-Fi/LAN camera address (skips discovery), e.g. 192.168.122.1\n"
        "  --camera-model M   model for --camera-ip when not discoverable, e.g. ILCE-7M4\n"
        "  --camera-user U    camera Access Authentication user   (or CINEASSIST_SONY_USER)\n"
        "  --camera-password P                                    (or CINEASSIST_SONY_PASSWORD)\n"
        "  --camera-fingerprint F  pin the camera's SSH host key  (or CINEASSIST_SONY_FINGERPRINT)\n"
        "  --list             list cameras for the backend and exit\n"
        "  --project FILE     plan JSON exported from the web app (GET /api/onset/:id)\n"
        "  --save FILE        persist on-set progress here (resumes if it exists)\n"
        "  --mode M           suggest | assist | lock          (default suggest)\n"
        "  --mains HZ         50 or 60, for flicker checks     (default 60)\n"
        "  --rate HZ          guidance evaluation rate         (default 4; 10 with --http)\n"
        "  --live-fps N       live-view capture rate for the web bridge (default 30)\n"
        "  --log              live view is log-encoded (monitor LUT off)\n"
        "  --auto-apply       apply the safest adjustment automatically\n"
        "  --http PORT        serve live view + control to the web app on PORT\n"
        "  --host ADDR        bridge bind address              (default 127.0.0.1)\n"
        "  --image FILE       sim backend: use a JPEG/PNG still as the live view\n"
        "  --sim-gain X       sim backend: scene brightness (1 = correct exposure)\n"
        "  --once             evaluate once, print, and exit\n"
        "  --json             print machine-readable JSON lines instead of the HUD\n"
        "  --no-color         disable ANSI colours\n\n"
        "Commands while running (type + Enter):\n"
        "  status | next | prev | shot N | scene N | apply [N|all] | rec | stop | auto on|off\n"
        "  done [notes] | note TEXT | mode suggest|assist|lock | lock/unlock camera|lighting|framing\n"
        "  ask QUESTION | snap FILE.ppm | help | quit\n",
        CINEASSIST_VERSION_STRING, backends.c_str());
}

bool parseArgs(int argc, char** argv, Options& o) {
    bool rateGiven = false;
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        auto next = [&](std::string& out) {
            if (i + 1 >= argc) { std::fprintf(stderr, "missing value for %s\n", a.c_str()); return false; }
            out = argv[++i];
            return true;
        };
        std::string v;
        if (a == "--backend") { if (!next(o.backend)) return false; }
        else if (a == "--camera") { if (!next(o.cameraId)) return false; }
        else if (a == "--project") { if (!next(o.projectPath)) return false; }
        else if (a == "--save") { if (!next(o.savePath)) return false; }
        else if (a == "--image") { if (!next(o.imagePath)) return false; }
        else if (a == "--host") { if (!next(o.httpHost)) return false; }
        else if (a == "--camera-ip") { if (!next(o.net.address)) return false; }
        else if (a == "--camera-model") { if (!next(o.net.model)) return false; }
        else if (a == "--camera-user") { if (!next(o.net.user)) return false; }
        else if (a == "--camera-password") { if (!next(o.net.password)) return false; }
        else if (a == "--camera-fingerprint") { if (!next(o.net.fingerprint)) return false; }
        else if (a == "--http") { if (!next(v)) return false; o.httpPort = std::atoi(v.c_str()); }
        else if (a == "--mode") { if (!next(v)) return false; o.mode = guidanceModeFromString(v); }
        else if (a == "--mains") { if (!next(v)) return false; o.mainsHz = std::atoi(v.c_str()); }
        else if (a == "--rate") { if (!next(v)) return false; o.rateHz = std::max(0.2, std::atof(v.c_str())); rateGiven = true; }
        else if (a == "--sim-gain") { if (!next(v)) return false; o.simSceneGain = std::atof(v.c_str()); }
        else if (a == "--live-fps") { if (!next(v)) return false; o.liveFps = std::max(1.0, std::atof(v.c_str())); }
        else if (a == "--log") o.logEncoded = true;
        else if (a == "--json") o.json = true;
        else if (a == "--once") o.once = true;
        else if (a == "--auto-apply") o.autoApply = true;
        else if (a == "--list") o.list = true;
        else if (a == "--no-color") o.color = false;
        else if (a == "-h" || a == "--help") { usage(); std::exit(0); }
        else { std::fprintf(stderr, "unknown option %s\n", a.c_str()); return false; }
    }
    if (o.httpPort > 0 && !rateGiven) o.rateHz = 10;  // smoother live view in the browser
    return true;
}

// Non-blocking stdin: a reader thread queues lines for the main loop.
class LineReader {
public:
    LineReader() : thread_([this] { run(); }) { thread_.detach(); }
    bool pop(std::string& line) {
        std::lock_guard<std::mutex> lock(mu_);
        if (lines_.empty()) return false;
        line = std::move(lines_.front());
        lines_.pop_front();
        return true;
    }
    // True once stdin is closed and every queued line has been handled.
    bool drained() {
        std::lock_guard<std::mutex> lock(mu_);
        return eof_ && lines_.empty();
    }

private:
    void run() {
        std::string line;
        while (std::getline(std::cin, line)) {
            std::lock_guard<std::mutex> lock(mu_);
            lines_.push_back(line);
        }
        eof_ = true;
    }
    std::mutex mu_;
    std::deque<std::string> lines_;
    std::atomic<bool> eof_{false};
    std::thread thread_;
};

const char* sevColor(Severity s, bool color) {
    if (!color) return "";
    switch (s) {
        case Severity::Critical: return "\033[1;41;97m";
        case Severity::High: return "\033[1;31m";
        case Severity::Medium: return "\033[33m";
        case Severity::Low: return "\033[36m";
        default: return "\033[90m";
    }
}

const char* reset(bool color) { return color ? "\033[0m" : ""; }

std::string cameraLine(const CameraState& c) {
    std::ostringstream os;
    const double stop = c.tStop > 0 ? c.tStop : c.fNumber;
    os << (c.recording ? "● REC " : "  STBY ") << c.model
       << " | " << math::formatAperture(stop, c.tStop > 0)
       << " | ISO " << (c.isoAuto ? std::string("AUTO") : std::to_string(c.iso))
       << " | " << math::formatShutter(c.shutterSeconds)
       << (c.shutterAngle > 0 ? " (" + math::formatAngle(c.shutterAngle) + ")" : std::string())
       << " | " << math::formatFrameRate(c.frameRate)
       << " | " << (c.whiteBalanceAuto ? std::string("AWB") : std::to_string(c.whiteBalanceK) + "K")
       << " | ND " << (c.ndStops > 0 ? math::formatStops(c.ndStops).substr(1) : std::string("clear"))
       << (c.focalLengthMm > 0 ? " | " + std::to_string(static_cast<int>(c.focalLengthMm + 0.5)) + "mm" : std::string())
       << (c.batteryPercent >= 0 ? " | BATT " + std::to_string(c.batteryPercent) + "%" : std::string());
    return os.str();
}

void printHud(const Options& o, const OnsetRuntime& rt) {
    const bool col = o.color;
    const auto& out = rt.last;
    std::printf("\n%s──────────────────────────────────────────────────────────────%s\n", col ? "\033[90m" : "", reset(col));
    if (const Scene* sc = rt.session.scene()) {
        std::printf("SC %d  %s", sc->number, sc->title.c_str());
        if (const Shot* sh = rt.session.shot())
            std::printf("  ▸ Shot %zu/%zu %s %s — take %d\n   %s\n", rt.session.shotIndex() + 1, sc->shots.size(), sh->type.c_str(),
                        sh->lens.c_str(), rt.session.currentTake(), sh->description.c_str());
        else
            std::printf("\n");
    }
    std::printf("%s  [%s]\n", cameraLine(rt.cam).c_str(), rt.backend.c_str());
    if (out.smoothedFrame.valid) {
        std::printf("IMG  key %s | clip %.1f%% | crush %.1f%% | focus %.2f | DR %.1f stops\n",
                    math::formatStops(out.smoothedFrame.evOffset).c_str(), out.smoothedFrame.clippedFraction * 100,
                    out.smoothedFrame.crushedFraction * 100, out.smoothedFrame.centerSharpness, out.smoothedFrame.contrastRatio);
    }
    std::printf("READY %d%%   PLAN MATCH %d%%   MODE %s%s\n", out.readiness, out.deviations.overallMatch, toString(rt.mode),
                rt.autoApply ? "   AUTO-APPLY" : "");
    int shown = 0;
    for (const auto& g : out.guidance) {
        if (shown++ >= 8) break;
        std::printf(" %s%-8s%s %s%s\n", sevColor(g.severity, col), toString(g.severity), reset(col), g.title.c_str(),
                    g.blockedByLock ? "  [locked]" : "");
        std::printf("          → %s\n", g.fix.c_str());
    }
    if (!out.adjustments.empty()) {
        std::printf("Proposed (type 'apply' or 'apply N'):\n");
        for (size_t i = 0; i < out.adjustments.size(); ++i) std::printf("  [%zu] %s\n", i + 1, out.adjustments[i].label.c_str());
    }
    std::fflush(stdout);
}

std::string hudKey(const OnsetRuntime& rt) {
    std::string k = cameraLine(rt.cam) + "|" + std::to_string(rt.session.sceneIndex()) + "/" +
                    std::to_string(rt.session.shotIndex()) + "|" + std::to_string(rt.last.readiness);
    for (const auto& g : rt.last.guidance) k += g.id + ":" + g.title + ";";
    for (const auto& a : rt.last.adjustments) k += a.label + ";";
    return k;
}

std::unique_ptr<ICamera> makeSim(const Options& opt) {
    SimSceneParams p;
    p.imagePath = opt.imagePath;
    if (opt.simSceneGain > 0) p.sceneGain = opt.simSceneGain;
    return std::make_unique<SimCamera>(p);
}


} // namespace

int main(int argc, char** argv) {
    registerBuiltinBackends();
    Options opt;
    if (!parseArgs(argc, argv, opt)) { usage(); return 2; }
    std::signal(SIGINT, [](int) { gStop = true; });
    std::signal(SIGTERM, [](int) { gStop = true; });

    EngineConfig ecfg;
    ecfg.mainsHz = opt.mainsHz;
    OnsetRuntime rt(ecfg);
    rt.mode = opt.mode;
    rt.autoApply = opt.autoApply;
    rt.logEncoded = opt.logEncoded;
    rt.net = opt.net;
    // No network camera on the command line: reuse the last one that connected.
    if (rt.net.address.empty() && loadSavedNetworkCamera(rt.net))
        std::printf("Using saved network camera %s (%s)\n", rt.net.address.c_str(), rt.net.model.c_str());

    std::string err;
    if (opt.list) {
        auto cam = opt.backend == "sim" ? makeSim(opt) : createCamera(opt.backend);
        if (!cam) { std::fprintf(stderr, "backend '%s' is not compiled into this build\n", opt.backend.c_str()); return 2; }
        const auto cams = cam->enumerate(3);
        if (cams.empty()) std::printf("no cameras found on backend '%s'\n", opt.backend.c_str());
        for (const auto& c : cams) std::printf("%s\t%s\t%s\n", c.id.c_str(), c.model.c_str(), c.connection.c_str());
        std::fflush(stdout);
        std::_Exit(0);
    }

    bool needConnect = true;
    if (opt.backend == "auto") {
        rt.autoBackend = true;
        std::string fp;
        rt.camera = connectRealCamera(rt.net, opt.cameraId, rt.backend, err, fp);
        if (rt.camera) {
            needConnect = false;  // already connected
        } else {
            // No real camera (or it refused): run the simulator and keep looking.
            if (!err.empty()) { rt.lastConnectError = err; rt.pendingFingerprint = fp; }
            rt.camera = makeSim(opt);
            rt.backend = "sim";
        }
    } else if (opt.backend == "sim") {
        rt.camera = makeSim(opt);
        rt.backend = "sim";
    } else {
        rt.camera = createCamera(opt.backend);
        rt.backend = opt.backend;
        if (rt.camera) rt.camera->setCredentials(rt.net.user, rt.net.password, rt.net.fingerprint);
        if (opt.cameraId.empty() && !rt.net.address.empty())
            opt.cameraId = "ip:" + rt.net.address + (rt.net.model.empty() ? "" : ":" + rt.net.model);
        if (!rt.camera) {
            std::fprintf(stderr, "backend '%s' is not compiled into this build\n", opt.backend.c_str());
            usage();
            return 2;
        }
    }
    if (needConnect && !rt.camera->connect(opt.cameraId, err)) {
        std::fprintf(stderr, "camera connect failed: %s\n", err.c_str());
        // _Exit: a vendor SDK thread may be stuck holding loader locks; don't run destructors.
        std::fflush(stderr);
        std::_Exit(1);
    }

    if (!opt.projectPath.empty()) {
        if (!rt.session.open(opt.projectPath, opt.savePath, &err)) {
            std::fprintf(stderr, "cannot load project: %s\n", err.c_str());
            return 1;
        }
        rt.havePlan = true;
    }

    std::unique_ptr<HttpBridge> bridge;
    if (opt.httpPort > 0) {
        bridge = std::make_unique<HttpBridge>(rt);
        bridge->setSimFactory([&opt] { return makeSim(opt); });
        if (!bridge->start(opt.httpHost, opt.httpPort, err)) {
            std::fprintf(stderr, "%s\n", err.c_str());
            std::_Exit(1);
        }
    }
    if (!opt.json) {
        const std::string web = opt.httpPort > 0 ? " Web bridge on http://" + opt.httpHost + ":" + std::to_string(opt.httpPort) + "." : "";
        std::printf("Connected to %s via '%s'.%s Type 'help' for commands.\n", rt.camera->state().model.c_str(), rt.backend.c_str(), web.c_str());
        std::fflush(stdout);
    }

    if (opt.once) {
        std::lock_guard<std::mutex> lock(rt.mu);
        // Two ticks so smoothing and the first live-view frame settle.
        rt.tickLocked();
        rt.tickLocked();
        if (opt.json) std::printf("%s\n", rt.statusJsonLocked().dump().c_str());
        else printHud(opt, rt);
        rt.camera->disconnect();
        return 0;
    }

    // Smooth live view for the web app: capture on its own thread, independent of
    // the guidance tick (which only analyses the newest frame).
    if (opt.httpPort > 0) rt.startCapture(opt.liveFps);

    // In auto mode, look for a real camera in the background while on the simulator.
    struct ProbeResult { std::unique_ptr<ICamera> cam; std::string name, error, fingerprint; };
    std::future<ProbeResult> probe;
    auto lastProbe = std::chrono::steady_clock::now() - std::chrono::seconds(60);

    LineReader reader;
    std::string lastKey;
    const auto period = std::chrono::milliseconds(static_cast<int>(1000.0 / opt.rateHz));
    bool running = true;
    bool forceHud = true;
    const bool interactive = !opt.json;

    auto handle = [&](const std::string& line) {
        std::istringstream is(line);
        std::string cmd;
        is >> cmd;
        std::string rest;
        std::getline(is, rest);
        if (!rest.empty() && rest[0] == ' ') rest.erase(0, 1);
        if (cmd.empty()) return;
        forceHud = true;
        std::lock_guard<std::mutex> lock(rt.mu);
        auto& s = rt.session;
        std::string msg;
        if (cmd == "q" || cmd == "quit" || cmd == "exit") running = false;
        else if (cmd == "help") usage();
        else if (cmd == "status") {}
        else if (cmd == "next") { if (!s.nextShot()) std::printf("already on the last shot\n"); }
        else if (cmd == "prev") { if (!s.prevShot()) std::printf("already on the first shot\n"); }
        else if (cmd == "shot") { if (!s.selectShot(static_cast<size_t>(std::max(1, std::atoi(rest.c_str())) - 1))) std::printf("no such shot\n"); }
        else if (cmd == "scene") { if (!s.selectScene(static_cast<size_t>(std::max(1, std::atoi(rest.c_str())) - 1))) std::printf("no such scene\n"); }
        else if (cmd == "apply") {
            // Re-read the camera first so a queued 'apply' never re-sends a stale proposal.
            rt.tickLocked();
            if (rest == "all") {
                const size_t n = rt.last.adjustments.size();
                for (size_t i = 0; i < n && !rt.last.adjustments.empty(); ++i) {
                    rt.applyLocked(0, msg);
                    std::printf("%s\n", msg.c_str());
                    rt.tickLocked();
                }
            } else {
                rt.applyLocked(rest.empty() ? 0 : static_cast<size_t>(std::max(1, std::atoi(rest.c_str())) - 1), msg);
                std::printf("%s\n", msg.c_str());
            }
        }
        else if (cmd == "rec" || cmd == "stop") {
            std::string e;
            std::lock_guard<std::mutex> camLock(rt.cameraMu);
            const bool ok = cmd == "rec" ? rt.camera->startRecording(e) : rt.camera->stopRecording(e);
            if (!ok) std::printf("✗ %s\n", e.c_str());
        }
        else if (cmd == "done") {
            if (!s.shot()) { std::printf("no shot selected\n"); return; }
            const int cov = s.completeShot(rest.empty() ? "Completed take " + std::to_string(s.currentTake()) + " on camera." : rest);
            std::printf("✓ shot marked complete — scene coverage %d%%\n", cov);
        }
        else if (cmd == "note") { s.addNote(rest); std::printf("✓ note saved\n"); }
        else if (cmd == "mode") { rt.mode = guidanceModeFromString(rest); }
        else if (cmd == "auto") { rt.autoApply = rest != "off"; }
        else if (cmd == "lock" || cmd == "unlock") {
            const bool on = cmd == "lock";
            if (rest == "camera") rt.locks.camera = on;
            else if (rest == "lighting") rt.locks.lighting = on;
            else if (rest == "framing") rt.locks.framing = on;
            else std::printf("lock what? camera | lighting | framing\n");
        }
        else if (cmd == "ask") {
            EngineInput in;
            in.scene = s.scene();
            in.shot = s.shot();
            in.planned = rt.havePlan ? &s.project().camera : nullptr;
            in.camera = rt.cam;
            in.mode = rt.mode;
            in.locks = rt.locks;
            std::printf("\n%s\n", answerQuestion(rest, in, &rt.last).c_str());
            forceHud = false;
        }
        else if (cmd == "snap") {
            const std::string path = rest.empty() ? "snap.ppm" : rest;
            std::printf(writePpm(path, rt.frame) ? "✓ saved %s\n" : "✗ could not save %s\n", path.c_str());
        }
        else { std::printf("unknown command '%s' — type 'help'\n", cmd.c_str()); forceHud = false; }
    };

    while (running && !gStop) {
        const auto t0 = std::chrono::steady_clock::now();
        std::string line;
        while (reader.pop(line)) handle(line);
        if (!running) break;

        // Auto backend: hot-swap from the simulator to a real camera when one appears.
        bool probeWanted;
        {
            std::lock_guard<std::mutex> lock(rt.mu);
            probeWanted = rt.autoBackend && rt.backend == "sim";
        }
        if (probeWanted || probe.valid()) {
            if (probe.valid() && probe.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
                auto found = probe.get();
                std::lock_guard<std::mutex> lock(rt.mu);
                if (found.cam && rt.backend == "sim" && rt.autoBackend) {
                    rt.swapCameraLocked(std::move(found.cam));
                    rt.backend = found.name;
                    rt.lastConnectError.clear();
                    rt.pendingFingerprint.clear();
                    if (rt.net.fingerprint.empty()) rt.net.fingerprint = found.fingerprint;
                    rt.engine.resetShot();
                    rt.noteLocked("Switched to " + rt.backend + " camera: " + rt.camera->state().model + " via " + rt.camera->connectionLabel());
                    forceHud = true;
                } else if (!found.error.empty() && found.error != rt.lastConnectError) {
                    rt.lastConnectError = found.error;
                    rt.pendingFingerprint = found.fingerprint;
                    rt.noteLocked("✗ " + found.error);
                }
            } else if (!probe.valid() && !rt.manualConnect && t0 - lastProbe > std::chrono::seconds(5)) {
                lastProbe = t0;
                const std::string id = opt.cameraId;
                OnsetRuntime::NetworkCamera net;
                {
                    std::lock_guard<std::mutex> lock(rt.mu);
                    net = rt.net;
                }
                rt.probing = true;
                probe = std::async(std::launch::async, [id, net, &rt] {
                    ProbeResult r;
                    r.cam = connectRealCamera(net, id, r.name, r.error, r.fingerprint);
                    rt.probing = false;
                    return r;
                });
            }
        }
        // A real camera that drops off falls back to the simulator in auto mode.
        {
            std::lock_guard<std::mutex> lock(rt.mu);
            if (rt.autoBackend && rt.backend != "sim" && !rt.camera->isConnected()) {
            rt.noteLocked("Camera disconnected — back to simulator");
            auto sim = makeSim(opt);
            sim->connect("", err);
            rt.swapCameraLocked(std::move(sim));
            rt.backend = "sim";
            }
        }

        {
            std::lock_guard<std::mutex> lock(rt.mu);
            rt.tickLocked();
            if (opt.json) std::printf("%s\n", rt.statusJsonLocked().dump().c_str());
            else {
                const std::string key = hudKey(rt);
                if (forceHud || key != lastKey) printHud(opt, rt);
                lastKey = key;
            }
            std::fflush(stdout);
        }
        forceHud = false;
        // stdin closed (piped commands finished) and no bridge to keep serving: stop.
        if (interactive && opt.httpPort == 0 && reader.drained()) running = false;
        std::this_thread::sleep_until(t0 + period);
    }
    rt.stopCapture();
    if (bridge) bridge->stop();
    if (probe.valid()) probe.wait();
    std::lock_guard<std::mutex> lock(rt.mu);
    rt.session.save(nullptr);
    rt.camera->disconnect();
    return 0;
}
