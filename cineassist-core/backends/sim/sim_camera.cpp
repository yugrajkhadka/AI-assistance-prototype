#include "sim_camera.h"

#include "cineassist/camera_math.h"
#include "cineassist/frame_analyzer.h"
#include "cineassist/image_decode.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace cineassist {

namespace {

constexpr int kWidth = 640;
constexpr int kHeight = 360;

double rec709Oetf(double l) {
    if (l <= 0) return 0;
    if (l < 0.018) return 4.5 * l;
    return std::min(1.0, 1.099 * std::pow(l, 0.45) - 0.099);
}

// Approximate RGB gains a camera applies to light of `sceneK` when balanced for `wbK`.
void wbGains(int sceneK, int wbK, double& r, double& g, double& b) {
    r = g = b = 1.0;
    if (sceneK <= 0 || wbK <= 0) return;
    // Mired shift: positive = scene is warmer than the WB setting -> image renders warm.
    const double shift = 1e6 / sceneK - 1e6 / wbK;
    const double k = shift / 100.0;  // ~100 mired is a strong cast
    r = 1.0 + 0.18 * k;
    b = 1.0 - 0.18 * k;
}

} // namespace

SimCamera::SimCamera() : SimCamera(SimSceneParams()) {}

SimCamera::SimCamera(SimSceneParams params) : params_(std::move(params)) {
    state_.model = "CineAssist Simulator";
    state_.lensModel = "Sim Prime 50mm T2.8";
    state_.fNumber = 2.8;
    state_.iso = 800;
    state_.frameRate = 23.976;
    state_.shutterSeconds = 1.0 / 48.0;
    state_.shutterAngle = 0;  // speed mode, like most mirrorless bodies
    state_.whiteBalanceK = 5600;
    state_.ndStops = 0;
    state_.focalLengthMm = 50;
    state_.batteryPercent = 82;
}

std::vector<CameraInfo> SimCamera::enumerate(int) {
    return {{"sim-0", "CineAssist Simulator", "sim"}};
}

bool SimCamera::connect(const std::string&, std::string& error) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!params_.imagePath.empty() && stillLinear_.empty()) {
        Frame f;
        if (!decodeImageFile(params_.imagePath, f, error)) return false;
        stillW_ = f.width;
        stillH_ = f.height;
        stillLinear_.resize(static_cast<size_t>(f.width) * f.height * 3);
        for (size_t i = 0; i < stillLinear_.size(); ++i)
            stillLinear_[i] = static_cast<float>(rec709ToLinear(f.pixels[i] / 255.0));
        // A still is "correctly exposed" as shot; neutralise the synthetic scene gain.
        params_.sceneGain = 1.0;
    }
    state_.connected = true;
    return true;
}

void SimCamera::disconnect() {
    std::lock_guard<std::mutex> lock(mu_);
    state_.connected = false;
    state_.recording = false;
}

bool SimCamera::isConnected() const {
    std::lock_guard<std::mutex> lock(mu_);
    return state_.connected;
}

CameraState SimCamera::state() {
    std::lock_guard<std::mutex> lock(mu_);
    return state_;
}

void SimCamera::setState(const CameraState& s) {
    std::lock_guard<std::mutex> lock(mu_);
    state_ = s;
}

double SimCamera::exposureFactor() const {
    const double stop = state_.tStop > 0 ? state_.tStop : state_.fNumber;
    const double shutter = state_.shutterSeconds > 0
                               ? state_.shutterSeconds
                               : math::shutterSecondsFromAngle(state_.shutterAngle, state_.frameRate);
    double e = params_.sceneGain;
    e *= (state_.iso > 0 ? state_.iso : 800) / 800.0;
    e *= (shutter > 0 ? shutter : 1.0 / 48.0) / (1.0 / 48.0);
    e *= (2.8 * 2.8) / (stop > 0 ? stop * stop : 2.8 * 2.8);
    e /= std::pow(2.0, state_.ndStops);
    return e;
}

