// CineAssist Core unit + closed-loop tests. Dependency-free; run via ctest.
#include "cineassist/backends.h"
#include "cineassist/camera_math.h"
#include "cineassist/cineassist_c.h"
#include "cineassist/frame_analyzer.h"
#include "cineassist/guidance_engine.h"
#include "cineassist/json.h"
#include "cineassist/project.h"
#include "cineassist/session.h"

#include "sim/sim_camera.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

using namespace cineassist;

namespace {

int gFailures = 0;
int gChecks = 0;

#define CHECK(cond)                                                                 \
    do {                                                                            \
        ++gChecks;                                                                  \
        if (!(cond)) {                                                              \
            ++gFailures;                                                            \
            std::printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);           \
        }                                                                           \
    } while (0)

#define CHECK_NEAR(a, b, tol)                                                       \
    do {                                                                            \
        ++gChecks;                                                                  \
        const double _a = (a), _b = (b);                                            \
        if (std::fabs(_a - _b) > (tol)) {                                           \
            ++gFailures;                                                            \
            std::printf("  FAIL %s:%d: %s = %g, expected %g ± %g\n", __FILE__,     \
                        __LINE__, #a, _a, _b, static_cast<double>(tol));            \
        }                                                                           \
    } while (0)

struct TestCase { const char* name; std::function<void()> fn; };
std::vector<TestCase>& tests() { static std::vector<TestCase> t; return t; }
struct Register { Register(const char* n, std::function<void()> f) { tests().push_back({n, std::move(f)}); } };
#define TEST(name) static void name(); static Register reg_##name(#name, name); static void name()

const std::string kSample = std::string(CINEASSIST_EXAMPLES_DIR) + "/sample_project.json";

bool hasGuidance(const EngineOutput& o, const std::string& idPrefix) {
    for (const auto& g : o.guidance) if (g.id.rfind(idPrefix, 0) == 0) return true;
    return false;
}

std::vector<uint8_t> flatGray(int w, int h, uint8_t v) { return std::vector<uint8_t>(static_cast<size_t>(w) * h, v); }

} // namespace

// ─── camera math ───────────────────────────────────────────────────────────────

TEST(math_shutter) {
    CHECK_NEAR(math::shutterSecondsFromAngle(180, 24), 1.0 / 48, 1e-9);
    CHECK_NEAR(math::shutterAngleFromSeconds(1.0 / 50, 25), 180, 1e-9);
    CHECK_NEAR(math::shutterAngleFromSeconds(1.0 / 50, 23.976), 172.6, 0.1);
    CHECK(math::formatShutter(1.0 / 48) == "1/48");
    CHECK(math::formatAngle(172.8) == "172.8°");
}

TEST(math_stops) {
    CHECK_NEAR(math::apertureStops(2.8, 5.6), 2.0, 1e-9);
    CHECK_NEAR(math::apertureAfterStops(4.0, -2), 2.0, 1e-9);
    CHECK_NEAR(math::isoStops(800, 3200), 2.0, 1e-9);
    CHECK_NEAR(math::ndDensityToStops(0.9), 3.0, 1e-9);
    CHECK_NEAR(math::nearestThirdStopAperture(3.9), 4.0, 1e-9);
    CHECK(math::formatStops(1.0 / 3) == "+1/3 stop");
    CHECK(math::formatStops(-1.34) == "-1 1/3 stops");
    CHECK(math::formatStops(2) == "+2 stops");
    CHECK(math::formatAperture(2.0, true) == "T2");
    CHECK(math::formatAperture(2.8) == "f/2.8");
}

TEST(math_parse) {
    CHECK_NEAR(math::parseStop("T2.8"), 2.8, 1e-9);
    CHECK_NEAR(math::parseStop("f/4"), 4, 1e-9);
    CHECK_NEAR(math::parseShutterSpeed("1/48"), 1.0 / 48, 1e-9);
    CHECK_NEAR(math::parseAngle("172.8°"), 172.8, 1e-9);
    CHECK_NEAR(math::parseFrameRate("23.98fps"), 23.976, 1e-9);
    CHECK_NEAR(math::parseFrameRate("4K UHD 24fps"), 24, 1e-9);
    CHECK_NEAR(math::parseFrameRate("4K 60p"), 60, 1e-9);
    CHECK(math::parseKelvin("5600K") == 5600);
    CHECK(math::parseKelvin("3.2K") == 3200);
    CHECK_NEAR(math::parseFocalLength("100mm Macro"), 100, 1e-9);
    CHECK_NEAR(math::parseNdStops("ND 0.6"), 2, 1e-9);
    CHECK_NEAR(math::parseNdStops("Clear"), 0, 1e-9);
    CHECK_NEAR(math::parseNdStops("ND9"), 3, 1e-9);
    CHECK(math::parseIso("ISO 3200") == 3200);
}

