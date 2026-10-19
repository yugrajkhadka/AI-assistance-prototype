#include "cineassist/frame_analyzer.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace cineassist {

namespace {

int bytesPerPixel(PixelFormat f) {
    switch (f) {
        case PixelFormat::Gray8: return 1;
        case PixelFormat::RGB8: return 3;
        case PixelFormat::RGBA8:
        case PixelFormat::BGRA8: return 4;
        case PixelFormat::YUV420P: return 1;  // luma plane
    }
    return 1;
}

// Rec.709 luma weights in 8.8 fixed point (0.2126, 0.7152, 0.0722).
inline uint8_t lumaOf(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((54 * r + 183 * g + 19 * b + 128) >> 8);
}

} // namespace

double rec709ToLinear(double v) {
    if (v <= 0) return 0;
    if (v < 0.081) return v / 4.5;
    return std::pow((v + 0.099) / 1.099, 1.0 / 0.45);
}

FrameAnalyzer::FrameAnalyzer(AnalyzerConfig cfg) : cfg_(cfg) {
    luma_.reserve(static_cast<size_t>(cfg_.maxAnalysisWidth) * cfg_.maxAnalysisWidth);
}

FrameStats FrameAnalyzer::analyze(const FrameView& frame) {
    FrameStats st;
    if (!frame.data || frame.width < 8 || frame.height < 8) return st;

    const int bpp = bytesPerPixel(frame.format);
    const int stride = frame.strideBytes > 0 ? frame.strideBytes : frame.width * bpp;
    const int step = std::max(1, (frame.width + cfg_.maxAnalysisWidth - 1) / cfg_.maxAnalysisWidth);
    const int w = frame.width / step;
    const int h = frame.height / step;
    if (w < 8 || h < 8) return st;
    luma_.resize(static_cast<size_t>(w) * h);

    // Pass 1: sub-sample to luma, histogram, and neutral-pixel colour sums.
    uint32_t hist[256] = {0};
    uint64_t sumLuma = 0;
    uint64_t neutralR = 0, neutralG = 0, neutralB = 0, neutralN = 0;
    const bool hasColour = frame.format == PixelFormat::RGB8 || frame.format == PixelFormat::RGBA8 ||
                           frame.format == PixelFormat::BGRA8;

    for (int y = 0; y < h; ++y) {
        const uint8_t* row = frame.data + static_cast<size_t>(y) * step * stride;
        uint8_t* out = &luma_[static_cast<size_t>(y) * w];
        for (int x = 0; x < w; ++x) {
            const uint8_t* p = row + static_cast<size_t>(x) * step * bpp;
            uint8_t yv;
            if (hasColour) {
                uint8_t r, g, b;
                if (frame.format == PixelFormat::BGRA8) { b = p[0]; g = p[1]; r = p[2]; }
                else { r = p[0]; g = p[1]; b = p[2]; }
                yv = lumaOf(r, g, b);
                // Near-neutral, mid-tone pixels drive the white-balance estimate (grey-world on greys).
                const int mx = std::max(r, std::max(g, b));
                const int mn = std::min(r, std::min(g, b));
                if (yv > 40 && yv < 220 && (mx - mn) * 100 < mx * 35) {
                    neutralR += r; neutralG += g; neutralB += b; ++neutralN;
                }
            } else {
                yv = p[0];
            }
            out[x] = yv;
            ++hist[yv];
            sumLuma += yv;
        }
    }

    const uint64_t n = static_cast<uint64_t>(w) * h;
    st.meanLuma = static_cast<double>(sumLuma) / n / 255.0;

    // Percentiles from the histogram.
    auto percentile = [&](double q) {
        const uint64_t target = static_cast<uint64_t>(q * n);
        uint64_t acc = 0;
        for (int i = 0; i < 256; ++i) {
            acc += hist[i];
            if (acc > target) return i / 255.0;
        }
        return 1.0;
    };
    st.medianLuma = percentile(0.5);
    const double p5 = std::max(percentile(0.05), 1.0 / 255.0);
    const double p95 = std::max(percentile(0.95), p5);

    const double clipT = frame.logEncoded ? cfg_.logClipThreshold : cfg_.clipThreshold;
    const double crushT = frame.logEncoded ? cfg_.logCrushThreshold : cfg_.crushThreshold;
    uint64_t clipped = 0, crushed = 0;
    for (int i = 0; i < 256; ++i) {
        const double v = i / 255.0;
        if (v >= clipT) clipped += hist[i];
        if (v <= crushT) crushed += hist[i];
        st.histogram[i >> 2] += hist[i];
    }
    st.clippedFraction = static_cast<double>(clipped) / n;
    st.crushedFraction = static_cast<double>(crushed) / n;

    // Exposure offset in stops: compare a robust "key" level against mid-grey.
    // Key = mean of median and mean luma, which tracks a grey card better than either alone.
    const double key = 0.5 * (st.medianLuma + st.meanLuma);
    if (frame.logEncoded) {
        st.evOffset = (key - cfg_.logMidGrey) / cfg_.logCodePerStop;
        st.contrastRatio = (p95 - p5) / cfg_.logCodePerStop;
    } else {
        const double lin = std::max(rec709ToLinear(key), 1e-4);
        st.evOffset = std::log2(lin / 0.18);
        st.contrastRatio = std::log2(std::max(rec709ToLinear(p95), 1e-4) / std::max(rec709ToLinear(p5), 1e-4));
    }

    // Pass 2: Sobel gradient energy (Tenengrad) for focus, plus a detail-weighted
    // centroid that approximates where the eye goes (subject position).
    uint64_t energy = 0, centerEnergy = 0, centerN = 0;
    double wx = 0, wy = 0, wsum = 0;
    const int cx0 = w / 3, cx1 = 2 * w / 3, cy0 = h / 3, cy1 = 2 * h / 3;
    for (int y = 1; y < h - 1; ++y) {
        const uint8_t* a = &luma_[static_cast<size_t>(y - 1) * w];
        const uint8_t* b = &luma_[static_cast<size_t>(y) * w];
        const uint8_t* c = &luma_[static_cast<size_t>(y + 1) * w];
        for (int x = 1; x < w - 1; ++x) {
            const int gx = (a[x + 1] + 2 * b[x + 1] + c[x + 1]) - (a[x - 1] + 2 * b[x - 1] + c[x - 1]);
            const int gy = (c[x - 1] + 2 * c[x] + c[x + 1]) - (a[x - 1] + 2 * a[x] + a[x + 1]);
            const uint32_t g2 = static_cast<uint32_t>(gx * gx + gy * gy);
            energy += g2;
            if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) { centerEnergy += g2; ++centerN; }
            // Only strong edges count toward the subject centroid, so flat sky doesn't pull it.
            if (g2 > 4096) {
                const double wgt = std::sqrt(static_cast<double>(g2));
                wx += wgt * x; wy += wgt * y; wsum += wgt;
            }
        }
    }
    const uint64_t inner = static_cast<uint64_t>(w - 2) * (h - 2);
    // Normalise: Sobel energy is in [0, (4*255)^2*2]. Map to 0..1 with a soft knee so
    // typical in-focus footage lands ~0.4–0.8 regardless of resolution.
    auto norm = [](double meanG2) { return 1.0 - std::exp(-std::sqrt(meanG2) / 120.0); };
    st.sharpness = norm(static_cast<double>(energy) / std::max<uint64_t>(inner, 1));
    st.centerSharpness = norm(static_cast<double>(centerEnergy) / std::max<uint64_t>(centerN, 1));
    if (wsum > 0) {
        st.subjectX = (wx / wsum) / w;
        st.subjectY = (wy / wsum) / h;
    }

    if (hasColour && neutralN > n / 200) {
        const double r = static_cast<double>(neutralR) / neutralN;
        const double g = static_cast<double>(neutralG) / neutralN;
        const double b = static_cast<double>(neutralB) / neutralN;
        st.colorCastRB = (r - b) / std::max(r + b, 1.0);
        st.colorCastG = (g - 0.5 * (r + b)) / std::max(g + 0.5 * (r + b), 1.0);
    }

    st.valid = true;
    return st;
}

} // namespace cineassist
