#include "http_bridge.h"

#include "cineassist/project.h"

#include "httplib.h"

#include <chrono>
#include <thread>

namespace cineassist {

namespace {

// Only pages served from this machine may drive the camera. Combined with the
// JSON content-type requirement below (which forces a CORS preflight), this
// stops arbitrary websites in the same browser from changing camera settings.
bool originAllowed(const std::string& origin) {
    if (origin.empty()) return true;  // curl, native apps
    for (const char* prefix : {"http://localhost", "http://127.0.0.1", "http://[::1]"}) {
        if (origin.rfind(prefix, 0) == 0) {
            const char next = origin.size() > std::strlen(prefix) ? origin[std::strlen(prefix)] : '\0';
            if (next == '\0' || next == ':' || next == '/') return true;
        }
    }
    return false;
}

void sendJson(httplib::Response& res, const json::Value& v, int status = 200) {
    res.status = status;
    res.set_content(v.dump(), "application/json");
}

void sendError(httplib::Response& res, int status, const std::string& msg) {
    json::Value o = json::Value::object();
    o.set("error", msg);
    sendJson(res, o, status);
}

} // namespace

struct HttpBridge::Impl {
    OnsetRuntime& rt;
    httplib::Server server;
    std::thread thread;
    std::function<std::unique_ptr<ICamera>()> makeSimCamera;

    explicit Impl(OnsetRuntime& r) : rt(r) {}

    // Parse a JSON POST body, enforcing origin + content type. Returns false (and
    // fills res) if the request must be rejected.
    bool body(const httplib::Request& req, httplib::Response& res, json::Value& out) {
        if (!originAllowed(req.get_header_value("Origin"))) { sendError(res, 403, "origin not allowed"); return false; }
        if (req.get_header_value("Content-Type").find("application/json") == std::string::npos) {
            sendError(res, 415, "Content-Type must be application/json");
            return false;
        }
        std::string err;
        out = req.body.empty() ? json::Value::object() : json::parse(req.body, &err);
        if (!err.empty()) { sendError(res, 400, "invalid JSON: " + err); return false; }
        return true;
    }

    void routes() {
        server.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
            const std::string origin = req.get_header_value("Origin");
            if (!origin.empty() && originAllowed(origin)) {
                res.set_header("Access-Control-Allow-Origin", origin);
                res.set_header("Vary", "Origin");
                res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                res.set_header("Access-Control-Allow-Headers", "Content-Type");
            }
            if (req.method == "OPTIONS") {
                res.status = originAllowed(origin) ? 204 : 403;
                return httplib::Server::HandlerResponse::Handled;
            }
            return httplib::Server::HandlerResponse::Unhandled;
        });

        server.Get("/api/status", [this](const httplib::Request&, httplib::Response& res) {
            std::lock_guard<std::mutex> lock(rt.mu);
            sendJson(res, rt.statusJsonLocked());
        });

        server.Get("/live.jpg", [this](const httplib::Request&, httplib::Response& res) {
            std::lock_guard<std::mutex> lock(rt.mu);
            if (rt.jpeg.empty()) { sendError(res, 503, "no live view yet"); return; }
            res.set_header("Cache-Control", "no-store");
            res.set_content(std::string(rt.jpeg.begin(), rt.jpeg.end()), "image/jpeg");
        });

        // MJPEG: one part per new frame. Each provider call blocks until the next frame.
        server.Get("/live.mjpg", [this](const httplib::Request&, httplib::Response& res) {
            res.set_header("Cache-Control", "no-store");
            auto lastSeq = std::make_shared<uint64_t>(0);
            res.set_content_provider("multipart/x-mixed-replace; boundary=cineassistframe",
                [this, lastSeq](size_t, httplib::DataSink& sink) {
                    std::vector<uint8_t> jpg;
                    {
                        std::unique_lock<std::mutex> lock(rt.mu);
                        rt.frameCv.wait_for(lock, std::chrono::seconds(2), [&] { return rt.frameSeq != *lastSeq; });
                        if (rt.frameSeq == *lastSeq || rt.jpeg.empty()) return sink.is_writable();  // keep waiting
                        *lastSeq = rt.frameSeq;
                        jpg = rt.jpeg;
                    }
                    const std::string head = "--cineassistframe\r\nContent-Type: image/jpeg\r\nContent-Length: " +
                                             std::to_string(jpg.size()) + "\r\n\r\n";
                    return sink.write(head.data(), head.size()) &&
                           sink.write(reinterpret_cast<const char*>(jpg.data()), jpg.size()) &&
                           sink.write("\r\n", 2);
                });
        });