TEST(math_flicker) {
    CHECK(math::isFlickerSafe(1.0 / 50, 50));    // 172.8° at 24p in PAL
    CHECK(math::isFlickerSafe(1.0 / 60, 60));
    CHECK(math::isFlickerSafe(1.0 / 120, 60));
    CHECK(!math::isFlickerSafe(1.0 / 48, 50));
    CHECK(!math::isFlickerSafe(1.0 / 48, 60));
}

// ─── json ──────────────────────────────────────────────────────────────────────

TEST(json_roundtrip) {
    std::string err;
    const auto v = json::parse(R"({"a":[1,2.5,"x\né🎬"],"b":{"c":true,"d":null},"e":-1e3})", &err);
    CHECK(err.empty());
    CHECK(v["a"].size() == 3);
    CHECK_NEAR(v["a"][1].asNumber(), 2.5, 1e-12);
    CHECK(v["a"][2].asString() == "x\n\xC3\xA9\xF0\x9F\x8E\xAC");
    CHECK(v["b"]["c"].asBool());
    CHECK(v["b"]["d"].isNull());
    CHECK_NEAR(v["e"].asNumber(), -1000, 1e-9);
    CHECK(v["missing"]["deep"].isNull());
    const auto again = json::parse(v.dump(2), &err);
    CHECK(err.empty());
    CHECK(again.dump() == v.dump());
}

TEST(json_errors) {
    std::string err;
    json::parse("{\"a\":1,}", &err);
    CHECK(!err.empty());
    err.clear();
    json::parse("[1 2]", &err);
    CHECK(!err.empty());
    err.clear();
    json::parse("\"unterminated", &err);
    CHECK(!err.empty());
    err.clear();
    json::parse("  {}  ", &err);
    CHECK(err.empty());
}

// ─── project ───────────────────────────────────────────────────────────────────

TEST(project_load_sample) {
    Project p;
    std::string err;
    CHECK(loadProjectFile(kSample, p, &err));
    CHECK(err.empty());
    CHECK(p.title == "The Last Frame");
    CHECK(p.scenes.size() == 2);
    CHECK(p.scenes[0].shots.size() == 4);
    CHECK_NEAR(p.scenes[0].shots[1].focalLengthMm, 85, 1e-9);
    CHECK(p.scenes[0].shots[0].status == ShotStatus::Approved);
    CHECK_NEAR(p.camera.tStop, 2.8, 1e-9);
    CHECK_NEAR(p.camera.tStopMin, 2.0, 1e-9);
    CHECK_NEAR(p.camera.tStopMax, 5.6, 1e-9);
    CHECK(p.camera.iso == 800);
    CHECK(p.camera.nativeIsos.size() == 2 && p.camera.nativeIsos[1] == 12800);
    CHECK_NEAR(p.camera.shutterAngle, 180, 1e-9);
    CHECK_NEAR(p.camera.frameRate, 23.976, 1e-9);
    CHECK(p.camera.whiteBalanceK == 5600);
    CHECK_NEAR(p.camera.focalLengthMm, 50, 1e-9);
    CHECK(p.scenes[0].lighting.practicals.size() == 1);
}

TEST(project_onset_api_shape) {
    // Shape returned by GET /api/onset/:projectId, with Mongo-style _id.
    const char* src = R"({"scenes":[{"title":"S","shots":[{"_id":"abc","type":"CU","lens":"85mm","status":"approved"}]}],
                          "cameraSettings":{"iso":{"value":"1600"},"exposure":{"value":"T4"},"frameRate":"25fps"}})";
    Project p;
    std::string err;
    CHECK(projectFromJson(json::parse(src), p, &err));
    CHECK(p.scenes[0].shots[0].id == "abc");
    CHECK(p.camera.iso == 1600);
    CHECK_NEAR(p.camera.tStop, 4, 1e-9);
    CHECK_NEAR(p.camera.frameRate, 25, 1e-9);
    // Round trip keeps what the engine needs.
    Project q;
    CHECK(projectFromJson(projectToJson(p), q, &err));
    CHECK(q.scenes[0].shots[0].status == ShotStatus::Approved);
    CHECK(q.camera.iso == 1600);
}

