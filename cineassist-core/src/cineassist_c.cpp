#define CINEASSIST_BUILDING
#include "cineassist/cineassist_c.h"

#include "cineassist/frame_analyzer.h"
#include "cineassist/guidance_engine.h"
#include "cineassist/project.h"
#include "cineassist/session.h"
#include "cineassist/version.h"

#include <cstring>
#include <new>

using namespace cineassist;

struct ca_engine {
    FrameAnalyzer analyzer;
    GuidanceEngine engine;
    Session session;
    std::string savePath;
    CameraState camera;
    FrameStats frame;
    GuidanceMode mode = GuidanceMode::Suggest;
    LockedAreas locks;
    EngineOutput last;
    bool haveProject = false;
    size_t lastScene = static_cast<size_t>(-1), lastShot = static_cast<size_t>(-1);

    ca_engine(const AnalyzerConfig& a, const EngineConfig& c) : analyzer(a), engine(c) {}
};

namespace {

void copyStr(char* dst, size_t cap, const std::string& src) {
    if (!dst || cap == 0) return;
    const size_t n = src.size() < cap - 1 ? src.size() : cap - 1;
    std::memcpy(dst, src.data(), n);
    dst[n] = '\0';
}

size_t writeOut(char* buf, size_t cap, const std::string& s) {
    copyStr(buf, cap, s);
    return s.size();
}

std::string cstr(const char* s, size_t cap) {
    size_t n = 0;
    while (n < cap && s[n]) ++n;
    return std::string(s, n);
}

} // namespace

