// CineAssist Core — load / save the pre-production plan.
//
// Accepts every JSON shape the web app produces:
//   * GET /api/onset/:projectId          -> { scenes, cameraSettings, approvalLog }
//   * a full Analysis document          -> { project, scenes, cameraSettings, ... }
//   * { project: {...}, analysis: {...} } wrapper
// Saving writes the same { scenes, cameraSettings } shape back, so the web app can
// re-import what happened on set (takes, statuses, notes).
#pragma once

#include "cineassist/json.h"
#include "cineassist/types.h"

#include <string>

namespace cineassist {

bool projectFromJson(const json::Value& root, Project& out, std::string* error = nullptr);
json::Value projectToJson(const Project& project);

bool loadProjectFile(const std::string& path, Project& out, std::string* error = nullptr);
bool saveProjectFile(const std::string& path, const Project& project, std::string* error = nullptr);

PlannedSettings plannedSettingsFromJson(const json::Value& cameraSettings);
json::Value plannedSettingsToJson(const PlannedSettings& s);

json::Value cameraStateToJson(const CameraState& s);
json::Value guidanceToJson(const Guidance& g);
json::Value frameStatsToJson(const FrameStats& s);
json::Value deviationReportToJson(const DeviationReport& r);

} // namespace cineassist