// ─── frame analysis ────────────────────────────────────────────────────────────

TEST(analyzer_exposure) {
    FrameAnalyzer a;
    // Rec.709 code value for 18% grey ≈ 0.409 -> 104/255.
    auto grey = flatGray(640, 360, 104);
    FrameView v{grey.data(), 640, 360, 0, PixelFormat::Gray8, false};
    FrameStats s = a.analyze(v);
    CHECK(s.valid);
    CHECK_NEAR(s.evOffset, 0, 0.25);
    CHECK_NEAR(s.clippedFraction, 0, 1e-9);

    auto white = flatGray(640, 360, 255);
    v.data = white.data();
    s = a.analyze(v);
    CHECK_NEAR(s.clippedFraction, 1.0, 1e-9);
    CHECK(s.evOffset > 2);

    auto dark = flatGray(640, 360, 20);
    v.data = dark.data();
    s = a.analyze(v);
    CHECK(s.evOffset < -2);

    // Log footage: S-Log3 mid grey sits at ~41% code value.
    auto logGrey = flatGray(640, 360, static_cast<uint8_t>(0.41 * 255));
    v.data = logGrey.data();
    v.logEncoded = true;
    s = a.analyze(v);
    CHECK_NEAR(s.evOffset, 0, 0.1);
}

TEST(analyzer_focus_and_subject) {
    FrameAnalyzer a;
    const int w = 640, h = 360;
    std::vector<uint8_t> sharp(static_cast<size_t>(w) * h, 100), soft(static_cast<size_t>(w) * h, 100);
    // Fine checker only in the right third -> sharp centroid on the right.
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) {
            const bool inPatch = x > w * 0.6 && x < w * 0.9 && y > h * 0.2 && y < h * 0.6;
            if (inPatch) sharp[static_cast<size_t>(y) * w + x] = ((x / 4 + y / 4) % 2) ? 200 : 30;
            if (inPatch) soft[static_cast<size_t>(y) * w + x] = ((x / 4 + y / 4) % 2) ? 110 : 90;
        }
    const FrameStats s1 = a.analyze({sharp.data(), w, h, 0, PixelFormat::Gray8, false});
    const FrameStats s2 = a.analyze({soft.data(), w, h, 0, PixelFormat::Gray8, false});
    CHECK(s1.sharpness > s2.sharpness * 2);
    CHECK_NEAR(s1.subjectX, 0.75, 0.08);
    CHECK_NEAR(s1.subjectY, 0.4, 0.08);
}

TEST(analyzer_color_cast) {
    FrameAnalyzer a;
    const int w = 320, h = 180;
    std::vector<uint8_t> rgb(static_cast<size_t>(w) * h * 3);
    for (size_t i = 0; i < rgb.size(); i += 3) { rgb[i] = 140; rgb[i + 1] = 120; rgb[i + 2] = 100; }
    const FrameStats s = a.analyze({rgb.data(), w, h, 0, PixelFormat::RGB8, false});
    CHECK(s.colorCastRB > 0.1);
    // BGRA ordering is honoured.
    std::vector<uint8_t> bgra(static_cast<size_t>(w) * h * 4);
    for (size_t i = 0; i < bgra.size(); i += 4) { bgra[i] = 140; bgra[i + 1] = 120; bgra[i + 2] = 100; bgra[i + 3] = 255; }
    const FrameStats s2 = a.analyze({bgra.data(), w, h, 0, PixelFormat::BGRA8, false});
    CHECK(s2.colorCastRB < -0.1);
}

// ─── deviations / engine ───────────────────────────────────────────────────────

