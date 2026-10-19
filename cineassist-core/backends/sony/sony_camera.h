// Sony Camera Remote SDK (CrSDK v2.x) backend.
//
// Supported bodies are whatever CrSDK supports (FX3/FX30/FX6/FX9/BURANO/VENICE 2,
// α1/α7S III/α7 IV/α9 III, ...) over USB or Ethernet. Reads exposure state through
// device properties, pulls JPEG live view, and applies engine adjustments by
// snapping to the nearest value the body reports as settable.
//
// Connection ids accepted by connect():
//   ""                      first camera found (USB or network discovery)
//   "<model or MAC/serial>" a specific discovered camera
//   "ip:<address>[:<model>]" a network camera by IP, e.g. "ip:192.168.122.1:ILCE-7M4"
//                            (needed when discovery is blocked, e.g. across subnets)
// Network access authentication (SSH) credentials come from setCredentials() or
// the environment: CINEASSIST_SONY_USER, CINEASSIST_SONY_PASSWORD,
// CINEASSIST_SONY_FINGERPRINT (optional host-key pin).
#pragma once

#include "cineassist/camera.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <map>
#include <memory>
#include <mutex>

namespace cineassist {

class SonyCamera : public ICamera {
public:
    SonyCamera();
    ~SonyCamera() override;

    std::string backendName() const override { return "sony"; }
    std::vector<CameraInfo> enumerate(int timeoutSec) override;
    bool connect(const std::string& id, std::string& error) override;
    void disconnect() override;
    bool isConnected() const override;
    CameraState state() override;
    bool liveView(Frame& out) override;
    bool liveViewJpeg(std::vector<uint8_t>& out) override;
    bool apply(const CameraAdjustment& adj, std::string& error) override;
    bool startRecording(std::string& error) override;
    bool stopRecording(std::string& error) override;
    void setCredentials(const std::string& user, const std::string& password,
                        const std::string& expectedFingerprint) override;
    std::string fingerprint() const override;
    std::string connectionLabel() const override;

    // Called from the SDK's callback thread.
    struct Impl;

private:
    void refreshProperties();
    bool setProperty(uint32_t code, uint64_t value, uint32_t valueType, std::string& error);
    // Nearest settable value for `code` under `score` (lower is better); false if none.
    bool nearestSettable(uint32_t code, const std::function<double(uint64_t)>& score, uint64_t& out, uint32_t& type);

    std::unique_ptr<Impl> impl_;
};

} // namespace cineassist
