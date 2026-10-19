// Local HTTP bridge: lets the CineAssist web app (or any monitor UI) show the
// camera's live view and guidance, and drive the physical camera.
//
//   GET  /api/status            full engine state (JSON)
//   GET  /live.mjpg             live view as MJPEG (works in an <img> tag; no
//                               browser camera permission involved)
//   GET  /live.jpg              latest single frame
//   POST /api/connect           { backend:"sony", address?, model?, user?, password?, fingerprint? }
//                               or { backend:"sim" }       — USB / Wi-Fi / IP camera connect
//   POST /api/project           { scenes, cameraSettings }  — plan from the web app
//   POST /api/select            { scene, shot }
//   POST /api/apply             { index } | { all: true }
//   POST /api/settings          { property, value }         — e.g. {"property":"iso","value":1600}
//   POST /api/record            { on: true|false }
//   POST /api/mode              { mode: "suggest"|"assist"|"lock" }
//   POST /api/locks             { camera, lighting, framing }
//   POST /api/autoapply         { on: true|false }
//   POST /api/complete          { notes }
//   POST /api/ask               { question } -> { answer }
#pragma once

#include "onset_runtime.h"

#include <functional>
#include <memory>
#include <string>

namespace cineassist {

class HttpBridge {
public:
    explicit HttpBridge(OnsetRuntime& rt);

    // Factory used when the operator switches back to the simulator.
    void setSimFactory(std::function<std::unique_ptr<ICamera>()> f);
    ~HttpBridge();

    // Starts serving on a background thread. Returns false if the port is taken.
    bool start(const std::string& host, int port, std::string& error);
    void stop();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace cineassist