        server.Post("/api/project", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            Project p;
            std::string err;
            if (!projectFromJson(b, p, &err)) { sendError(res, 400, err); return; }
            std::lock_guard<std::mutex> lock(rt.mu);
            const size_t sc = rt.session.sceneIndex(), sh = rt.session.shotIndex();
            rt.session.openInMemory(std::move(p));
            rt.havePlan = true;
            rt.session.selectScene(sc);
            rt.session.selectShot(sh);
            sendJson(res, rt.statusJsonLocked());
        });

        // Connect a camera: { backend: "sony"|"sim", address?, model?, user?, password?, fingerprint? }.
        // Network connects run outside the runtime lock so live view keeps flowing meanwhile.
        server.Post("/api/connect", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            const std::string backend = b["backend"].asString("sony");
            if (backend == "sim") {
                std::lock_guard<std::mutex> lock(rt.mu);
                auto sim = makeSimCamera ? makeSimCamera() : nullptr;
                std::string err;
                if (sim) sim->connect("", err);
                rt.swapCameraLocked(std::move(sim));
                rt.backend = "sim";
                rt.autoBackend = false;   // operator chose the simulator explicitly
                rt.noteLocked("Switched to simulator");
                sendJson(res, rt.statusJsonLocked());
                return;
            }
            OnsetRuntime::NetworkCamera net;
            {
                std::lock_guard<std::mutex> lock(rt.mu);
                net = rt.net;
            }
            if (b.has("address")) net.address = b["address"].asString();
            if (b.has("model")) net.model = b["model"].asString();
            if (b.has("user")) net.user = b["user"].asString();
            if (b.has("password") && !b["password"].asString().empty()) net.password = b["password"].asString();
            if (b.has("fingerprint")) net.fingerprint = b["fingerprint"].asString();

            // Hold off the auto-probe, and let one that's already connecting finish:
            // two attempts at once make the camera time one of them out (0x8208).
            rt.manualConnect = true;
            struct Release { OnsetRuntime& r; ~Release() { r.manualConnect = false; } } release{rt};
            const bool waited = rt.probing;
            for (int i = 0; i < 700 && rt.probing; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(100));
            // Give the main loop a tick to switch to a camera the probe just connected.
            if (waited) std::this_thread::sleep_for(std::chrono::milliseconds(600));
            {
                std::lock_guard<std::mutex> lock(rt.mu);
                if (rt.backend != "sim" && rt.camera && rt.camera->isConnected() && net.address.empty()) {
                    rt.noteLocked("✓ Already connected: " + rt.camera->state().model + " via " + rt.camera->connectionLabel());
                    sendJson(res, rt.statusJsonLocked());
                    return;
                }
            }

            std::string name, err, fp;
            auto cam = connectRealCamera(net, "", name, err, fp);

            std::lock_guard<std::mutex> lock(rt.mu);
            rt.pendingFingerprint = cam ? std::string() : fp;
            if (!cam) {
                // Keep the previous working settings; a typo must not break auto-reconnect.
                rt.lastConnectError = err.empty() ? "no camera found" : err;
                rt.noteLocked("✗ Camera connect: " + rt.lastConnectError);
                json::Value o = rt.statusJsonLocked();
                o.set("error", rt.lastConnectError);
                sendJson(res, o, 502);
                return;
            }
            rt.net = net;   // only settings that actually connected are remembered
            if (rt.net.fingerprint.empty()) rt.net.fingerprint = fp;
            saveNetworkCamera(rt.net);
            rt.swapCameraLocked(std::move(cam));
            rt.backend = name;
            rt.autoBackend = true;
            rt.lastConnectError.clear();
            rt.engine.resetShot();
            rt.noteLocked("✓ Connected " + rt.camera->state().model + " via " + rt.camera->connectionLabel());
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/select", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            const int scene = b["scene"].asInt(static_cast<int>(rt.session.sceneIndex()));
            const int shot = b["shot"].asInt(0);
            if (scene < 0 || shot < 0 || !rt.session.selectScene(static_cast<size_t>(scene)) ||
                !rt.session.selectShot(static_cast<size_t>(shot))) {
                sendError(res, 404, "no such scene/shot");
                return;
            }
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/apply", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            json::Value results = json::Value::array();
            if (b["all"].asBool()) {
                // Apply in order, re-evaluating between each so later moves use fresh readings.
                const size_t n = rt.last.adjustments.size();
                for (size_t i = 0; i < n && !rt.last.adjustments.empty(); ++i) {
                    std::string msg;
                    rt.applyLocked(0, msg);
                    results.push(msg);
                    rt.tickLocked();
                }
            } else {
                std::string msg;
                const bool ok = rt.applyLocked(static_cast<size_t>(std::max(0, b["index"].asInt(0))), msg);
                results.push(msg);
                if (!ok) { json::Value o = json::Value::object(); o.set("error", msg); sendJson(res, o, 422); return; }
                rt.tickLocked();
            }
            json::Value o = rt.statusJsonLocked();
            o.set("results", std::move(results));
            sendJson(res, o);
        });

        server.Post("/api/settings", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            CameraAdjustment::Property p;
            if (!propertyFromString(b["property"].asString(), p)) { sendError(res, 400, "unknown property"); return; }
            if (!b["value"].isNumber()) { sendError(res, 400, "value must be a number"); return; }
            std::lock_guard<std::mutex> lock(rt.mu);
            std::string msg;
            const bool ok = rt.setLocked(p, b["value"].asNumber(), msg);
            rt.tickLocked();
            json::Value o = rt.statusJsonLocked();
            o.set("result", msg);
            sendJson(res, o, ok ? 200 : 422);
        });

        server.Post("/api/record", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            if (!rt.camera) { sendError(res, 503, "no camera"); return; }
            std::string err;
            const bool on = b["on"].asBool();
            bool ok;
            {
                std::lock_guard<std::mutex> camLock(rt.cameraMu);
                ok = on ? rt.camera->startRecording(err) : rt.camera->stopRecording(err);
            }
            rt.noteLocked(ok ? (on ? "● REC" : "■ STOP") : "✗ record: " + err);
            rt.tickLocked();
            if (!ok) { sendError(res, 422, err); return; }
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/mode", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            rt.mode = guidanceModeFromString(b["mode"].asString());
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/locks", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            if (b.has("camera")) rt.locks.camera = b["camera"].asBool();
            if (b.has("lighting")) rt.locks.lighting = b["lighting"].asBool();
            if (b.has("framing")) rt.locks.framing = b["framing"].asBool();
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/autoapply", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            rt.autoApply = b["on"].asBool();
            rt.noteLocked(rt.autoApply ? "Auto-apply ON" : "Auto-apply OFF");
            sendJson(res, rt.statusJsonLocked());
        });

        server.Post("/api/complete", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            if (!rt.session.shot()) { sendError(res, 404, "no shot selected"); return; }
            const int cov = rt.session.completeShot(b["notes"].asString());
            json::Value o = rt.statusJsonLocked();
            o.set("coverage", cov);
            sendJson(res, o);
        });

        server.Post("/api/ask", [this](const httplib::Request& req, httplib::Response& res) {
            json::Value b;
            if (!body(req, res, b)) return;
            std::lock_guard<std::mutex> lock(rt.mu);
            EngineInput in;
            in.scene = rt.session.scene();
            in.shot = rt.session.shot();
            in.planned = rt.havePlan ? &rt.session.project().camera : nullptr;
            in.camera = rt.cam;
            in.mode = rt.mode;
            in.locks = rt.locks;
            json::Value o = json::Value::object();
            o.set("answer", answerQuestion(b["question"].asString(), in, &rt.last));
            sendJson(res, o);
        });
    }
};

HttpBridge::HttpBridge(OnsetRuntime& rt) : impl_(std::make_unique<Impl>(rt)) {}

HttpBridge::~HttpBridge() { stop(); }

void HttpBridge::setSimFactory(std::function<std::unique_ptr<ICamera>()> f) { impl_->makeSimCamera = std::move(f); }

bool HttpBridge::start(const std::string& host, int port, std::string& error) {
    impl_->routes();
    if (!impl_->server.bind_to_port(host, port)) {
        error = "cannot listen on " + host + ":" + std::to_string(port) + " (port in use?)";
        return false;
    }
    impl_->thread = std::thread([this] { impl_->server.listen_after_bind(); });
    return true;
}

void HttpBridge::stop() {
    if (impl_ && impl_->thread.joinable()) {
        impl_->server.stop();
        impl_->rt.frameCv.notify_all();
        impl_->thread.join();
    }
}

} // namespace cineassist