bool SimCamera::liveView(Frame& out) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!state_.connected) return false;
    out.encoded.clear();  // synthetic frames have no camera JPEG
    const double e = exposureFactor();
    double gr, gg, gb;
    wbGains(params_.sceneKelvin, state_.whiteBalanceAuto ? params_.sceneKelvin : state_.whiteBalanceK, gr, gg, gb);
    ++frameCounter_;

    if (!stillLinear_.empty()) {
        out.width = stillW_;
        out.height = stillH_;
        out.format = PixelFormat::RGB8;
        out.pixels.resize(stillLinear_.size());
        for (size_t i = 0; i < stillLinear_.size(); i += 3) {
            out.pixels[i] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(stillLinear_[i] * e * gr)));
            out.pixels[i + 1] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(stillLinear_[i + 1] * e * gg)));
            out.pixels[i + 2] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(stillLinear_[i + 2] * e * gb)));
        }
    } else {
        out.width = kWidth;
        out.height = kHeight;
        out.format = PixelFormat::RGB8;
        out.pixels.resize(static_cast<size_t>(kWidth) * kHeight * 3);
        const double sx = params_.subjectX * kWidth, sy = params_.subjectY * kHeight;
        const double radius = kHeight * 0.22;
        // Focus error lowers texture contrast and widens edges.
        const double detail = std::clamp(1.0 - params_.focusError, 0.0, 1.0);
        const int period = 6 + static_cast<int>(params_.focusError * 20);
        for (int y = 0; y < kHeight; ++y) {
            for (int x = 0; x < kWidth; ++x) {
                // Base room: soft vertical falloff, mid-grey at reference exposure.
                double l = 0.18 * (0.6 + 0.8 * (1.0 - static_cast<double>(y) / kHeight));
                // Hot window, top-left.
                if (x > kWidth * 0.05 && x < kWidth * 0.28 && y > kHeight * 0.08 && y < kHeight * 0.55)
                    l = 0.18 * params_.windowGain * 2.0;
                // Subject: textured disc so the analyser has edges to measure.
                const double dx = x - sx, dy = y - sy;
                const double d = std::sqrt(dx * dx + dy * dy);
                if (d < radius) {
                    const bool check = ((x / period) + (y / period)) % 2 == 0;
                    l = 0.22 * (1.0 + (check ? 0.6 : -0.6) * detail);
                }
                // Gentle sensor noise, rises with ISO.
                const uint32_t h = static_cast<uint32_t>(x * 73856093u ^ y * 19349663u ^ static_cast<uint32_t>(frameCounter_) * 83492791u);
                const double noise = ((h % 1000) / 1000.0 - 0.5) * 0.004 * (state_.iso / 800.0);
                const double v = l * e;
                uint8_t* p = &out.pixels[(static_cast<size_t>(y) * kWidth + x) * 3];
                p[0] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(std::max(0.0, v * gr + noise))));
                p[1] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(std::max(0.0, v * gg + noise))));
                p[2] = static_cast<uint8_t>(std::lround(255 * rec709Oetf(std::max(0.0, v * gb + noise))));
            }
        }
    }
    out.logEncoded = false;
    out.timestampMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now().time_since_epoch()).count();
    return true;
}

bool SimCamera::apply(const CameraAdjustment& adj, std::string& error) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!state_.connected) { error = "not connected"; return false; }
    switch (adj.property) {
        case CameraAdjustment::Property::FNumber: state_.fNumber = adj.value; state_.tStop = 0; break;
        case CameraAdjustment::Property::Iso: state_.iso = static_cast<int>(std::lround(adj.value)); state_.isoAuto = false; break;
        case CameraAdjustment::Property::ShutterSeconds: state_.shutterSeconds = adj.value; state_.shutterAngle = 0; break;
        case CameraAdjustment::Property::ShutterAngle:
            state_.shutterSeconds = math::shutterSecondsFromAngle(adj.value, state_.frameRate);
            state_.shutterAngle = 0;
            break;
        case CameraAdjustment::Property::WhiteBalanceK:
            state_.whiteBalanceK = static_cast<int>(std::lround(adj.value));
            state_.whiteBalanceAuto = false;
            break;
        case CameraAdjustment::Property::NdStops: state_.ndStops = std::max(0.0, adj.value); break;
        case CameraAdjustment::Property::FrameRate: {
            // Keep the same shutter angle across a frame-rate change, like a cinema body.
            const double angle = math::shutterAngleFromSeconds(state_.shutterSeconds, state_.frameRate);
            state_.frameRate = adj.value;
            if (angle > 0) state_.shutterSeconds = math::shutterSecondsFromAngle(angle, state_.frameRate);
            break;
        }
    }
    return true;
}

bool SimCamera::startRecording(std::string& error) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!state_.connected) { error = "not connected"; return false; }
    state_.recording = true;
    return true;
}

bool SimCamera::stopRecording(std::string& error) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!state_.connected) { error = "not connected"; return false; }
    state_.recording = false;
    return true;
}

} // namespace cineassist
