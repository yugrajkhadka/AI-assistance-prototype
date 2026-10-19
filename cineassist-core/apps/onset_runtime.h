// Shared on-set runtime: one camera, one session, one engine — driven by the
// terminal loop and by the HTTP bridge. Every member is guarded by `mu`.
#pragma once

#include "cineassist/camera.h"
#include "cineassist/frame_analyzer.h"
#include "cineassist/guidance_engine.h"
#include "cineassist/json.h"
#include "cineassist/session.h"

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace cineassist {

struct OnsetRuntime {
    std::mutex mu;
    // Serialises camera I/O between the live-view capture thread and everything
    // else (settings, record, camera swaps). Lock order: `mu` before `cameraMu`.
    std::mutex cameraMu;
    std::condition_variable frameCv;   // signalled when a new JPEG is published

    std::unique_ptr<ICamera> camera;
    std::string backend;               // "sim", "sony", ...
    bool autoBackend = false;          // switch sim -> real camera when one appears

    Session session;
    bool havePlan = false;
    FrameAnalyzer analyzer;
    GuidanceEngine engine;

    GuidanceMode mode = GuidanceMode::Suggest;
    LockedAreas locks;
    bool autoApply = false;
    bool logEncoded = false;
    int64_t lastAutoApplyMs = 0;

    CameraState cam;
    EngineOutput last;
    size_t lastScene = static_cast<size_t>(-1), lastShot = static_cast<size_t>(-1);

    Frame frame;                       // latest decoded frame (for analysis / snapshots)
    std::vector<uint8_t> jpeg;         // latest frame as JPEG, for streaming
    uint64_t frameSeq = 0;
    uint64_t analysedSeq = 0;          // last frameSeq the guidance engine looked at
    double liveFps = 0;
    FrameStats lastStats;
    std::vector<std::string> log;      // recent actions, newest last

    // Network (Wi-Fi/LAN) camera settings, reused by auto-reconnect and the probe.
    struct NetworkCamera {
        std::string address;           // "" = discovery only
        std::string model;             // for connect-by-IP when not discoverable
        std::string user, password;    // camera Access Authentication (SSH)
        std::string fingerprint;       // pinned host key ("" = trust on first use)
    } net;
    std::string lastConnectError;
    // Connection coordination (read without `mu`): the auto-probe never runs while
    // the operator is connecting, and a manual connect waits for a probe in flight.
    std::atomic<bool> probing{false};
    std::atomic<bool> manualConnect{false};
    std::string pendingFingerprint;    // seen on a refused/unauthenticated attempt

    explicit OnsetRuntime(EngineConfig cfg) : engine(cfg) {}
    ~OnsetRuntime() { stopCapture(); }

    // Live view runs on its own thread at up to `fps`, independent of the
    // guidance tick, so the preview is smooth. Call without holding `mu`.
    void startCapture(double fps);
    void stopCapture();
    bool captureRunning() const { return captureThread.joinable(); }

    // One tick: read camera + live view, analyse, run guidance, maybe auto-apply.
    // Caller must hold `mu`.
    void tickLocked();

    // Apply one engine proposal (index into last.adjustments). Caller holds `mu`.
    bool applyLocked(size_t index, std::string& message);
    // Set a camera property directly (from UI controls). Caller holds `mu`.
    bool setLocked(CameraAdjustment::Property p, double value, std::string& message);

    void noteLocked(const std::string& msg);

    // Replace the active camera (caller holds `mu`); waits for the capture thread
    // to finish any frame in flight. The old camera is disconnected.
    void swapCameraLocked(std::unique_ptr<ICamera> next);

private:
    void captureLoop(double fps);
    std::thread captureThread;
    std::atomic<bool> captureStop{false};
    int64_t lastFrameMs = 0;
    bool publishFrameLocked(std::vector<uint8_t>& jpg);
public:

    // Full status for UIs. Caller holds `mu`.
    json::Value statusJsonLocked() const;
};

int64_t nowMs();

// Remembered network camera (~/.cineassist/camera-network.json, owner-only), so
// a restart reconnects to the last working Wi-Fi/LAN camera without re-entering
// the access-authentication password.
bool loadSavedNetworkCamera(OnsetRuntime::NetworkCamera& out);
void saveNetworkCamera(const OnsetRuntime::NetworkCamera& net);

// Connect a real (non-sim) camera using the runtime's network settings. Tries a
// direct IP connection when an address is set, otherwise discovery over USB +
// Wi-Fi/LAN. Must be called WITHOUT holding rt.mu (it can take ~10 s).
std::unique_ptr<ICamera> connectRealCamera(const OnsetRuntime::NetworkCamera& net, const std::string& id,
                                           std::string& backendName, std::string& error, std::string& fingerprintSeen);
bool propertyFromString(const std::string& s, CameraAdjustment::Property& out);

} // namespace cineassist
