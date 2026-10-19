#include "cineassist/camera.h"

#include "cineassist/image_decode.h"

#include <map>
#include <mutex>

namespace cineassist {

namespace {

std::mutex& registryMutex() {
    static std::mutex m;
    return m;
}

std::map<std::string, CameraFactory>& registry() {
    static std::map<std::string, CameraFactory> r;
    return r;
}

} // namespace

void registerCameraBackend(const std::string& name, CameraFactory factory) {
    std::lock_guard<std::mutex> lock(registryMutex());
    registry()[name] = std::move(factory);
}

std::vector<std::string> availableCameraBackends() {
    std::lock_guard<std::mutex> lock(registryMutex());
    std::vector<std::string> names;
    for (const auto& kv : registry()) names.push_back(kv.first);
    return names;
}

std::unique_ptr<ICamera> createCamera(const std::string& backend) {
    std::lock_guard<std::mutex> lock(registryMutex());
    auto it = registry().find(backend);
    if (it == registry().end()) return nullptr;
    return it->second();
}

bool ICamera::liveViewJpeg(std::vector<uint8_t>& out) {
    Frame frame;
    if (!liveView(frame)) return false;
    if (!frame.encoded.empty()) {
        out.swap(frame.encoded);
        return true;
    }
    return encodeJpeg(frame, 80, out);
}

} // namespace cineassist
