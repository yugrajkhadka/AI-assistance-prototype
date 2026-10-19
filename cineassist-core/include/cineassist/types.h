// CineAssist Core — shared data types.
//
// These mirror the web app's Analysis model (server/src/models/Analysis.js) so a
// project exported from the web app can be loaded on set without conversion.
// All numeric camera values are stored in physical units (f-number, ISO, seconds,
// Kelvin, millimetres) so every camera backend maps into the same representation.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace cineassist {

// ─── Live camera state ─────────────────────────────────────────────────────────
// A value of 0 (or a negative value) means "unknown / not reported by this camera".
struct CameraState {
    std::string model;            // "ILME-FX6", "Simulated", ...
    std::string lensModel;
    bool connected = false;
    bool recording = false;

    double fNumber = 0;           // f/2.8 -> 2.8
    double tStop = 0;             // when the lens reports T-stops (cinema glass)
    int iso = 0;
    bool isoAuto = false;
    double shutterSeconds = 0;    // 1/48 -> 0.020833
    double shutterAngle = 0;      // degrees; 0 if the camera runs in speed mode
    double frameRate = 0;         // 23.976, 24, 25, ...
    int whiteBalanceK = 0;        // colour temperature in Kelvin, 0 = auto / unknown
    bool whiteBalanceAuto = false;
    double ndStops = 0;           // 0.6 ND -> 2 stops
    double focalLengthMm = 0;
    int batteryPercent = -1;
};

// ─── Planned values (from pre-production) ──────────────────────────────────────
struct PlannedSettings {
    double tStop = 0;             // target aperture (T or f — treated as stop number)
    double tStopMin = 0, tStopMax = 0;
    int iso = 0, isoMin = 0, isoMax = 0;
    std::vector<int> nativeIsos;  // e.g. {800, 3200}
    double shutterAngle = 0;      // e.g. 180
    double shutterSeconds = 0;    // e.g. 1/48
    double frameRate = 0;
    int whiteBalanceK = 0;
    double ndStops = 0;
    double focalLengthMm = 0;
    std::string camera, codec, resolution, colorScience, lensType, mount;
};

struct ShotNote {
    std::string text;
    std::string author;
    int64_t createdAtUnix = 0;
};

enum class ShotStatus { Pending, Approved, Revision };

struct Shot {
    std::string id;
    std::string type;             // "Wide Master", "Close-Up", ...
    std::string description;
    std::string lens;             // "35mm" — kept as text, parsed into focalLengthMm
    double focalLengthMm = 0;
    std::string movement, angle, lighting, duration, intent;
    ShotStatus status = ShotStatus::Pending;
    bool locked = false;
    bool completedOnSet = false;
    int takes = 0;
    int confidence = 0;
    std::vector<ShotNote> notes;
};

struct LightSource {
    std::string type, position, color;
    double intensity = 0;
};

struct LightingPlan {
    LightSource key, fill, back;
    std::vector<std::string> practicals;
    std::string ratio;            // "4:1"
    std::string notes;
};

struct Scene {
    int number = 0;
    std::string title, description, mood, style, duration;
    std::vector<std::string> characters, locations, props;
    std::vector<Shot> shots;
    LightingPlan lighting;
};

struct Project {
    std::string id;
    std::string title;
    std::vector<Scene> scenes;
    PlannedSettings camera;
};

// ─── Video frame (input to analysis) ───────────────────────────────────────────
enum class PixelFormat { Gray8, RGB8, RGBA8, BGRA8, YUV420P /* I420, luma plane first */ };

// Non-owning view of a frame. The analyser never stores the pointer.
struct FrameView {
    const uint8_t* data = nullptr;
    int width = 0;
    int height = 0;
    int strideBytes = 0;          // 0 = tightly packed
    PixelFormat format = PixelFormat::RGB8;
    // true if the image is in a log curve (S-Log3, LogC, ...). Exposure targets shift.
    bool logEncoded = false;
};

// ─── Analysis results ──────────────────────────────────────────────────────────
struct FrameStats {
    bool valid = false;
    double meanLuma = 0;           // 0..1
    double medianLuma = 0;         // 0..1
    double clippedFraction = 0;    // share of pixels >= highlight threshold
    double crushedFraction = 0;    // share of pixels <= shadow threshold
    double evOffset = 0;           // + = over, - = under, in stops vs. target mid-grey
    double sharpness = 0;          // normalised Tenengrad energy (0..1, higher = crisper)
    double centerSharpness = 0;    // sharpness in the central third
    double contrastRatio = 0;      // p95 / p5 luma ratio expressed in stops
    double colorCastRB = 0;        // (R - B) / (R + B) of near-neutral pixels; + = warm
    double colorCastG = 0;         // green/magenta cast; + = green
    double subjectX = 0.5, subjectY = 0.5; // detail-weighted centre of interest, 0..1
    uint32_t histogram[64] = {0};  // luma histogram, 64 bins
};

enum class Severity { Info = 0, Low = 1, Medium = 2, High = 3, Critical = 4 };

enum class Category { Exposure, Focus, Shutter, Iso, WhiteBalance, Lens, Nd, FrameRate,
                      Composition, Coverage, Continuity, Lighting, Recording, Hardware };

struct Guidance {
    std::string id;               // stable key so a UI can de-duplicate / dismiss
    Category category = Category::Exposure;
    Severity severity = Severity::Info;
    std::string title;            // short, operator-facing ("Highlights clipping")
    std::string detail;           // one-sentence why
    std::string fix;              // actionable instruction ("Close down 1/2 stop to f/4")
    int confidence = 0;           // 0..100
    bool blockedByLock = false;   // true when the user locked this area (Lock mode)
};

struct Deviation {
    std::string aspect;
    std::string planned;
    std::string actual;
    Severity severity = Severity::Low;
    std::string fix;
    std::string impact;
};

struct DeviationReport {
    std::vector<Deviation> deviations;
    int overallMatch = 100;       // 0..100
    std::vector<std::string> quickFixes;
    bool canContinue = true;
    std::string note;
};

enum class GuidanceMode { Suggest, Assist, Lock };

struct LockedAreas {
    bool lighting = false;
    bool camera = false;
    bool framing = false;
};

const char* toString(Severity s);
const char* toString(Category c);
const char* toString(ShotStatus s);
const char* toString(GuidanceMode m);
ShotStatus shotStatusFromString(const std::string& s);
GuidanceMode guidanceModeFromString(const std::string& s);

} // namespace cineassist
