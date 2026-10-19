#include "cineassist/guidance_engine.h"

#include "cineassist/camera_math.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <sstream>

namespace cineassist {

namespace {

std::string lower(const std::string& s) {
    std::string out(s);
    for (auto& c : out) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return out;
}

bool containsAny(const std::string& haystackLower, std::initializer_list<const char*> needles) {
    for (const char* n : needles) {
        if (haystackLower.find(n) != std::string::npos) return true;
    }
    return false;
}

double roundToThird(double stops) { return std::round(stops * 3.0) / 3.0; }
double roundUpToStep(double v, double step) { return step > 0 ? std::ceil(v / step - 1e-6) * step : v; }

std::string fmt(const char* f, double a) {
    char buf[128];
    std::snprintf(buf, sizeof buf, f, a);
    return buf;
}

// The aperture the camera is actually at, preferring the lens-reported T-stop.
double liveStop(const CameraState& c) { return c.tStop > 0 ? c.tStop : c.fNumber; }

// Shutter angle the camera is running, derived from speed when needed.
double liveAngle(const CameraState& c) {
    if (c.shutterAngle > 0) return c.shutterAngle;
    return math::shutterAngleFromSeconds(c.shutterSeconds, c.frameRate);
}

int severityPenalty(Severity s) {
    switch (s) {
        case Severity::Critical: return 40;
        case Severity::High: return 20;
        case Severity::Medium: return 8;
        case Severity::Low: return 3;
        case Severity::Info: return 0;
    }
    return 0;
}

bool isLockedCategory(const LockedAreas& locks, Category c) {
    switch (c) {
        case Category::Exposure:
        case Category::Shutter:
        case Category::Iso:
        case Category::Lens:
        case Category::Nd:
        case Category::FrameRate:
        case Category::WhiteBalance:
        case Category::Focus:
            return locks.camera;
        case Category::Lighting:
            return locks.lighting;
        case Category::Composition:
            return locks.framing;
        default:
            return false;
    }
}

// Nearest native ISO in the given direction (+1 brighter, -1 darker); 0 if none.
int nextNativeIso(const std::vector<int>& natives, int current, int dir) {
    int best = 0;
    for (int iso : natives) {
        if (dir > 0 && iso > current && (best == 0 || iso < best)) best = iso;
        if (dir < 0 && iso < current && (best == 0 || iso > best)) best = iso;
    }
    return best;
}

struct ExposureLimits {
    double minStop = 1.4, maxStop = 16;   // widest / smallest allowed aperture
    int minIso = 100, maxIso = 12800;
};

ExposureLimits limitsFor(const PlannedSettings* p) {
    ExposureLimits l;
    if (!p) return l;
    if (p->tStopMin > 0) l.minStop = p->tStopMin;
    else if (p->tStop > 0) l.minStop = math::apertureAfterStops(p->tStop, -1);
    if (p->tStopMax > 0) l.maxStop = p->tStopMax;
    else if (p->tStop > 0) l.maxStop = math::apertureAfterStops(p->tStop, 2);
    if (p->isoMin > 0) l.minIso = p->isoMin;
    if (p->isoMax > 0) l.maxIso = p->isoMax;
    if (l.minStop > l.maxStop) std::swap(l.minStop, l.maxStop);
    return l;
}

class Collector {
public:
    Collector(const EngineInput& in) : in_(in) {}

    void add(Guidance g) {
        if (in_.mode == GuidanceMode::Lock && isLockedCategory(in_.locks, g.category)) g.blockedByLock = true;
        items.push_back(std::move(g));
    }

