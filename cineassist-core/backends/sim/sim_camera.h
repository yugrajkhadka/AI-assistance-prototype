// Simulated camera backend.
//
// Renders a synthetic scene (or a still image from disk) whose exposure, colour
// and sharpness respond physically to the camera settings, so the full guidance
// loop — measure, advise, apply, re-measure — can be exercised without hardware.
#pragma once

#include "cineassist/camera.h"

#include <mutex>

namespace cineassist {

struct SimSceneParams {
    double sceneGain = 4.0;        // scene brightness vs. "correct" at f/2.8, ISO 800, 1/48, clear
    int sceneKelvin = 5600;        // colour temperature of the light
    double focusError = 0.0;       // 0 = sharp, 1 = very soft
    double subjectX = 0.62, subjectY = 0.38;
    double windowGain = 3.0;       // relative brightness of the hot window in frame
    std::string imagePath;         // optional: use a still (JPEG/PNG/PPM) instead of the synthetic scene
};

class SimCamera : public ICamera {
public:
    SimCamera();
    explicit SimCamera(SimSceneParams params);

    std::string backendName() const override { return "sim"; }
    std::vector<CameraInfo> enumerate(int timeoutSec) override;
    bool connect(const std::string& id, std::string& error) override;
    void disconnect() override;
    bool isConnected() const override;
    CameraState state() override;
    bool liveView(Frame& out) override;
    bool apply(const CameraAdjustment& adj, std::string& error) override;
    bool startRecording(std::string& error) override;
    bool stopRecording(std::string& error) override;

    // Test hooks.
    void setState(const CameraState& s);
    SimSceneParams& scene() { return params_; }

private:
    double exposureFactor() const;  // linear multiplier vs. reference exposure

    mutable std::mutex mu_;
    CameraState state_;
    SimSceneParams params_;
    std::vector<float> stillLinear_;   // linearised still image (RGB), if loaded
    int stillW_ = 0, stillH_ = 0;
    int64_t frameCounter_ = 0;
};

} // namespace cineassist