extern "C" {

int ca_abi_version(void) { return CA_ABI_VERSION; }
const char* ca_version_string(void) { return CINEASSIST_VERSION_STRING; }

ca_engine* ca_engine_create(const ca_config* config) {
    AnalyzerConfig a;
    EngineConfig c;
    if (config) {
        if (config->mains_hz > 0) c.mainsHz = config->mains_hz;
        if (config->max_nd_stops > 0) c.maxNdStops = config->max_nd_stops;
        if (config->nd_step > 0) c.ndStep = config->nd_step;
        if (config->max_analysis_width > 0) a.maxAnalysisWidth = config->max_analysis_width;
    }
    return new (std::nothrow) ca_engine(a, c);
}

void ca_engine_destroy(ca_engine* e) { delete e; }

int ca_engine_load_project_file(ca_engine* e, const char* path, char* err, size_t err_cap) {
    if (!e || !path) return -1;
    std::string error;
    if (!e->session.open(path, e->savePath, &error)) {
        copyStr(err, err_cap, error);
        return -1;
    }
    e->haveProject = true;
    e->engine.resetShot();
    return 0;
}

int ca_engine_load_project_json(ca_engine* e, const char* json, char* err, size_t err_cap) {
    if (!e || !json) return -1;
    std::string perr;
    const json::Value root = json::parse(json, &perr);
    if (!perr.empty()) { copyStr(err, err_cap, perr); return -1; }
    Project p;
    std::string error;
    if (!projectFromJson(root, p, &error)) { copyStr(err, err_cap, error); return -1; }
    e->session.openInMemory(std::move(p));
    e->haveProject = true;
    e->engine.resetShot();
    return 0;
}

void ca_engine_set_save_path(ca_engine* e, const char* save_path) {
    if (e) e->savePath = save_path ? save_path : "";
}

int ca_engine_scene_count(const ca_engine* e) {
    return e ? static_cast<int>(e->session.project().scenes.size()) : 0;
}

int ca_engine_shot_count(const ca_engine* e, int scene) {
    if (!e || scene < 0 || static_cast<size_t>(scene) >= e->session.project().scenes.size()) return 0;
    return static_cast<int>(e->session.project().scenes[static_cast<size_t>(scene)].shots.size());
}

int ca_engine_select(ca_engine* e, int scene, int shot) {
    if (!e || scene < 0 || shot < 0) return -1;
    if (!e->session.selectScene(static_cast<size_t>(scene)) || !e->session.selectShot(static_cast<size_t>(shot))) return -1;
    return 0;
}

int ca_engine_next_shot(ca_engine* e) { return e && e->session.nextShot() ? 0 : -1; }
int ca_engine_current_scene(const ca_engine* e) { return e ? static_cast<int>(e->session.sceneIndex()) : -1; }
int ca_engine_current_shot(const ca_engine* e) { return e ? static_cast<int>(e->session.shotIndex()) : -1; }

size_t ca_engine_current_shot_label(const ca_engine* e, char* buf, size_t cap) {
    if (!e) return 0;
    const Scene* sc = e->session.scene();
    const Shot* sh = e->session.shot();
    if (!sc || !sh) return writeOut(buf, cap, "No shot selected");
    std::string s = "SC " + std::to_string(sc->number) + " / Shot " + std::to_string(e->session.shotIndex() + 1) +
                    " — " + sh->type;
    if (!sh->lens.empty()) s += " (" + sh->lens + ")";
    return writeOut(buf, cap, s);
}

void ca_engine_set_mode(ca_engine* e, ca_mode mode) {
    if (!e) return;
    e->mode = mode == CA_MODE_ASSIST ? GuidanceMode::Assist : mode == CA_MODE_LOCK ? GuidanceMode::Lock : GuidanceMode::Suggest;
}

void ca_engine_set_locks(ca_engine* e, int lighting, int camera, int framing) {
    if (!e) return;
    e->locks.lighting = lighting != 0;
    e->locks.camera = camera != 0;
    e->locks.framing = framing != 0;
}

void ca_engine_set_camera_state(ca_engine* e, const ca_camera_state* s) {
    if (!e || !s) return;
    CameraState c;
    c.connected = s->connected != 0;
    c.recording = s->recording != 0;
    c.fNumber = s->f_number;
    c.tStop = s->t_stop;
    c.iso = s->iso;
    c.isoAuto = s->iso_auto != 0;
    c.shutterSeconds = s->shutter_seconds;
    c.shutterAngle = s->shutter_angle;
    c.frameRate = s->frame_rate;
    c.whiteBalanceK = s->white_balance_k;
    c.whiteBalanceAuto = s->white_balance_auto != 0;
    c.ndStops = s->nd_stops;
    c.focalLengthMm = s->focal_length_mm;
    c.batteryPercent = s->battery_percent;
    c.model = cstr(s->model, sizeof s->model);
    c.lensModel = cstr(s->lens_model, sizeof s->lens_model);
    e->camera = c;
}

int ca_engine_push_frame(ca_engine* e, const uint8_t* data, int width, int height, int stride_bytes,
                         ca_pixel_format format, int log_encoded) {
    if (!e || !data) return -1;
    FrameView v;
    v.data = data;
    v.width = width;
    v.height = height;
    v.strideBytes = stride_bytes;
    switch (format) {
        case CA_PIXEL_GRAY8: v.format = PixelFormat::Gray8; break;
        case CA_PIXEL_RGB8: v.format = PixelFormat::RGB8; break;
        case CA_PIXEL_RGBA8: v.format = PixelFormat::RGBA8; break;
        case CA_PIXEL_BGRA8: v.format = PixelFormat::BGRA8; break;
        case CA_PIXEL_YUV420P: v.format = PixelFormat::YUV420P; break;
        default: return -1;
    }
    v.logEncoded = log_encoded != 0;
    e->frame = e->analyzer.analyze(v);
    return e->frame.valid ? 0 : -1;
}

int ca_engine_evaluate(ca_engine* e) {
    if (!e) return 0;
    // Shot change resets focus peak-hold and smoothing.
    if (e->session.sceneIndex() != e->lastScene || e->session.shotIndex() != e->lastShot) {
        e->engine.resetShot();
        e->lastScene = e->session.sceneIndex();
        e->lastShot = e->session.shotIndex();
    }
    EngineInput in;
    in.scene = e->session.scene();
    in.shot = e->session.shot();
    in.planned = e->haveProject ? &e->session.project().camera : nullptr;
    in.camera = e->camera;
    in.frame = e->frame;
    in.mode = e->mode;
    in.locks = e->locks;
    e->last = e->engine.evaluate(in);
    e->frame.valid = false;  // a frame is consumed once
    return static_cast<int>(e->last.guidance.size());
}

int ca_engine_guidance_count(const ca_engine* e) { return e ? static_cast<int>(e->last.guidance.size()) : 0; }

int ca_engine_get_guidance(const ca_engine* e, int index, ca_guidance* out) {
    if (!e || !out || index < 0 || static_cast<size_t>(index) >= e->last.guidance.size()) return -1;
    const Guidance& g = e->last.guidance[static_cast<size_t>(index)];
    std::memset(out, 0, sizeof *out);
    copyStr(out->id, sizeof out->id, g.id);
    copyStr(out->category, sizeof out->category, toString(g.category));
    out->severity = static_cast<ca_severity>(g.severity);
    copyStr(out->title, sizeof out->title, g.title);
    copyStr(out->detail, sizeof out->detail, g.detail);
    copyStr(out->fix, sizeof out->fix, g.fix);
    out->confidence = g.confidence;
    out->blocked_by_lock = g.blockedByLock ? 1 : 0;
    return 0;
}

int ca_engine_adjustment_count(const ca_engine* e) { return e ? static_cast<int>(e->last.adjustments.size()) : 0; }

int ca_engine_get_adjustment(const ca_engine* e, int index, ca_adjustment* out) {
    if (!e || !out || index < 0 || static_cast<size_t>(index) >= e->last.adjustments.size()) return -1;
    const CameraAdjustment& a = e->last.adjustments[static_cast<size_t>(index)];
    std::memset(out, 0, sizeof *out);
    out->property = static_cast<ca_adjustment_property>(a.property);
    out->value = a.value;
    copyStr(out->label, sizeof out->label, a.label);
    return 0;
}

int ca_engine_readiness(const ca_engine* e) { return e ? e->last.readiness : 0; }
int ca_engine_plan_match(const ca_engine* e) { return e ? e->last.deviations.overallMatch : 0; }

int ca_engine_get_frame_stats(const ca_engine* e, ca_frame_stats* out) {
    if (!e || !out) return -1;
    const FrameStats& f = e->last.smoothedFrame;
    out->valid = f.valid ? 1 : 0;
    out->mean_luma = f.meanLuma;
    out->median_luma = f.medianLuma;
    out->clipped_fraction = f.clippedFraction;
    out->crushed_fraction = f.crushedFraction;
    out->ev_offset = f.evOffset;
    out->sharpness = f.sharpness;
    out->center_sharpness = f.centerSharpness;
    out->subject_x = f.subjectX;
    out->subject_y = f.subjectY;
    return 0;
}

size_t ca_engine_result_json(const ca_engine* e, char* buf, size_t cap) {
    if (!e) return 0;
    json::Value o = json::Value::object();
    json::Value g = json::Value::array();
    for (const auto& item : e->last.guidance) g.push(guidanceToJson(item));
    o.set("guidance", std::move(g));
    json::Value adj = json::Value::array();
    for (const auto& a : e->last.adjustments) {
        json::Value aj = json::Value::object();
        aj.set("property", toString(a.property));
        aj.set("value", a.value);
        aj.set("label", a.label);
        aj.set("guidanceId", a.guidanceId);
        adj.push(std::move(aj));
    }
    o.set("adjustments", std::move(adj));
    o.set("deviations", deviationReportToJson(e->last.deviations));
    o.set("frame", frameStatsToJson(e->last.smoothedFrame));
    o.set("camera", cameraStateToJson(e->camera));
    o.set("readiness", e->last.readiness);
    return writeOut(buf, cap, o.dump());
}

int ca_engine_complete_shot(ca_engine* e, const char* notes) {
    if (!e || !e->session.shot()) return -1;
    return e->session.completeShot(notes ? notes : "");
}

int ca_engine_add_note(ca_engine* e, const char* text) {
    if (!e || !text || !e->session.shot()) return -1;
    e->session.addNote(text);
    return 0;
}

size_t ca_engine_ask(ca_engine* e, const char* question, char* buf, size_t cap) {
    if (!e || !question) return 0;
    EngineInput in;
    in.scene = e->session.scene();
    in.shot = e->session.shot();
    in.planned = e->haveProject ? &e->session.project().camera : nullptr;
    in.camera = e->camera;
    in.mode = e->mode;
    in.locks = e->locks;
    return writeOut(buf, cap, answerQuestion(question, in, &e->last));
}

} // extern "C"