    std::vector<Guidance> items;

private:
    const EngineInput& in_;
};

// ─── Exposure solver ───────────────────────────────────────────────────────────
// `need` = stops of light to ADD (negative = remove). Returns ordered adjustments
// using the most production-safe levers first: ND (keeps DOF and motion), native
// ISO, iris within the planned range. Never touches shutter (protects cadence).
// `remaining` receives whatever the camera can't absorb (must come from lighting).
std::vector<CameraAdjustment> solveExposure(double need, const CameraState& cam, const PlannedSettings* planned,
                                            const EngineConfig& cfg, const std::string& gid, double& remaining) {
    std::vector<CameraAdjustment> out;
    remaining = roundToThird(need);
    if (std::fabs(remaining) < 1.0 / 6.0) { remaining = 0; return out; }
    const ExposureLimits lim = limitsFor(planned);
    const double stop = liveStop(cam);

    if (remaining < 0) {
        // Too bright. 1) ND in.
        double cut = -remaining;
        if (cam.ndStops + 1e-6 < cfg.maxNdStops) {
            const double add = std::min(roundUpToStep(cut, cfg.ndStep), cfg.maxNdStops - cam.ndStops);
            if (add > 0) {
                CameraAdjustment a{CameraAdjustment::Property::NdStops, cam.ndStops + add,
                                   "Add ND: " + math::formatStops(-add).substr(1) + " (ND " +
                                       fmt("%.1f", math::ndStopsToDensity(cam.ndStops + add)) + " total)", gid};
                out.push_back(a);
                cut -= add;
            }
        }
        // 2) Lower ISO to a native/lower value.
        if (cut > 1.0 / 6.0 && cam.iso > 0 && !cam.isoAuto) {
            int target = planned ? nextNativeIso(planned->nativeIsos, cam.iso, -1) : 0;
            if (target <= 0) target = static_cast<int>(std::lround(cam.iso / std::pow(2.0, std::min(cut, 1.0))));
            target = std::max(target, lim.minIso);
            if (target < cam.iso) {
                out.push_back({CameraAdjustment::Property::Iso, static_cast<double>(target),
                               "Drop ISO to " + std::to_string(target), gid});
                cut -= math::isoStops(target, cam.iso);
            }
        }
        // 3) Stop down within the planned range.
        if (cut > 1.0 / 6.0 && stop > 0) {
            const double target = std::min(math::nearestThirdStopAperture(math::apertureAfterStops(stop, cut)), lim.maxStop);
            if (target > stop + 1e-6) {
                out.push_back({CameraAdjustment::Property::FNumber, target,
                               "Close iris to " + math::formatAperture(target, cam.tStop > 0), gid});
                cut -= math::apertureStops(stop, target);
            }
        }
        remaining = cut > 1.0 / 6.0 ? -roundToThird(cut) : 0;
    } else {
        // Too dark. 1) Pull ND.
        double gain = remaining;
        if (cam.ndStops > 0) {
            const double pull = std::min(cam.ndStops, roundUpToStep(gain, cfg.ndStep));
            out.push_back({CameraAdjustment::Property::NdStops, cam.ndStops - pull,
                           pull >= cam.ndStops ? std::string("Pull ND to clear")
                                               : "Reduce ND to ND " + fmt("%.1f", math::ndStopsToDensity(cam.ndStops - pull)),
                           gid});
            gain -= pull;
        }
        // 2) Next native ISO up (cleanest gain on dual-base sensors).
        if (gain > 1.0 / 6.0 && cam.iso > 0 && !cam.isoAuto) {
            int target = planned ? nextNativeIso(planned->nativeIsos, cam.iso, +1) : 0;
            if (target <= 0 || math::isoStops(cam.iso, target) > gain + 0.5)
                target = static_cast<int>(std::lround(cam.iso * std::pow(2.0, std::min(gain, 1.0))));
            target = std::min(target, lim.maxIso);
            if (target > cam.iso) {
                out.push_back({CameraAdjustment::Property::Iso, static_cast<double>(target),
                               "Raise ISO to " + std::to_string(target), gid});
                gain -= math::isoStops(cam.iso, target);
            }
        }
        // 3) Open up, but not past the widest stop the plan allows.
        if (gain > 1.0 / 6.0 && stop > 0) {
            const double target = std::max(math::nearestThirdStopAperture(math::apertureAfterStops(stop, -gain)), lim.minStop);
            if (target < stop - 1e-6) {
                out.push_back({CameraAdjustment::Property::FNumber, target,
                               "Open iris to " + math::formatAperture(target, cam.tStop > 0), gid});
                gain -= math::apertureStops(target, stop);
            }
        }
        remaining = gain > 1.0 / 6.0 ? roundToThird(gain) : 0;
    }
    return out;
}

std::string shotLensText(const Shot* shot) {
    if (!shot) return "";
    if (shot->focalLengthMm > 0) return std::to_string(static_cast<int>(std::lround(shot->focalLengthMm))) + "mm";
    return shot->lens;
}

} // namespace

const char* toString(CameraAdjustment::Property p) {
    switch (p) {
        case CameraAdjustment::Property::FNumber: return "fNumber";
        case CameraAdjustment::Property::Iso: return "iso";
        case CameraAdjustment::Property::ShutterSeconds: return "shutterSeconds";
        case CameraAdjustment::Property::ShutterAngle: return "shutterAngle";
        case CameraAdjustment::Property::WhiteBalanceK: return "whiteBalanceK";
        case CameraAdjustment::Property::NdStops: return "ndStops";
        case CameraAdjustment::Property::FrameRate: return "frameRate";
    }
    return "unknown";
}

// ─── Deviations ────────────────────────────────────────────────────────────────

DeviationReport checkDeviations(const Shot* shot, const PlannedSettings& planned, const CameraState& live) {
    DeviationReport r;

    // Lens
    const double plannedFocal = shot && shot->focalLengthMm > 0 ? shot->focalLengthMm : planned.focalLengthMm;
    if (plannedFocal > 0 && live.focalLengthMm > 0) {
        const double ratio = live.focalLengthMm / plannedFocal;
        if (std::fabs(ratio - 1.0) > 0.1) {
            Deviation d;
            d.aspect = "Lens focal length";
            d.planned = fmt("%.0fmm", plannedFocal);
            d.actual = fmt("%.0fmm", live.focalLengthMm);
            d.severity = std::fabs(ratio - 1.0) > 0.3 ? Severity::High : Severity::Medium;
            // Wider glass shrinks the subject (move in); longer glass enlarges it (step back).
            if (ratio < 1) {
                d.fix = "Go to " + d.planned + " and step back to hold subject size";
                d.impact = "Wider lens adds environment and perspective stretch; the shot reads less intimate than planned.";
            } else {
                d.fix = "Go to " + d.planned + " and move in to hold subject size";
                d.impact = "Longer lens compresses depth and isolates the subject more than planned; cutting rhythm with neighbours changes.";
            }
            r.deviations.push_back(d);
        }
    }

    // Aperture
    const double stop = liveStop(live);
    if (planned.tStop > 0 && stop > 0) {
        const double diff = math::apertureStops(planned.tStop, stop);
        if (std::fabs(diff) > 0.5) {
            Deviation d;
            d.aspect = "Aperture";
            d.planned = math::formatAperture(planned.tStop, true);
            d.actual = math::formatAperture(stop, live.tStop > 0);
            d.severity = std::fabs(diff) > 1.5 ? Severity::High : Severity::Medium;
            d.fix = "Return to " + d.planned + " and balance exposure with ND or ISO";
            d.impact = diff > 0 ? "Deeper focus than planned — background detail competes with the subject."
                                : "Shallower focus than planned — tighter focus margin for the 1st AC.";
            r.deviations.push_back(d);
        }
    }

    // Frame rate (can't be fixed in post)
    if (planned.frameRate > 0 && live.frameRate > 0 && !math::frameRatesEqual(planned.frameRate, live.frameRate)) {
        Deviation d;
        d.aspect = "Frame rate";
        d.planned = math::formatFrameRate(planned.frameRate);
        d.actual = math::formatFrameRate(live.frameRate);
        d.severity = Severity::Critical;
        d.fix = "Set project frame rate to " + d.planned + " before rolling";
        d.impact = "Mismatched frame rate breaks sync and conform; footage cannot be cut with the rest of the scene.";
        r.deviations.push_back(d);
    }

    // Shutter angle
    const double angle = liveAngle(live);
    if (planned.shutterAngle > 0 && angle > 0) {
        const double stops = std::fabs(std::log2(angle / planned.shutterAngle));
        if (stops > 0.25) {
            Deviation d;
            d.aspect = "Shutter angle";
            d.planned = math::formatAngle(planned.shutterAngle);
            d.actual = math::formatAngle(angle);
            d.severity = stops > 1.0 ? Severity::High : Severity::Medium;
            d.fix = "Set shutter to " + d.planned + (live.frameRate > 0 ? " (" + math::formatShutter(math::shutterSecondsFromAngle(planned.shutterAngle, live.frameRate)) + ")" : "");
            d.impact = angle < planned.shutterAngle ? "Narrower shutter makes motion staccato — reads as tension/action, not the planned look."
                                                     : "Wider shutter adds motion blur — movement smears compared to matching coverage.";
            r.deviations.push_back(d);
        }
    }

    // ISO
    if (planned.iso > 0 && live.iso > 0 && live.iso != planned.iso) {
        const bool native = std::find(planned.nativeIsos.begin(), planned.nativeIsos.end(), live.iso) != planned.nativeIsos.end();
        Deviation d;
        d.aspect = "ISO";
        d.planned = std::to_string(planned.iso);
        d.actual = std::to_string(live.iso);
        d.severity = native ? Severity::Low : Severity::Medium;
        d.fix = "Return to ISO " + d.planned;
        d.impact = native ? "Different native base: noise floor and highlight latitude shift between angles."
                          : "Non-native ISO adds noise or loses highlight latitude; grade will not match coverage.";
        r.deviations.push_back(d);
    } else if (live.isoAuto) {
        r.deviations.push_back({"ISO", planned.iso > 0 ? std::to_string(planned.iso) : "Fixed", "AUTO", Severity::High,
                                "Lock ISO" + (planned.iso > 0 ? " at " + std::to_string(planned.iso) : std::string()),
                                "Auto ISO pumps exposure mid-take; shots will not intercut."});
    }

    // White balance
    if (live.whiteBalanceAuto) {
        r.deviations.push_back({"White balance", planned.whiteBalanceK > 0 ? std::to_string(planned.whiteBalanceK) + "K" : "Manual", "AWB",
                                Severity::Medium,
                                "Lock white balance" + (planned.whiteBalanceK > 0 ? " at " + std::to_string(planned.whiteBalanceK) + "K" : std::string()),
                                "AWB drifts as people cross frame; colour continuity across coverage breaks."});
    } else if (planned.whiteBalanceK > 0 && live.whiteBalanceK > 0) {
        const int dk = std::abs(live.whiteBalanceK - planned.whiteBalanceK);
        if (dk > 300) {
            Deviation d;
            d.aspect = "White balance";
            d.planned = std::to_string(planned.whiteBalanceK) + "K";
            d.actual = std::to_string(live.whiteBalanceK) + "K";
            d.severity = dk > 1000 ? Severity::High : Severity::Medium;
            d.fix = "Set white balance to " + d.planned;
            d.impact = live.whiteBalanceK > planned.whiteBalanceK ? "Image renders warmer than the planned look." : "Image renders cooler than the planned look.";
            r.deviations.push_back(d);
        }
    }

    std::stable_sort(r.deviations.begin(), r.deviations.end(),
                     [](const Deviation& a, const Deviation& b) { return a.severity > b.severity; });
    int score = 100;
    for (const auto& d : r.deviations) {
        switch (d.severity) {
            case Severity::Critical: score -= 35; r.canContinue = false; break;
            case Severity::High: score -= 20; break;
            case Severity::Medium: score -= 10; break;
            case Severity::Low: score -= 4; break;
            case Severity::Info: break;
        }
    }
    r.overallMatch = std::max(0, score);
    for (size_t i = 0; i < r.deviations.size() && i < 3; ++i) r.quickFixes.push_back(r.deviations[i].fix);
    if (r.deviations.empty()) r.note = "Live setup matches the plan.";
    else r.note = "Most critical: " + r.deviations.front().aspect + " — " + r.deviations.front().fix + ".";
    return r;
}

int sceneCoverage(const Scene& scene) {
    if (scene.shots.empty()) return 0;
    size_t done = 0;
    for (const auto& s : scene.shots) {
        if (s.status == ShotStatus::Approved || s.completedOnSet) ++done;
    }
    return static_cast<int>(std::lround(100.0 * done / scene.shots.size()));
}

// ─── Engine ────────────────────────────────────────────────────────────────────

GuidanceEngine::GuidanceEngine(EngineConfig cfg) : cfg_(cfg) {}

void GuidanceEngine::resetShot() {
    haveSmoothed_ = false;
    focusPeak_ = 0;
    smoothed_ = FrameStats();
}

EngineOutput GuidanceEngine::evaluate(const EngineInput& in) {
    EngineOutput out;
    Collector c(in);
    const CameraState& cam = in.camera;
    const PlannedSettings* plan = in.planned;

    // Smooth frame statistics so guidance doesn't flicker frame to frame — but if the
    // exposure settings just changed, the old average describes a different image.
    // Starting fresh prevents re-applying a correction that's already been made.
    {
        const double shutter = cam.shutterSeconds > 0 ? cam.shutterSeconds
                                                      : math::shutterSecondsFromAngle(cam.shutterAngle, cam.frameRate);
        const double stop = liveStop(cam);
        const double key = (cam.iso > 0 ? std::log2(cam.iso) : 0) + (shutter > 0 ? std::log2(shutter) : 0) -
                           (stop > 0 ? 2 * std::log2(stop) : 0) - cam.ndStops;
        if (haveSmoothed_ && std::fabs(key - lastExposureKey_) > 0.1) haveSmoothed_ = false;
        lastExposureKey_ = key;
    }
    if (in.frame.valid) {
        if (!haveSmoothed_) {
            smoothed_ = in.frame;
            haveSmoothed_ = true;
        } else {
            const double a = std::clamp(cfg_.smoothing, 0.0, 1.0);
            auto ema = [a](double prev, double cur) { return prev + a * (cur - prev); };
            FrameStats s = in.frame;
            s.meanLuma = ema(smoothed_.meanLuma, s.meanLuma);
            s.medianLuma = ema(smoothed_.medianLuma, s.medianLuma);
            s.clippedFraction = ema(smoothed_.clippedFraction, s.clippedFraction);
            s.crushedFraction = ema(smoothed_.crushedFraction, s.crushedFraction);
            s.evOffset = ema(smoothed_.evOffset, s.evOffset);
            s.sharpness = ema(smoothed_.sharpness, s.sharpness);
            s.centerSharpness = ema(smoothed_.centerSharpness, s.centerSharpness);
            s.contrastRatio = ema(smoothed_.contrastRatio, s.contrastRatio);
            s.colorCastRB = ema(smoothed_.colorCastRB, s.colorCastRB);
            s.colorCastG = ema(smoothed_.colorCastG, s.colorCastG);
            s.subjectX = ema(smoothed_.subjectX, s.subjectX);
            s.subjectY = ema(smoothed_.subjectY, s.subjectY);
            smoothed_ = s;
        }
        focusPeak_ = std::max(focusPeak_ * 0.999, smoothed_.centerSharpness);  // slow decay so a new subject can reset it
    }
    const FrameStats& f = smoothed_;
    out.smoothedFrame = f;

    // ── Hardware / connection ──
    if (!cam.connected) {
        c.add({"camera.disconnected", Category::Hardware, Severity::Critical, "Camera not connected",
               "No live state from the camera body.", "Check the USB-C / Ethernet link and camera remote setting", 100});
    }
    if (cam.batteryPercent >= 0 && cam.batteryPercent < 30) {
        const bool crit = cam.batteryPercent < 15;
        c.add({"hw.battery", Category::Hardware, crit ? Severity::High : Severity::Medium,
               "Battery at " + std::to_string(cam.batteryPercent) + "%",
               crit ? "Risk of losing the take mid-roll." : "Plan a swap before the next setup.",
               crit ? "Swap battery before rolling" : "Prep a charged battery", 95});
    }

    // ── Plan deviations ──
    if (plan) {
        out.deviations = checkDeviations(in.shot, *plan, cam);
        for (const auto& d : out.deviations.deviations) {
            Category cat = Category::Continuity;
            if (d.aspect == "Lens focal length") cat = Category::Lens;
            else if (d.aspect == "Aperture") cat = Category::Exposure;
            else if (d.aspect == "Frame rate") cat = Category::FrameRate;
            else if (d.aspect == "Shutter angle") cat = Category::Shutter;
            else if (d.aspect == "ISO") cat = Category::Iso;
            else if (d.aspect == "White balance") cat = Category::WhiteBalance;
            c.add({"plan." + lower(d.aspect), cat, d.severity, d.aspect + ": " + d.actual + " (plan " + d.planned + ")",
                   d.impact, d.fix, 90});
        }
        // Adjustments that restore the plan.
        if (plan->frameRate > 0 && cam.frameRate > 0 && !math::frameRatesEqual(plan->frameRate, cam.frameRate))
            out.adjustments.push_back({CameraAdjustment::Property::FrameRate, plan->frameRate,
                                       "Set frame rate to " + math::formatFrameRate(plan->frameRate), "plan.frame rate"});
        const double angle = liveAngle(cam);
        const double wantAngle = plan->shutterAngle > 0 ? plan->shutterAngle : cfg_.defaultShutterAngle;
        if (angle > 0 && std::fabs(std::log2(angle / wantAngle)) > 0.25)
            out.adjustments.push_back({CameraAdjustment::Property::ShutterAngle, wantAngle,
                                       "Set shutter to " + math::formatAngle(wantAngle), "plan.shutter angle"});
        if (cam.whiteBalanceAuto || (plan->whiteBalanceK > 0 && cam.whiteBalanceK > 0 && std::abs(cam.whiteBalanceK - plan->whiteBalanceK) > 300)) {
            if (plan->whiteBalanceK > 0)
                out.adjustments.push_back({CameraAdjustment::Property::WhiteBalanceK, static_cast<double>(plan->whiteBalanceK),
                                           "Set white balance to " + std::to_string(plan->whiteBalanceK) + "K", "plan.white balance"});
        }
        if (cam.isoAuto && plan->iso > 0)
            out.adjustments.push_back({CameraAdjustment::Property::Iso, static_cast<double>(plan->iso),
                                       "Lock ISO at " + std::to_string(plan->iso), "plan.iso"});
    } else {
        // No plan: still enforce the 180° rule as a sane default.
        const double angle = liveAngle(cam);
        if (angle > 0 && std::fabs(std::log2(angle / cfg_.defaultShutterAngle)) > 0.5) {
            c.add({"shutter.180", Category::Shutter, Severity::Low, "Shutter at " + math::formatAngle(angle),
                   "Departing from 180° changes motion cadence.", "Use 180° unless the look calls for it", 70});
        }
    }

    // ── Flicker ──
    if (cam.shutterSeconds > 0 && !math::isFlickerSafe(cam.shutterSeconds, cfg_.mainsHz)) {
        std::string lit;
        if (in.shot) lit += lower(in.shot->lighting) + " ";
        if (in.scene) {
            lit += lower(in.scene->title) + " ";
            for (const auto& p : in.scene->lighting.practicals) lit += lower(p) + " ";
        }
        if (containsAny(lit, {"practical", "fluor", "led", "neon", "street", "int.", "lamp", "monitor", "tv", "screen"})) {
            // Nearest flicker-safe shutter: integer multiples of the half-mains period.
            const double period = 1.0 / (2.0 * cfg_.mainsHz);
            const double safe = std::max(1.0, std::round(cam.shutterSeconds / period)) * period;
            const double safeAngle = math::shutterAngleFromSeconds(safe, cam.frameRate);
            c.add({"light.flicker", Category::Shutter, Severity::Medium, "Flicker risk with " + math::formatShutter(cam.shutterSeconds),
                   "Practicals/discharge sources on " + std::to_string(cfg_.mainsHz) + "Hz mains will pulse at this shutter.",
                   "Use " + math::formatShutter(safe) + (safeAngle > 0 ? " (" + math::formatAngle(safeAngle) + ")" : ""), 80});
            if (safeAngle > 0 && safeAngle <= 360)
                out.adjustments.push_back({CameraAdjustment::Property::ShutterAngle, safeAngle,
                                           "Set flicker-safe shutter " + math::formatAngle(safeAngle), "light.flicker"});
        }
    }

    // ── Exposure from the image ──
    if (f.valid) {
        double need = 0;           // stops of light to add
        std::string gid;
        if (f.clippedFraction >= cfg_.clipWarnFraction) {
            const bool high = f.clippedFraction >= cfg_.clipHighFraction;
            gid = "exposure.clipping";
            // If mids are fine, the fix is the hot source, not the whole exposure.
            const bool midsOk = f.evOffset > -0.5;
            need = midsOk ? -std::min(1.0, std::max(1.0 / 3.0, f.clippedFraction * 30.0)) : 0;
            c.add({gid, Category::Exposure, high ? Severity::High : Severity::Medium,
                   fmt("Highlights clipping (%.1f%% of frame)", f.clippedFraction * 100.0),
                   midsOk ? "Mid-tones are on target — the hot area is a source problem, not overall exposure."
                          : "Clipped highlights hold no detail to recover in the grade.",
                   midsOk ? "Flag or net the hot source; otherwise bring exposure down " + math::formatStops(need).substr(1)
                          : "Bring exposure down until highlight zebras clear", 85});
        }
        if (f.evOffset > cfg_.overExposeStops) {
            gid = "exposure.over";
            need = -f.evOffset;
            c.add({gid, Category::Exposure, f.evOffset > 2 ? Severity::High : Severity::Medium,
                   "Overexposed " + math::formatStops(f.evOffset),
                   "Scene key sits well above mid-grey for this curve.", "Reduce exposure " + math::formatStops(-f.evOffset).substr(1), 80});
        } else if (f.evOffset < cfg_.underExposeStops) {
            gid = "exposure.under";
            need = -f.evOffset;
            const bool lowKey = in.scene && containsAny(lower(in.scene->mood + " " + in.scene->style + " " + in.scene->title),
                                                        {"night", "noir", "dark", "low-key", "low key", "moody", "tense", "melanch"});
            c.add({gid, Category::Exposure, lowKey ? Severity::Low : (f.evOffset < -2 ? Severity::High : Severity::Medium),
                   "Underexposed " + math::formatStops(f.evOffset),
                   lowKey ? "Low-key scene: keep the mood, but protect faces from falling into noise."
                          : "Shadows will be noisy when lifted in the grade.",
                   "Add " + math::formatStops(need).substr(1) + " of exposure", lowKey ? 60 : 80});
        }
        if (f.crushedFraction > 0.25 && f.evOffset >= cfg_.underExposeStops) {
            c.add({"exposure.crushed", Category::Lighting, Severity::Low, fmt("Deep shadows crushed (%.0f%%)", f.crushedFraction * 100.0),
                   "A large part of the frame has no shadow detail.", "Add negative-fill-safe ambient or a low bounce", 65});
        }

        if (!gid.empty() && need != 0) {
            const bool cameraLocked = in.mode == GuidanceMode::Lock && in.locks.camera;
            double remaining = need;
            std::vector<CameraAdjustment> exp;
            if (!cameraLocked) exp = solveExposure(need, cam, plan, cfg_, gid, remaining);
            if (in.mode == GuidanceMode::Assist && exp.size() > 1) exp.resize(1);  // one safest move at a time
            out.adjustments.insert(out.adjustments.begin(), exp.begin(), exp.end());
            if (std::fabs(remaining) > 1e-6 && !(in.mode == GuidanceMode::Lock && in.locks.lighting)) {
                c.add({"light.balance", Category::Lighting, Severity::Medium,
                       remaining > 0 ? "Add light: camera can't absorb " + math::formatStops(remaining).substr(1)
                                     : "Cut light: camera can't absorb " + math::formatStops(remaining).substr(1),
                       cameraLocked ? "Camera settings are locked — solve exposure on the lighting side."
                                    : "Plan limits on iris/ISO/ND are reached.",
                       remaining > 0 ? "Bring the key up or move it closer (inverse-square: ~0.7x distance = +1 stop)"
                                     : "Scrim or net the key, or move it back (~1.4x distance = -1 stop)", 75});
            }
        }

        // ── Focus ──
        if (f.centerSharpness < 0.12 && f.meanLuma > 0.08) {
            c.add({"focus.soft", Category::Focus, Severity::Medium, "Image is soft in the centre",
                   "Very little fine detail in the central third.", "Check focus with peaking / magnify", 60});
        } else if (cam.recording && focusPeak_ > 0.2 && f.centerSharpness < focusPeak_ * cfg_.focusDropRatio) {
            c.add({"focus.drift", Category::Focus, Severity::High, "Focus may have drifted",
                   fmt("Centre detail dropped to %.0f%% of this shot's best.", 100.0 * f.centerSharpness / focusPeak_),
                   "Flag the take for the 1st AC; check marks", 70});
        }

        // ── Composition ──
        if (in.shot && f.sharpness > 0.15) {
            const std::string type = lower(in.shot->type);
            const bool single = containsAny(type, {"close", "cu", "medium", "mcu", "single", "over", "ots", "clean"});
            if (single && in.shot->intent != "thematic") {
                if (std::fabs(f.subjectX - 0.5) < 0.06) {
                    c.add({"frame.centered", Category::Composition, Severity::Low, "Subject dead centre",
                           "Singles usually need look-room toward the eyeline.",
                           "Offset subject to the " + std::string(f.subjectX < 0.5 ? "left" : "right") + " third, leaving space where they look", 55});
                }
                if (f.subjectY > 0.62) {
                    c.add({"frame.headroom", Category::Composition, Severity::Low, "Too much headroom",
                           "Eyes are sitting below the frame's upper third.", "Tilt down or raise the camera so eyes land on the top third line", 55});
                }
            }
        }

        // ── Colour ──
        if (plan && plan->whiteBalanceK > 0 && !cam.whiteBalanceAuto) {
            if (f.colorCastRB > 0.15) {
                c.add({"wb.warm", Category::WhiteBalance, Severity::Low, "Image reads warm",
                       "Neutral surfaces are rendering orange at " + std::to_string(cam.whiteBalanceK > 0 ? cam.whiteBalanceK : plan->whiteBalanceK) + "K.",
                       "Check for tungsten spill or practicals contaminating the key", 50});
            } else if (f.colorCastRB < -0.15) {
                c.add({"wb.cool", Category::WhiteBalance, Severity::Low, "Image reads cool",
                       "Neutral surfaces are rendering blue.", "Check for daylight/skylight spill or uncorrected LEDs", 50});
            }
            if (std::fabs(f.colorCastG) > 0.08) {
                c.add({f.colorCastG > 0 ? "wb.green" : "wb.magenta", Category::WhiteBalance, Severity::Low,
                       f.colorCastG > 0 ? "Green cast" : "Magenta cast",
                       "Typical of fluorescent or cheap LED sources.",
                       f.colorCastG > 0 ? "Add 1/4 minus-green on the source or adjust tint" : "Add 1/4 plus-green on the source or adjust tint", 50});
            }
        }
    }

    // ── Coverage & continuity (port of buildDeviationAlerts) ──
    if (in.scene && !in.scene->shots.empty()) {
        const int cov = sceneCoverage(*in.scene);
        if (cov < 60) {
            c.add({"coverage.low", Category::Coverage, Severity::Info, "Coverage " + std::to_string(cov) + "% approved",
                   "Editorial needs protection before moving on.", "Prioritise insert and reverse coverage", 85});
        }
        if (in.scene->characters.size() > 1) {
            c.add({"continuity.axis", Category::Continuity, Severity::Info, "Protect the 180° line",
                   "Multi-character scene — eyeline drift shows fast when marks move.", "Tape the conversation axis and keep eyelines consistent", 80});
        }
    }

    // Lock mode: locked items stay visible but drop below actionable ones.
    std::stable_sort(c.items.begin(), c.items.end(), [](const Guidance& a, const Guidance& b) {
        if (a.blockedByLock != b.blockedByLock) return !a.blockedByLock;
        if (a.severity != b.severity) return a.severity > b.severity;
        return a.confidence > b.confidence;
    });

    // Drop adjustments for locked areas.
    if (in.mode == GuidanceMode::Lock && in.locks.camera) out.adjustments.clear();

    int readiness = 100;
    for (const auto& g : c.items) {
        if (!g.blockedByLock) readiness -= severityPenalty(g.severity);
    }
    out.readiness = std::max(0, readiness);
    out.guidance = std::move(c.items);
    return out;
}

// ─── Q&A ───────────────────────────────────────────────────────────────────────

std::string answerQuestion(const std::string& question, const EngineInput& ctx, const EngineOutput* last) {
    const std::string q = lower(question);
    const Scene* scene = ctx.scene;
    const Shot* shot = ctx.shot;
    std::ostringstream os;

    switch (ctx.mode) {
        case GuidanceMode::Assist: os << "Work the safest production answer first:\n"; break;
        case GuidanceMode::Lock: os << "Keep the locked choices intact and solve around them:\n"; break;
        default: os << "Best option from the current plan:\n"; break;
    }

    const std::string lead = scene && !scene->characters.empty() ? scene->characters[0] : "the lead";
    const std::string location = scene && !scene->locations.empty() ? scene->locations[0] : "the room";

    if (containsAny(q, {"expos", "bright", "dark", "stop", "iris", "nd", "iso", "clip", "zebra"})) {
        if (last && last->smoothedFrame.valid) {
            os << "Image key is " << math::formatStops(last->smoothedFrame.evOffset) << " from mid-grey, "
               << fmt("%.1f", last->smoothedFrame.clippedFraction * 100.0) << "% clipped.\n";
        }
        if (last && !last->adjustments.empty()) {
            os << "Do this: ";
            for (size_t i = 0; i < last->adjustments.size() && i < 3; ++i) os << (i ? "; then " : "") << last->adjustments[i].label;
            os << ".\n";
        } else {
            os << "Exposure is inside tolerance — hold " << math::formatAperture(liveStop(ctx.camera), ctx.camera.tStop > 0)
               << " / ISO " << ctx.camera.iso << ".\n";
        }
        return os.str();
    }
    if (containsAny(q, {"focus", "soft", "sharp"})) {
        if (last && last->smoothedFrame.valid)
            os << "Centre detail score " << fmt("%.2f", last->smoothedFrame.centerSharpness)
               << (last->smoothedFrame.centerSharpness < 0.12 ? " — that's soft; magnify and re-check the mark.\n" : " — reading sharp.\n");
        os << "At " << math::formatAperture(liveStop(ctx.camera), ctx.camera.tStop > 0)
           << (ctx.camera.focalLengthMm > 0 ? " on " + fmt("%.0fmm", ctx.camera.focalLengthMm) : std::string())
           << ", give the 1st AC a rehearsal with marks before rolling.\n";
        return os.str();
    }
    if (containsAny(q, {"lens", "focal", "mm"})) {
        if (shot) os << "Planned lens for this shot (" << shot->type << "): " << shotLensText(shot) << ".\n";
        if (scene && shot) {
            for (size_t i = 0; i + 1 < scene->shots.size(); ++i) {
                if (&scene->shots[i] == shot) {
                    os << "Next up: " << scene->shots[i + 1].type << " on " << shotLensText(&scene->shots[i + 1]) << ".\n";
                    break;
                }
            }
        }
        if (ctx.camera.focalLengthMm > 0) os << "Camera reports " << fmt("%.0fmm", ctx.camera.focalLengthMm) << ".\n";
        return os.str();
    }
    if (containsAny(q, {"light", "key", "fill", "ratio"}) && scene) {
        const auto& lp = scene->lighting;
        if (!lp.key.type.empty()) os << "Key: " << lp.key.type << " from " << lp.key.position << ".\n";
        if (!lp.fill.type.empty()) os << "Fill: " << lp.fill.type << " from " << lp.fill.position << ".\n";
        if (!lp.ratio.empty()) os << "Ratio target: " << lp.ratio << ".\n";
        if (!lp.notes.empty()) os << lp.notes << "\n";
        os << "Treat one side of " << location << " as the believable source so reverses match.\n";
        return os.str();
    }
    if (containsAny(q, {"coverage", "left", "remaining", "next"}) && scene) {
        os << "Coverage is " << sceneCoverage(*scene) << "% approved. Still to get:\n";
        int n = 0;
        for (const auto& s : scene->shots) {
            if (s.status == ShotStatus::Approved || s.completedOnSet) continue;
            os << "  - " << s.type << " (" << shotLensText(&s) << ") — " << s.description << "\n";
            if (++n >= 6) break;
        }
        if (n == 0) os << "  nothing — scene is covered. Grab a wild insert for editorial.\n";
        return os.str();
    }

    // Default: the web app's fallback reply, including alt shot division.
    os << "For \"" << question << "\", stage the next pass around " << lead << " in " << location << ". ";
    if (shot && !shotLensText(shot).empty()) os << "Keep the base coverage on " << shotLensText(shot) << " and only add movement if the beat changes power.\n";
    else os << "Start with a playable geography shot, then split into emotional coverage only after the blocking settles.\n";
    os << "\nIf you need an alt shot division, shoot it like a real company move:\n"
          "1. Master for entrances, exits, and props.\n"
          "2. Medium for the playable action.\n"
          "3. Close reaction when the scene turns.\n"
          "4. Insert or over-shoulder so editorial can bridge timing or continuity.\n";
    return os.str();
}

} // namespace cineassist
