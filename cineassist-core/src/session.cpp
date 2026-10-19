#include "cineassist/session.h"

#include "cineassist/guidance_engine.h"
#include "cineassist/project.h"

#include <ctime>

namespace cineassist {

bool Session::open(const std::string& projectPath, const std::string& savePath, std::string* error) {
    Project p;
    // Resume from the save file if it exists, so a restart keeps the day's progress.
    if (!savePath.empty() && loadProjectFile(savePath, p, nullptr)) {
        project_ = std::move(p);
    } else if (!loadProjectFile(projectPath, project_, error)) {
        return false;
    }
    savePath_ = savePath;
    scene_ = shot_ = 0;
    take_ = 1;
    // Start on the first shot that isn't done yet.
    for (size_t s = 0; s < project_.scenes.size(); ++s) {
        for (size_t i = 0; i < project_.scenes[s].shots.size(); ++i) {
            if (!project_.scenes[s].shots[i].completedOnSet) {
                scene_ = s;
                shot_ = i;
                take_ = project_.scenes[s].shots[i].takes + 1;
                return true;
            }
        }
    }
    return true;
}

void Session::openInMemory(Project project) {
    project_ = std::move(project);
    savePath_.clear();
    scene_ = shot_ = 0;
    take_ = 1;
}

const Scene* Session::scene() const {
    return scene_ < project_.scenes.size() ? &project_.scenes[scene_] : nullptr;
}

const Shot* Session::shot() const {
    const Scene* sc = scene();
    return sc && shot_ < sc->shots.size() ? &sc->shots[shot_] : nullptr;
}

Shot* Session::shot() {
    if (scene_ >= project_.scenes.size()) return nullptr;
    auto& shots = project_.scenes[scene_].shots;
    return shot_ < shots.size() ? &shots[shot_] : nullptr;
}

bool Session::selectScene(size_t index) {
    if (index >= project_.scenes.size()) return false;
    scene_ = index;
    shot_ = 0;
    take_ = shot() ? shot()->takes + 1 : 1;
    return true;
}

bool Session::selectShot(size_t index) {
    const Scene* sc = scene();
    if (!sc || index >= sc->shots.size()) return false;
    shot_ = index;
    take_ = sc->shots[index].takes + 1;
    return true;
}

bool Session::nextShot() {
    const Scene* sc = scene();
    if (!sc) return false;
    if (shot_ + 1 < sc->shots.size()) return selectShot(shot_ + 1);
    for (size_t s = scene_ + 1; s < project_.scenes.size(); ++s) {
        if (!project_.scenes[s].shots.empty()) {
            scene_ = s;
            return selectShot(0);
        }
    }
    return false;
}

bool Session::prevShot() {
    if (shot_ > 0) return selectShot(shot_ - 1);
    for (size_t s = scene_; s-- > 0;) {
        if (!project_.scenes[s].shots.empty()) {
            scene_ = s;
            return selectShot(project_.scenes[s].shots.size() - 1);
        }
    }
    return false;
}

int Session::completeShot(const std::string& notes, const std::string& author) {
    Shot* s = shot();
    if (!s) return 0;
    s->completedOnSet = true;
    s->takes += 1;
    s->status = ShotStatus::Approved;
    if (!notes.empty()) s->notes.push_back({notes, author, static_cast<int64_t>(std::time(nullptr))});
    take_ = s->takes + 1;
    save();
    return sceneCoverage(project_.scenes[scene_]);
}

void Session::setShotStatus(ShotStatus st) {
    if (Shot* s = shot()) {
        s->status = st;
        save();
    }
}

void Session::addNote(const std::string& text, const std::string& author) {
    if (Shot* s = shot()) {
        s->notes.push_back({text, author, static_cast<int64_t>(std::time(nullptr))});
        save();
    }
}

bool Session::save(std::string* error) const {
    if (savePath_.empty()) return true;
    return saveProjectFile(savePath_, project_, error);
}

} // namespace cineassist
