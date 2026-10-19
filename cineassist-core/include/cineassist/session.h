// CineAssist Core — on-set session.
//
// Owns the loaded project, tracks the active scene/shot, takes and notes, and
// persists every change to disk immediately (atomic write) so nothing is lost if
// the rig loses power. Port of the server's on-set routes (server/src/routes/onset.js).
#pragma once

#include "cineassist/types.h"

#include <string>

namespace cineassist {

class Session {
public:
    // Load the plan. `savePath` is where on-set progress is written ("" = no persistence).
    bool open(const std::string& projectPath, const std::string& savePath, std::string* error = nullptr);
    void openInMemory(Project project);

    Project& project() { return project_; }
    const Project& project() const { return project_; }

    size_t sceneIndex() const { return scene_; }
    size_t shotIndex() const { return shot_; }
    const Scene* scene() const;
    const Shot* shot() const;
    Shot* shot();

    bool selectScene(size_t index);
    bool selectShot(size_t index);
    bool nextShot();   // advances into the next scene when this one is done
    bool prevShot();

    // Mark the current shot complete for this take (mirrors POST .../complete).
    // Returns the new coverage percentage for the scene.
    int completeShot(const std::string& notes = "", const std::string& author = "On-Set");
    void setShotStatus(ShotStatus s);
    void addNote(const std::string& text, const std::string& author = "On-Set");
    int currentTake() const { return take_; }

    bool save(std::string* error = nullptr) const;

private:
    Project project_;
    std::string savePath_;
    size_t scene_ = 0;
    size_t shot_ = 0;
    int take_ = 1;
};

} // namespace cineassist
