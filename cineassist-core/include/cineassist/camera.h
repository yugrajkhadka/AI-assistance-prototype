// CineAssist Core — camera backend interface.
//
// Every camera SDK (Sony Camera Remote SDK, Canon EDSDK, Blackmagic REST, RED
// R.C.P., a UVC capture card, or the camera's own firmware HAL) plugs in by
// implementing ICamera. The engine only ever talks to this interface.
#pragma once

#include "cineassist/guidance_engine.h"
#include "cineassist/types.h"

#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace cineassist {

// An owned, decoded live-view frame.
struct Frame {
    std::vector<uint8_t> pixels;
    int width = 0;
    int height = 0;
    PixelFormat format = PixelFormat::RGB8;
    bool logEncoded = false;
    int64_t timestampMs = 0;
    // The camera's original JPEG, when the source delivers one (Sony live view).
    // Lets the HTTP bridge stream frames without re-encoding.
    std::vector<uint8_t> encoded;

    FrameView view() const {
        FrameView v;
        v.data = pixels.empty() ? nullptr : pixels.data();
        v.width = width;
        v.height = height;
        v.format = format;
        v.logEncoded = logEncoded;
        return v;
    }
};

struct CameraInfo {
    std::string id;       // backend-specific, passed back to connect()
    std::string model;
    std::string connection; // "USB", "IP", "sim", ...
};

class ICamera {
public:
    virtual ~ICamera() = default;

    virtual std::string backendName() const = 0;

    // Discover cameras reachable by this backend.
    virtual std::vector<CameraInfo> enumerate(int timeoutSec = 3) = 0;
    // Connect to one camera (empty id = first found). Returns false with `error` set.
    virtual bool connect(const std::string& id, std::string& error) = 0;
    virtual void disconnect() = 0;
    virtual bool isConnected() const = 0;

    // Read the current settings. Cheap; backends cache and refresh on property events.
    virtual CameraState state() = 0;
    // Grab the latest decoded live-view frame. Returns false if none is available.
    virtual bool liveView(Frame& out) = 0;
    // Latest live-view frame as JPEG bytes, for streaming. Backends whose camera
    // already sends JPEG (Sony) override this to skip decoding; the default grabs a
    // frame and encodes it. Returns false when no new frame is ready yet.
    virtual bool liveViewJpeg(std::vector<uint8_t>& out);

    // Apply an engine-proposed change. Returns false (with error) if the body or
    // lens refuses it — e.g. the iris is on a manual cine lens.
    virtual bool apply(const CameraAdjustment& adj, std::string& error) = 0;

    virtual bool startRecording(std::string& error) = 0;
    virtual bool stopRecording(std::string& error) = 0;

    // ─── Network cameras (optional) ──────────────────────────────────────────
    // Credentials for bodies with network access authentication (SSH). An
    // `expectedFingerprint` pins the camera's host key; a mismatch refuses to connect.
    virtual void setCredentials(const std::string& user, const std::string& password,
                                const std::string& expectedFingerprint) {}
    // Host-key fingerprint seen on the last network connect ("" for USB).
    virtual std::string fingerprint() const { return ""; }
    // Human-readable link: "USB", "Wi-Fi/LAN 192.168.122.1", "Wi-Fi (reconnecting)".
    virtual std::string connectionLabel() const { return ""; }
};

using CameraFactory = std::function<std::unique_ptr<ICamera>()>;

// Backend registry. Backends compiled in register themselves at start-up.
void registerCameraBackend(const std::string& name, CameraFactory factory);
std::vector<std::string> availableCameraBackends();
std::unique_ptr<ICamera> createCamera(const std::string& backend);

} // namespace cineassist
