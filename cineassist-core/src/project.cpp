#include "cineassist/project.h"

#include "cineassist/camera_math.h"

#include <cmath>

namespace cineassist {

namespace {

std::vector<std::string> stringList(const json::Value& v) {
    std::vector<std::string> out;
    for (const auto& item : v.items()) {
        if (item.isString()) out.push_back(item.asString());
    }
    return out;
}

json::Value stringListJson(const std::vector<std::string>& list) {
    json::Value arr = json::Value::array();
    for (const auto& s : list) arr.push(s);
    return arr;
}

// Web app values are often strings ("T2.8", "800", "5600K"); accept numbers too.
double stopFrom(const json::Value& v) { return v.isNumber() ? v.asNumber() : math::parseStop(v.asString()); }
int isoFrom(const json::Value& v) { return v.isNumber() ? v.asInt() : math::parseIso(v.asString()); }

LightSource lightFromJson(const json::Value& v) {
    LightSource l;
    l.type = v["type"].asString();
    l.position = v["position"].asString();
    l.color = v["color"].asString();
    l.intensity = v["intensity"].asNumber();
    return l;
}

json::Value lightToJson(const LightSource& l) {
    json::Value o = json::Value::object();
    o.set("type", l.type);
    o.set("position", l.position);
    o.set("intensity", l.intensity);
    o.set("color", l.color);
    return o;
}

Shot shotFromJson(const json::Value& v, size_t index) {
    Shot s;
    s.id = v["_id"].asString(v["id"].asString());
    if (s.id.empty()) s.id = "shot-" + std::to_string(index + 1);
    s.type = v["type"].asString();
    s.description = v["description"].asString();
    s.lens = v["lens"].asString();
    s.focalLengthMm = math::parseFocalLength(s.lens);
    s.movement = v["movement"].asString();
    s.angle = v["angle"].asString();
    s.lighting = v["lighting"].asString();
    s.duration = v["duration"].asString();
    s.intent = v["intent"].asString();
    s.status = shotStatusFromString(v["status"].asString("pending"));
    s.locked = v["locked"].asBool();
    s.completedOnSet = v["completedOnSet"].asBool();
    s.takes = v["takes"].asInt();
    s.confidence = v["confidence"].asInt();
    for (const auto& n : v["notes"].items()) {
        ShotNote note;
        note.text = n["text"].asString();
        note.author = n["author"].asString();
        note.createdAtUnix = static_cast<int64_t>(n["createdAtUnix"].asNumber());
        s.notes.push_back(note);
    }
    return s;
}

json::Value shotToJson(const Shot& s) {
    json::Value o = json::Value::object();
    o.set("id", s.id);
    o.set("type", s.type);
    o.set("description", s.description);
    o.set("lens", s.lens);
    o.set("movement", s.movement);
    o.set("angle", s.angle);
    o.set("lighting", s.lighting);
    o.set("duration", s.duration);
    if (!s.intent.empty()) o.set("intent", s.intent);
    o.set("status", toString(s.status));
    o.set("locked", s.locked);
    o.set("confidence", s.confidence);
    o.set("completedOnSet", s.completedOnSet);
    o.set("takes", s.takes);
    json::Value notes = json::Value::array();
    for (const auto& n : s.notes) {
        json::Value no = json::Value::object();
        no.set("text", n.text);
        no.set("author", n.author);
        no.set("createdAtUnix", static_cast<int64_t>(n.createdAtUnix));
        notes.push(std::move(no));
    }
    o.set("notes", std::move(notes));
    return o;
}

Scene sceneFromJson(const json::Value& v, size_t index) {
    Scene sc;
    sc.number = v["number"].asInt(static_cast<int>(index + 1));
    sc.title = v["title"].asString();
    sc.description = v["description"].asString();
    sc.mood = v["mood"].asString();
    sc.style = v["style"].asString();
    sc.duration = v["duration"].asString();
    sc.characters = stringList(v["characters"]);
    sc.locations = stringList(v["locations"]);
    sc.props = stringList(v["props"]);
    const auto& shots = v["shots"].items();
    for (size_t i = 0; i < shots.size(); ++i) sc.shots.push_back(shotFromJson(shots[i], i));
    const auto& lp = v["lightingPlan"];
    sc.lighting.key = lightFromJson(lp["keyLight"]);
    sc.lighting.fill = lightFromJson(lp["fillLight"]);
    sc.lighting.back = lightFromJson(lp["backLight"]);
    sc.lighting.practicals = stringList(lp["practicals"]);
    sc.lighting.ratio = lp["ratio"].asString();
    sc.lighting.notes = lp["notes"].asString();
    return sc;
}

json::Value sceneToJson(const Scene& sc) {
    json::Value o = json::Value::object();
    o.set("number", sc.number);
    o.set("title", sc.title);
    o.set("description", sc.description);
    o.set("mood", sc.mood);
    o.set("style", sc.style);
    o.set("duration", sc.duration);
    o.set("characters", stringListJson(sc.characters));
    o.set("locations", stringListJson(sc.locations));
    o.set("props", stringListJson(sc.props));
    json::Value shots = json::Value::array();
    for (const auto& s : sc.shots) shots.push(shotToJson(s));
    o.set("shots", std::move(shots));
    json::Value lp = json::Value::object();
    lp.set("keyLight", lightToJson(sc.lighting.key));
    lp.set("fillLight", lightToJson(sc.lighting.fill));
    lp.set("backLight", lightToJson(sc.lighting.back));
    lp.set("practicals", stringListJson(sc.lighting.practicals));
    lp.set("ratio", sc.lighting.ratio);
    lp.set("notes", sc.lighting.notes);
    o.set("lightingPlan", std::move(lp));
    return o;
}

} // namespace

PlannedSettings plannedSettingsFromJson(const json::Value& cs) {
    PlannedSettings p;
    const auto& exposure = cs["exposure"];
    const auto& lens = cs["lens"];
    p.tStop = stopFrom(exposure["tStop"]);
    if (p.tStop <= 0) p.tStop = stopFrom(exposure["value"]);
    if (p.tStop <= 0) p.tStop = stopFrom(lens["tStop"]);
    p.tStopMin = stopFrom(exposure["min"]);
    p.tStopMax = stopFrom(exposure["max"]);

    const auto& iso = cs["iso"];
    p.iso = iso.isObject() ? isoFrom(iso["value"]) : isoFrom(iso);
    p.isoMin = isoFrom(iso["min"]);
    p.isoMax = isoFrom(iso["max"]);
    // "800 / 3200" -> {800, 3200}
    const std::string native = iso["nativeISOs"].asString();
    for (size_t i = 0; i < native.size();) {
        if (std::isdigit(static_cast<unsigned char>(native[i]))) {
            size_t j = i;
            while (j < native.size() && std::isdigit(static_cast<unsigned char>(native[j]))) ++j;
            p.nativeIsos.push_back(std::stoi(native.substr(i, j - i)));
            i = j;
        } else {
            ++i;
        }
    }

    p.frameRate = math::parseFrameRate(cs["frameRate"].asString());
    if (p.frameRate <= 0) p.frameRate = math::parseFrameRate(cs["resolution"].asString());
    const auto& shutter = cs["shutter"];
    p.shutterAngle = math::parseAngle(shutter["angle"].asString());
    p.shutterSeconds = math::parseShutterSpeed(shutter["value"].asString());
    if (p.shutterSeconds <= 0 && p.shutterAngle > 0 && p.frameRate > 0)
        p.shutterSeconds = math::shutterSecondsFromAngle(p.shutterAngle, p.frameRate);
    if (p.shutterAngle <= 0 && p.shutterSeconds > 0 && p.frameRate > 0)
        p.shutterAngle = math::shutterAngleFromSeconds(p.shutterSeconds, p.frameRate);

    p.whiteBalanceK = math::parseKelvin(cs["whiteBalance"]["value"].asString());
    const auto& nd = cs["nd"];
    p.ndStops = nd["stops"].isNumber() ? nd["stops"].asNumber() : math::parseNdStops(nd["value"].asString());
    p.focalLengthMm = math::parseFocalLength(lens["focal"].asString());
    p.lensType = lens["type"].asString();
    p.mount = lens["mount"].asString();
    p.camera = cs["camera"].asString();
    p.codec = cs["codec"].asString();
    p.resolution = cs["resolution"].asString();
    p.colorScience = cs["colorScience"].asString();
    return p;
}

json::Value plannedSettingsToJson(const PlannedSettings& p) {
    json::Value o = json::Value::object();
    if (!p.camera.empty()) o.set("camera", p.camera);
    if (!p.resolution.empty()) o.set("resolution", p.resolution);
    if (!p.codec.empty()) o.set("codec", p.codec);
    if (!p.colorScience.empty()) o.set("colorScience", p.colorScience);

    json::Value exposure = json::Value::object();
    exposure.set("value", math::formatAperture(p.tStop, true));
    exposure.set("tStop", math::formatAperture(p.tStop, true));
    if (p.tStopMin > 0) exposure.set("min", math::formatAperture(p.tStopMin, true));
    if (p.tStopMax > 0) exposure.set("max", math::formatAperture(p.tStopMax, true));
    o.set("exposure", std::move(exposure));

    json::Value iso = json::Value::object();
    iso.set("value", p.iso);
    if (p.isoMin > 0) iso.set("min", p.isoMin);
    if (p.isoMax > 0) iso.set("max", p.isoMax);
    if (!p.nativeIsos.empty()) {
        std::string s;
        for (size_t i = 0; i < p.nativeIsos.size(); ++i) {
            if (i) s += " / ";
            s += std::to_string(p.nativeIsos[i]);
        }
        iso.set("nativeISOs", s);
    }
    o.set("iso", std::move(iso));

    json::Value shutter = json::Value::object();
    shutter.set("value", math::formatShutter(p.shutterSeconds));
    shutter.set("angle", math::formatAngle(p.shutterAngle));
    o.set("shutter", std::move(shutter));

    json::Value wb = json::Value::object();
    wb.set("value", p.whiteBalanceK > 0 ? std::to_string(p.whiteBalanceK) + "K" : std::string("Auto"));
    wb.set("mode", p.whiteBalanceK > 0 ? "Manual" : "Auto");
    o.set("whiteBalance", std::move(wb));

    json::Value nd = json::Value::object();
    char buf[32];
    std::snprintf(buf, sizeof buf, "ND %.1f", math::ndStopsToDensity(p.ndStops));
    nd.set("value", p.ndStops > 0 ? std::string(buf) : std::string("Clear"));
    nd.set("stops", p.ndStops);
    o.set("nd", std::move(nd));

    json::Value lens = json::Value::object();
    if (p.focalLengthMm > 0) lens.set("focal", std::to_string(static_cast<int>(std::lround(p.focalLengthMm))) + "mm");
    if (!p.lensType.empty()) lens.set("type", p.lensType);
    if (!p.mount.empty()) lens.set("mount", p.mount);
    lens.set("tStop", math::formatAperture(p.tStop, true));
    o.set("lens", std::move(lens));

    o.set("frameRate", math::formatFrameRate(p.frameRate));
    return o;
}

bool projectFromJson(const json::Value& rootIn, Project& out, std::string* error) {
    out = Project();
    const json::Value* root = &rootIn;
    if (rootIn["analysis"].isObject()) {
        root = &rootIn["analysis"];
        out.title = rootIn["project"]["name"].asString(rootIn["project"]["title"].asString());
        out.id = rootIn["project"]["_id"].asString(rootIn["project"]["id"].asString());
    }
    if (!root->isObject()) {
        if (error) *error = "project JSON must be an object";
        return false;
    }
    if (out.id.empty()) out.id = (*root)["project"].isString() ? (*root)["project"].asString() : (*root)["id"].asString();
    if (out.title.empty()) out.title = (*root)["title"].asString((*root)["name"].asString("Untitled Project"));

    const auto& scenes = (*root)["scenes"];
    if (!scenes.isArray()) {
        if (error) *error = "project JSON has no \"scenes\" array";
        return false;
    }
    for (size_t i = 0; i < scenes.size(); ++i) out.scenes.push_back(sceneFromJson(scenes[i], i));
    out.camera = plannedSettingsFromJson((*root)["cameraSettings"]);
    return true;
}

json::Value projectToJson(const Project& project) {
    json::Value o = json::Value::object();
    if (!project.id.empty()) o.set("id", project.id);
    o.set("title", project.title);
    json::Value scenes = json::Value::array();
    for (const auto& sc : project.scenes) scenes.push(sceneToJson(sc));
    o.set("scenes", std::move(scenes));
    o.set("cameraSettings", plannedSettingsToJson(project.camera));
    return o;
}

bool loadProjectFile(const std::string& path, Project& out, std::string* error) {
    std::string text;
    if (!json::readFile(path, text)) {
        if (error) *error = "cannot read " + path;
        return false;
    }
    std::string parseErr;
    const json::Value root = json::parse(text, &parseErr);
    if (!parseErr.empty()) {
        if (error) *error = path + ":" + parseErr;
        return false;
    }
    return projectFromJson(root, out, error);
}

bool saveProjectFile(const std::string& path, const Project& project, std::string* error) {
    if (!json::writeFile(path, projectToJson(project).dump(2) + "\n")) {
        if (error) *error = "cannot write " + path;
        return false;
    }
    return true;
}

json::Value cameraStateToJson(const CameraState& s) {
    json::Value o = json::Value::object();
    o.set("model", s.model);
    o.set("lensModel", s.lensModel);
    o.set("connected", s.connected);
    o.set("recording", s.recording);
    o.set("fNumber", s.fNumber);
    o.set("tStop", s.tStop);
    o.set("iso", s.iso);
    o.set("isoAuto", s.isoAuto);
    o.set("shutter", math::formatShutter(s.shutterSeconds));
    o.set("shutterSeconds", s.shutterSeconds);
    o.set("shutterAngle", s.shutterAngle);
    o.set("frameRate", s.frameRate);
    o.set("whiteBalanceK", s.whiteBalanceK);
    o.set("whiteBalanceAuto", s.whiteBalanceAuto);
    o.set("ndStops", s.ndStops);
    o.set("focalLengthMm", s.focalLengthMm);
    o.set("batteryPercent", s.batteryPercent);
    return o;
}

json::Value guidanceToJson(const Guidance& g) {
    json::Value o = json::Value::object();
    o.set("id", g.id);
    o.set("category", toString(g.category));
    o.set("severity", toString(g.severity));
    o.set("title", g.title);
    o.set("detail", g.detail);
    o.set("fix", g.fix);
    o.set("confidence", g.confidence);
    o.set("blockedByLock", g.blockedByLock);
    return o;
}

json::Value frameStatsToJson(const FrameStats& s) {
    json::Value o = json::Value::object();
    o.set("valid", s.valid);
    o.set("meanLuma", s.meanLuma);
    o.set("medianLuma", s.medianLuma);
    o.set("clippedFraction", s.clippedFraction);
    o.set("crushedFraction", s.crushedFraction);
    o.set("evOffset", s.evOffset);
    o.set("sharpness", s.sharpness);
    o.set("centerSharpness", s.centerSharpness);
    o.set("contrastStops", s.contrastRatio);
    o.set("colorCastRB", s.colorCastRB);
    o.set("colorCastG", s.colorCastG);
    o.set("subjectX", s.subjectX);
    o.set("subjectY", s.subjectY);
    return o;
}

json::Value deviationReportToJson(const DeviationReport& r) {
    json::Value o = json::Value::object();
    json::Value devs = json::Value::array();
    for (const auto& d : r.deviations) {
        json::Value dj = json::Value::object();
        dj.set("aspect", d.aspect);
        dj.set("planned", d.planned);
        dj.set("actual", d.actual);
        dj.set("severity", toString(d.severity));
        dj.set("fix", d.fix);
        dj.set("impact", d.impact);
        devs.push(std::move(dj));
    }
    o.set("deviations", std::move(devs));
    o.set("overallMatch", r.overallMatch);
    json::Value fixes = json::Value::array();
    for (const auto& f : r.quickFixes) fixes.push(f);
    o.set("quickFixes", std::move(fixes));
    o.set("canContinue", r.canContinue);
    o.set("note", r.note);
    return o;
}

} // namespace cineassist
