// CineAssist Core — on-set guidance engine.
//
// Deterministic, offline replacement for the web app's LLM-backed on-set guidance
// (server/src/routes/onset.js + src/pages/onset/GuidancePanel.jsx). It combines:
//   * the plan (scene, shot, planned camera package),
//   * the live camera state reported by any backend,
//   * statistics measured from the live-view image,
// and emits prioritised Guidance items plus concrete CameraAdjustments that a
// backend can apply. No network, no model weights: safe to run inside a camera
// or on an attached accessory SoC.
#pragma once

#include "cineassist/types.h"

#include <string>
#include <vector>

namespace cineassist {

// A concrete change the engine proposes. Backends apply these via ICamera::apply().
struct CameraAdjustment {
    enum class Property { FNumber, Iso, ShutterSeconds, ShutterAngle, WhiteBalanceK, NdStops, FrameRate };
    Property property = Property::FNumber;
    double value = 0;
    std::string label;          // "Set iris to f/4"
    std::string guidanceId;     // which Guidance item this resolves
};

const char* toString(CameraAdjustment::Property p);

struct EngineConfig {
    int mainsHz = 60;                 // 50 in PAL regions; drives flicker checks
    double defaultShutterAngle = 180;
    double clipWarnFraction = 0.005;  // 0.5% of frame clipped -> warn
    double clipHighFraction = 0.02;   // 2% -> high severity
    double underExposeStops = -1.0;
    double overExposeStops = 1.0;
    double focusDropRatio = 0.65;     // centre sharpness below 65% of peak -> drift
    double smoothing = 0.25;          // EMA factor for frame stats (0..1, 1 = no smoothing)
    double maxNdStops = 7;            // largest ND available on the package
    double ndStep = 1;                // ND granularity (1 stop for fixed ND, 1/3 for variable)
};

struct EngineInput {
    const Scene* scene = nullptr;
    const Shot* shot = nullptr;
    const PlannedSettings* planned = nullptr;
    CameraState camera;
    FrameStats frame;                 // valid=false if no live view this tick
    GuidanceMode mode = GuidanceMode::Suggest;
    LockedAreas locks;
};

struct EngineOutput {
    std::vector<Guidance> guidance;               // sorted, most severe first
    std::vector<CameraAdjustment> adjustments;    // ordered: most production-safe first
    DeviationReport deviations;
    FrameStats smoothedFrame;
    int readiness = 100;                          // 0..100 "ready to roll" score
};

class GuidanceEngine {
public:
    explicit GuidanceEngine(EngineConfig cfg = {});

    // Evaluate one tick. Call at live-view rate or slower (5–10 Hz is plenty).
    EngineOutput evaluate(const EngineInput& in);

    // Reset per-shot memory (focus peak, smoothing) — call when the shot changes.
    void resetShot();

    const EngineConfig& config() const { return cfg_; }
    EngineConfig& config() { return cfg_; }

private:
    EngineConfig cfg_;
    FrameStats smoothed_;
    bool haveSmoothed_ = false;
    double lastExposureKey_ = 0;   // log2 of the camera's exposure; a change invalidates smoothing
    double focusPeak_ = 0;
};

// Plan vs. live comparison — deterministic port of DEVIATION_CHECK_PROMPT.
DeviationReport checkDeviations(const Shot* shot, const PlannedSettings& planned, const CameraState& live);

// Scene coverage (% of shots approved or completed on set).
int sceneCoverage(const Scene& scene);

// Offline Q&A for the operator ("what lens for the reverse?"). Uses the same
// plan context the web app sends to the LLM, answered by rules.
std::string answerQuestion(const std::string& question, const EngineInput& ctx, const EngineOutput* last = nullptr);

} // namespace cineassist