TEST(deviation_report) {
    Project p;
    CHECK(loadProjectFile(kSample, p));
    const Shot& cu = p.scenes[0].shots[1];  // 85mm
    CameraState live;
    live.connected = true;
    live.fNumber = 2.8;
    live.iso = 800;
    live.frameRate = 23.976;
    live.shutterSeconds = 1.0 / 48;
    live.whiteBalanceK = 5600;
    live.focalLengthMm = 85;
    DeviationReport r = checkDeviations(&cu, p.camera, live);
    CHECK(r.deviations.empty());
    CHECK(r.overallMatch == 100);

    live.focalLengthMm = 50;
    live.frameRate = 29.97;
    live.whiteBalanceAuto = true;
    r = checkDeviations(&cu, p.camera, live);
    // Lens, frame rate, AWB — and shutter: 1/48 at 29.97p is a 225° shutter, not 180°.
    CHECK(r.deviations.size() == 4);
    CHECK(r.deviations[0].aspect == "Frame rate");
    bool sawShutter = false;
    for (const auto& d : r.deviations) if (d.aspect == "Shutter angle") sawShutter = true;
    CHECK(sawShutter);
    CHECK(r.deviations[0].severity == Severity::Critical);
    CHECK(!r.canContinue);
    CHECK(r.overallMatch < 50);
    CHECK(!r.quickFixes.empty());
}

TEST(engine_overexposed_prefers_nd) {
    Project p;
    CHECK(loadProjectFile(kSample, p));
    GuidanceEngine engine;
    EngineInput in;
    in.scene = &p.scenes[0];
    in.shot = &p.scenes[0].shots[2];
    in.planned = &p.camera;
    in.camera.connected = true;
    in.camera.fNumber = 2.8;
    in.camera.iso = 800;
    in.camera.frameRate = 23.976;
    in.camera.shutterSeconds = 1.0 / 48;
    in.camera.whiteBalanceK = 5600;
    in.camera.focalLengthMm = 50;
    in.frame.valid = true;
    in.frame.evOffset = 2.0;
    in.frame.medianLuma = in.frame.meanLuma = 0.8;
    in.frame.centerSharpness = in.frame.sharpness = 0.5;
    const EngineOutput out = engine.evaluate(in);
    CHECK(hasGuidance(out, "exposure.over"));
    CHECK(!out.adjustments.empty());
    CHECK(out.adjustments[0].property == CameraAdjustment::Property::NdStops);
    CHECK_NEAR(out.adjustments[0].value, 2, 1e-9);
    CHECK(out.readiness < 100);
}

TEST(engine_underexposed_pulls_nd_then_iso) {
    GuidanceEngine engine;
    PlannedSettings plan;
    plan.tStop = 2.8;
    plan.tStopMin = 2.8;     // iris may not open further
    plan.iso = 800;
    plan.nativeIsos = {800, 3200};
    EngineInput in;
    in.planned = &plan;
    in.camera.connected = true;
    in.camera.fNumber = 2.8;
    in.camera.iso = 800;
    in.camera.ndStops = 1;
    in.frame.valid = true;
    in.frame.evOffset = -3;
    in.frame.centerSharpness = 0.5;
    in.frame.meanLuma = 0.1;
    const EngineOutput out = engine.evaluate(in);
    CHECK(out.adjustments.size() >= 2);
    CHECK(out.adjustments[0].property == CameraAdjustment::Property::NdStops);
    CHECK_NEAR(out.adjustments[0].value, 0, 1e-9);
    CHECK(out.adjustments[1].property == CameraAdjustment::Property::Iso);
    CHECK_NEAR(out.adjustments[1].value, 3200, 1e-9);
    // 1 (ND) + 2 (ISO) = 3 stops: nothing left for lighting.
    CHECK(!hasGuidance(out, "light.balance"));
}

TEST(engine_lock_mode_routes_to_lighting) {
    GuidanceEngine engine;
    PlannedSettings plan;
    plan.tStop = 2.8;
    EngineInput in;
    in.planned = &plan;
    in.mode = GuidanceMode::Lock;
    in.locks.camera = true;
    in.camera.connected = true;
    in.camera.fNumber = 2.8;
    in.camera.iso = 800;
    in.frame.valid = true;
    in.frame.evOffset = 1.7;
    in.frame.centerSharpness = 0.5;
    const EngineOutput out = engine.evaluate(in);
    CHECK(out.adjustments.empty());
    CHECK(hasGuidance(out, "light.balance"));
    bool lockedListedLast = true, seenLocked = false;
    for (const auto& g : out.guidance) {
        if (g.blockedByLock) seenLocked = true;
        else if (seenLocked) lockedListedLast = false;
    }
    CHECK(seenLocked);
    CHECK(lockedListedLast);
}

