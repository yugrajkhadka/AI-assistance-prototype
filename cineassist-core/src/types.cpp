#include "cineassist/types.h"

namespace cineassist {

const char* toString(Severity s) {
    switch (s) {
        case Severity::Info: return "info";
        case Severity::Low: return "low";
        case Severity::Medium: return "medium";
        case Severity::High: return "high";
        case Severity::Critical: return "critical";
    }
    return "info";
}

const char* toString(Category c) {
    switch (c) {
        case Category::Exposure: return "exposure";
        case Category::Focus: return "focus";
        case Category::Shutter: return "shutter";
        case Category::Iso: return "iso";
        case Category::WhiteBalance: return "whiteBalance";
        case Category::Lens: return "lens";
        case Category::Nd: return "nd";
        case Category::FrameRate: return "frameRate";
        case Category::Composition: return "composition";
        case Category::Coverage: return "coverage";
        case Category::Continuity: return "continuity";
        case Category::Lighting: return "lighting";
        case Category::Recording: return "recording";
        case Category::Hardware: return "hardware";
    }
    return "unknown";
}

const char* toString(ShotStatus s) {
    switch (s) {
        case ShotStatus::Pending: return "pending";
        case ShotStatus::Approved: return "approved";
        case ShotStatus::Revision: return "revision";
    }
    return "pending";
}

const char* toString(GuidanceMode m) {
    switch (m) {
        case GuidanceMode::Suggest: return "suggest";
        case GuidanceMode::Assist: return "assist";
        case GuidanceMode::Lock: return "lock";
    }
    return "suggest";
}

ShotStatus shotStatusFromString(const std::string& s) {
    if (s == "approved") return ShotStatus::Approved;
    if (s == "revision") return ShotStatus::Revision;
    return ShotStatus::Pending;
}

GuidanceMode guidanceModeFromString(const std::string& s) {
    if (s == "assist") return GuidanceMode::Assist;
    if (s == "lock") return GuidanceMode::Lock;
    return GuidanceMode::Suggest;
}

} // namespace cineassist
