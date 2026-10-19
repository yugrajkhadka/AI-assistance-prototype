#include "onset_runtime.h"

#include "cineassist/camera_math.h"
#include "cineassist/image_decode.h"
#include "cineassist/project.h"

#include <chrono>
#include <cstdlib>
#include <sys/stat.h>
#include <cmath>

namespace cineassist {

int64_t nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool propertyFromString(const std::string& s, CameraAdjustment::Property& out) {
    using P = CameraAdjustment::Property;
    static const std::pair<const char*, P> kMap[] = {
        {"fNumber", P::FNumber}, {"iso", P::Iso}, {"shutterSeconds", P::ShutterSeconds},
        {"shutterAngle", P::ShutterAngle}, {"whiteBalanceK", P::WhiteBalanceK},
        {"ndStops", P::NdStops}, {"frameRate", P::FrameRate},
    };
    for (const auto& kv : kMap) {
        if (s == kv.first) { out = kv.second; return true; }
    }
    return false;
}

namespace {
std::string savedCameraPath() {
    const char* home = std::getenv("HOME");
    return home ? std::string(home) + "/.cineassist/camera-network.json" : std::string();
}
} // namespace

bool loadSavedNetworkCamera(OnsetRuntime::NetworkCamera& out) {
    const std::string path = savedCameraPath();
    std::string text;
    if (path.empty() || !json::readFile(path, text)) return false;
    const json::Value v = json::parse(text);
    if (v["address"].asString().empty()) return false;
    out.address = v["address"].asString();
    out.model = v["model"].asString();
    out.user = v["user"].asString();
    out.password = v["password"].asString();
    out.fingerprint = v["fingerprint"].asString();
    return true;
}

void saveNetworkCamera(const OnsetRuntime::NetworkCamera& net) {
    const std::string path = savedCameraPath();
    if (path.empty() || net.address.empty()) return;
    const std::string dir = path.substr(0, path.rfind('/'));
    ::mkdir(dir.c_str(), 0700);
    json::Value v = json::Value::object();
    v.set("address", net.address);
    v.set("model", net.model);
    v.set("user", net.user);
    v.set("password", net.password);
    v.set("fingerprint", net.fingerprint);
    if (json::writeFile(path, v.dump(2) + "\n")) ::chmod(path.c_str(), 0600);
}

std::unique_ptr<ICamera> connectRealCamera(const OnsetRuntime::NetworkCamera& net, const std::string& id,
                                           std::string& backendName, std::string& error, std::string& fingerprintSeen) {
    std::string target = id;
    if (target.empty() && !net.address.empty()) target = "ip:" + net.address + (net.model.empty() ? "" : ":" + net.model);
    for (const auto& b : availableCameraBackends()) {
        if (b == "sim") continue;
        auto cam = createCamera(b);
        if (!cam) continue;
        cam->setCredentials(net.user, net.password, net.fingerprint);
        // Skip slow connects when discovery sees nothing and no address was given.
        if (target.empty() && cam->enumerate(3).empty()) continue;
        std::string err;
        if (cam->connect(target, err)) {
            backendName = b;
            fingerprintSeen = cam->fingerprint();
            return cam;
        }
        error = err;
        fingerprintSeen = cam->fingerprint();
    }
    return nullptr;
}

void OnsetRuntime::noteLocked(const std::string& msg) {
    log.push_back(msg);
    if (log.size() > 20) log.erase(log.begin());
}

bool OnsetRuntime::publishFrameLocked(std::vector<uint8_t>& jpg) {
    jpeg.swap(jpg);
    const int64_t t = nowMs();
    // Exponential average of the delivered frame rate, for the UI badge.
    if (lastFrameMs > 0 && t > lastFrameMs) liveFps = liveFps * 0.85 + 0.15 * (1000.0 / (t - lastFrameMs));
    lastFrameMs = t;
    ++frameSeq;
    frameCv.notify_all();
    return true;
}

void OnsetRuntime::captureLoop(double fps) {
    const auto period = std::chrono::microseconds(static_cast<int64_t>(1e6 / std::max(1.0, fps)));
    std::vector<uint8_t> jpg;
    while (!captureStop) {
        const auto t0 = std::chrono::steady_clock::now();
        bool ok = false;
        {
            std::lock_guard<std::mutex> camLock(cameraMu);
            if (camera) ok = camera->liveViewJpeg(jpg);
        }
        if (ok) {
            std::lock_guard<std::mutex> lock(mu);
            publishFrameLocked(jpg);
            std::this_thread::sleep_until(t0 + period);
        } else {
            // No new frame yet (camera paces live view) or no camera: poll again shortly.
            std::this_thread::sleep_for(std::chrono::milliseconds(8));
        }
    }
}

void OnsetRuntime::startCapture(double fps) {
    if (captureThread.joinable()) return;
    captureStop = false;
    captureThread = std::thread([this, fps] { captureLoop(fps); });
}

void OnsetRuntime::stopCapture() {
    captureStop = true;
    if (captureThread.joinable()) captureThread.join();
}

void OnsetRuntime::swapCameraLocked(std::unique_ptr<ICamera> next) {
    std::lock_guard<std::mutex> camLock(cameraMu);
    if (camera) camera->disconnect();
    camera = std::move(next);
    lastFrameMs = 0;
    liveFps = 0;
}

void OnsetRuntime::tickLocked() {
    if (!camera) return;
    {
        std::lock_guard<std::mutex> camLock(cameraMu);
        cam = camera->state();
        // Without the capture thread (e.g. --once), fetch a frame here.
        if (!captureRunning()) {
            std::vector<uint8_t> jpg;
            if (camera->liveViewJpeg(jpg)) publishFrameLocked(jpg);
        }
    }
    // Analyse the newest streamed frame (decode only when there's a new one).
    FrameStats stats;
    if (frameSeq != analysedSeq && !jpeg.empty()) {
        std::string err;
        if (decodeImage(jpeg.data(), jpeg.size(), frame, err)) {
            frame.logEncoded = logEncoded;
            lastStats = analyzer.analyze(frame.view());
        }
        analysedSeq = frameSeq;
        stats = lastStats;
    }
    if (session.sceneIndex() != lastScene || session.shotIndex() != lastShot) {
        engine.resetShot();
        lastScene = session.sceneIndex();
        lastShot = session.shotIndex();
    }
    EngineInput in;
    in.scene = session.scene();
    in.shot = session.shot();
    in.planned = havePlan ? &session.project().camera : nullptr;
    in.camera = cam;
    in.frame = stats;
    in.mode = mode;
    in.locks = locks;
    last = engine.evaluate(in);

    // Auto-apply: one safest move at a time, then give the camera 1.5 s to settle.
    if (autoApply && !last.adjustments.empty() && !(mode == GuidanceMode::Lock && locks.camera) &&
        nowMs() - lastAutoApplyMs > 1500) {
        std::string msg;
        applyLocked(0, msg);
        lastAutoApplyMs = nowMs();
    }
}

bool OnsetRuntime::applyLocked(size_t index, std::string& message) {
    if (!camera || index >= last.adjustments.size()) {
        message = "no such adjustment";
        return false;
    }
    const CameraAdjustment a = last.adjustments[index];
    std::string err;
    bool ok;
    {
        std::lock_guard<std::mutex> camLock(cameraMu);
        ok = camera->apply(a, err);
    }
    message = ok ? "✓ " + a.label : "✗ " + a.label + " — " + err;
    noteLocked(message);
    return ok;
}

bool OnsetRuntime::setLocked(CameraAdjustment::Property p, double value, std::string& message) {
    if (!camera) { message = "no camera"; return false; }
    CameraAdjustment a;
    a.property = p;
    a.value = value;
    a.label = std::string("Set ") + toString(p);
    std::string err;
    bool ok;
    {
        std::lock_guard<std::mutex> camLock(cameraMu);
        ok = camera->apply(a, err);
    }
    char buf[160];
    std::snprintf(buf, sizeof buf, "%s %s = %g%s%s", ok ? "✓" : "✗", toString(p), value, ok ? "" : " — ", ok ? "" : err.c_str());
    message = buf;
    noteLocked(message);
    return ok;
}

json::Value OnsetRuntime::statusJsonLocked() const {
    json::Value o = json::Value::object();
    o.set("backend", backend);
    o.set("autoBackend", autoBackend);
    o.set("connected", camera && camera->isConnected());
    o.set("connection", camera ? (backend == "sim" ? std::string("simulator") : camera->connectionLabel()) : std::string());
    o.set("fingerprint", camera ? camera->fingerprint() : std::string());
    o.set("pendingFingerprint", pendingFingerprint);
    o.set("lastConnectError", lastConnectError);
    json::Value netj = json::Value::object();
    netj.set("address", net.address);
    netj.set("model", net.model);
    netj.set("user", net.user);
    netj.set("hasPassword", !net.password.empty());   // never echo the password
    netj.set("pinnedFingerprint", net.fingerprint);
    o.set("network", std::move(netj));
    o.set("camera", cameraStateToJson(cam));
    o.set("frame", frameStatsToJson(last.smoothedFrame));
    o.set("frameSeq", static_cast<int64_t>(frameSeq));
    o.set("liveFps", std::round(liveFps * 10) / 10);
    o.set("frameWidth", frame.width);
    o.set("frameHeight", frame.height);
    json::Value g = json::Value::array();
    for (const auto& item : last.guidance) g.push(guidanceToJson(item));
    o.set("guidance", std::move(g));
    json::Value adj = json::Value::array();
    for (const auto& a : last.adjustments) {
        json::Value aj = json::Value::object();
        aj.set("property", toString(a.property));
        aj.set("value", a.value);
        aj.set("label", a.label);
        aj.set("guidanceId", a.guidanceId);
        adj.push(std::move(aj));
    }
    o.set("adjustments", std::move(adj));
    o.set("deviations", deviationReportToJson(last.deviations));
    o.set("readiness", last.readiness);
    o.set("mode", toString(mode));
    json::Value lk = json::Value::object();
    lk.set("camera", locks.camera);
    lk.set("lighting", locks.lighting);
    lk.set("framing", locks.framing);
    o.set("locks", std::move(lk));
    o.set("autoApply", autoApply);
    o.set("havePlan", havePlan);
    o.set("sceneIndex", static_cast<int>(session.sceneIndex()));
    o.set("shotIndex", static_cast<int>(session.shotIndex()));
    o.set("take", session.currentTake());
    if (const Scene* sc = session.scene()) {
        o.set("sceneNumber", sc->number);
        o.set("sceneCoverage", sceneCoverage(*sc));
    }
    if (const Shot* sh = session.shot()) {
        o.set("shotId", sh->id);
        o.set("shotType", sh->type);
        o.set("shotLens", sh->lens);
    }
    json::Value lg = json::Value::array();
    for (const auto& l : log) lg.push(l);
    o.set("log", std::move(lg));
    return o;
}

} // namespace cineassist