TEST(engine_flicker_and_battery) {
    Project p;
    CHECK(loadProjectFile(kSample, p));
    EngineConfig cfg;
    cfg.mainsHz = 50;
    GuidanceEngine engine(cfg);
    EngineInput in;
    in.scene = &p.scenes[0];   // INT. with practicals
    in.shot = &p.scenes[0].shots[3];
    in.planned = &p.camera;
    in.camera.connected = true;
    in.camera.frameRate = 23.976;
    in.camera.shutterSeconds = 1.0 / 48;
    in.camera.batteryPercent = 9;
    const EngineOutput out = engine.evaluate(in);
    CHECK(hasGuidance(out, "light.flicker"));
    CHECK(hasGuidance(out, "hw.battery"));
    bool proposesSafeShutter = false;
    for (const auto& a : out.adjustments)
        if (a.property == CameraAdjustment::Property::ShutterAngle && math::isFlickerSafe(math::shutterSecondsFromAngle(a.value, 23.976), 50))
            proposesSafeShutter = true;
    CHECK(proposesSafeShutter);
}

TEST(engine_focus_drift_while_recording) {
    GuidanceEngine engine;
    EngineInput in;
    in.camera.connected = true;
    in.camera.recording = true;
    in.frame.valid = true;
    in.frame.meanLuma = in.frame.medianLuma = 0.41;
    in.frame.centerSharpness = in.frame.sharpness = 0.6;
    for (int i = 0; i < 10; ++i) engine.evaluate(in);
    in.frame.centerSharpness = 0.2;
    EngineOutput out;
    for (int i = 0; i < 15; ++i) out = engine.evaluate(in);
    CHECK(hasGuidance(out, "focus.drift"));
    engine.resetShot();
    out = engine.evaluate(in);
    CHECK(!hasGuidance(out, "focus.drift"));
}

// Closed loop: sim camera is 2 stops hot; repeatedly apply the engine's first
// proposal and check the image converges to correct exposure.
TEST(closed_loop_sim_converges) {
    Project p;
    CHECK(loadProjectFile(kSample, p));
    SimSceneParams sp;
    sp.sceneGain = 4.0;
    sp.windowGain = 1.0;   // no hot window, so only overall exposure is wrong
    SimCamera cam(sp);
    std::string err;
    CHECK(cam.connect("", err));
    FrameAnalyzer analyzer;
    EngineConfig cfg;
    cfg.smoothing = 1.0;
    GuidanceEngine engine(cfg);
    Frame f;
    double ev = 99;
    for (int i = 0; i < 6; ++i) {
        CHECK(cam.liveView(f));
        EngineInput in;
        in.scene = &p.scenes[0];
        in.shot = &p.scenes[0].shots[2];
        in.planned = &p.camera;
        in.camera = cam.state();
        in.frame = analyzer.analyze(f.view());
        in.mode = GuidanceMode::Assist;
        const EngineOutput out = engine.evaluate(in);
        ev = out.smoothedFrame.evOffset;
        bool appliedExposure = false;
        for (const auto& a : out.adjustments) {
            if (a.guidanceId.rfind("exposure.", 0) == 0) { CHECK(cam.apply(a, err)); appliedExposure = true; break; }
        }
        if (!appliedExposure) break;
    }
    CHECK_NEAR(ev, 0, 1.0);
    CHECK(cam.state().ndStops > 0);   // solved with ND, not by wrecking the stop
    CHECK_NEAR(cam.state().fNumber, 2.8, 1e-9);
}

// ─── session ───────────────────────────────────────────────────────────────────

