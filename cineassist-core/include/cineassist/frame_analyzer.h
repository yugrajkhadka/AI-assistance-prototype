// CineAssist Core — live-view frame analysis.
//
// Designed for a camera/accessory SoC: integer-heavy, sub-samples the frame to a
// fixed analysis grid (default ≤ 320 px wide), and performs no heap allocation per
// frame after construction. Typical cost on a 1080p RGB frame is well under 2 ms
// on a desktop CPU and ~5–10 ms on a Cortex-A53.
#pragma once

#include "cineassist/types.h"

#include <vector>

namespace cineassist {

struct AnalyzerConfig {
    int maxAnalysisWidth = 320;        // frame is sub-sampled to at most this width
    // Display-referred (Rec.709) thresholds; log footage uses the log* values.
    double clipThreshold = 0.98;
    double crushThreshold = 0.02;
    double logClipThreshold = 0.90;    // S-Log3 / LogC sit well below 1.0 at clip
    double logCrushThreshold = 0.10;
    double logMidGrey = 0.41;          // S-Log3 18% grey ≈ 41% code value
    double logCodePerStop = 0.075;     // S-Log3 ≈ 7.5% code value per stop
};

class FrameAnalyzer {
public:
    explicit FrameAnalyzer(AnalyzerConfig cfg = {});

    // Analyse one frame. Returns stats with valid=false if the frame is unusable.
    FrameStats analyze(const FrameView& frame);

    const AnalyzerConfig& config() const { return cfg_; }

private:
    AnalyzerConfig cfg_;
    std::vector<uint8_t> luma_;       // reused analysis buffer
};

// Inverse BT.709 OETF: code value (0..1) -> scene-linear.
double rec709ToLinear(double v);

} // namespace cineassist