TEST(session_progress_persists) {
    const std::string save = std::string(CINEASSIST_EXAMPLES_DIR) + "/../build_test_session.json";
    std::remove(save.c_str());
    {
        Session s;
        std::string err;
        CHECK(s.open(kSample, save, &err));
        CHECK(s.sceneIndex() == 0 && s.shotIndex() == 0);
        CHECK(s.selectShot(1));
        const int cov = s.completeShot("Take 2 good", "AC");
        CHECK(cov == 50);   // 1 approved + this one, of 4
        s.addNote("Rain machine timing off by 1s");
        CHECK(s.nextShot());
        CHECK(s.nextShot());
        CHECK(s.nextShot());   // crosses into scene 2
        CHECK(s.sceneIndex() == 1 && s.shotIndex() == 0);
        CHECK(s.prevShot());
        CHECK(s.sceneIndex() == 0 && s.shotIndex() == 3);
    }
    Session again;
    CHECK(again.open(kSample, save));
    const Shot& cu = again.project().scenes[0].shots[1];
    CHECK(cu.completedOnSet);
    CHECK(cu.takes == 1);
    CHECK(cu.notes.size() == 2);
    CHECK(cu.status == ShotStatus::Approved);
    std::remove(save.c_str());
}

TEST(answer_question_routes) {
    Project p;
    CHECK(loadProjectFile(kSample, p));
    EngineInput in;
    in.scene = &p.scenes[0];
    in.shot = &p.scenes[0].shots[1];
    in.planned = &p.camera;
    const std::string lens = answerQuestion("what lens is next?", in);
    CHECK(lens.find("85mm") != std::string::npos);
    CHECK(lens.find("Medium on 50mm") != std::string::npos);
    const std::string cov = answerQuestion("what coverage is left", in);
    CHECK(cov.find("25%") != std::string::npos);
    const std::string alt = answerQuestion("we lose the reverse before lunch", in);
    CHECK(alt.find("alt shot division") != std::string::npos);
}

// ─── C ABI ─────────────────────────────────────────────────────────────────────

TEST(c_api_end_to_end) {
    ca_engine* e = ca_engine_create(nullptr);
    CHECK(e != nullptr);
    char err[128] = {0};
    CHECK(ca_engine_load_project_file(e, kSample.c_str(), err, sizeof err) == 0);
    CHECK(ca_engine_scene_count(e) == 2);
    CHECK(ca_engine_shot_count(e, 0) == 4);
    CHECK(ca_engine_select(e, 0, 1) == 0);
    char label[96];
    ca_engine_current_shot_label(e, label, sizeof label);
    CHECK(std::strstr(label, "Close-Up") != nullptr);

    ca_camera_state st;
    std::memset(&st, 0, sizeof st);
    st.connected = 1;
    st.f_number = 2.8;
    st.iso = 800;
    st.shutter_seconds = 1.0 / 48;
    st.frame_rate = 23.976;
    st.white_balance_k = 5600;
    st.focal_length_mm = 85;
    st.battery_percent = -1;
    ca_engine_set_camera_state(e, &st);
    auto grey = flatGray(320, 180, 104);
    CHECK(ca_engine_push_frame(e, grey.data(), 320, 180, 320, CA_PIXEL_GRAY8, 0) == 0);
    ca_engine_evaluate(e);
    CHECK(ca_engine_plan_match(e) == 100);
    ca_frame_stats fs;
    CHECK(ca_engine_get_frame_stats(e, &fs) == 0);
    CHECK(fs.valid == 1);

    const size_t need = ca_engine_result_json(e, nullptr, 0);
    std::string buf(need + 1, '\0');
    ca_engine_result_json(e, &buf[0], buf.size());
    std::string jerr;
    const auto parsed = json::parse(buf.c_str(), &jerr);
    CHECK(jerr.empty());
    CHECK(parsed["deviations"]["overallMatch"].asInt() == 100);

    // Truncation is safe and still NUL-terminated.
    char tiny[8];
    ca_engine_result_json(e, tiny, sizeof tiny);
    CHECK(std::strlen(tiny) == 7);

    char answer[512];
    CHECK(ca_engine_ask(e, "what lens?", answer, sizeof answer) > 0);
    CHECK(ca_engine_complete_shot(e, "good") == 50);
    ca_engine_destroy(e);
}

int main() {
    registerBuiltinBackends();
    for (const auto& t : tests()) {
        const int before = gFailures;
        t.fn();
        std::printf("%s %s\n", gFailures == before ? "PASS" : "FAIL", t.name);
    }
    std::printf("\n%d checks, %d failures, %zu tests\n", gChecks, gFailures, tests().size());
    return gFailures == 0 ? 0 : 1;
}
