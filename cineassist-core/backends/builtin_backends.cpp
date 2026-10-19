// Registers the camera backends compiled into this build. Explicit (rather than
// static self-registration) so linkers never drop a backend from a static library.
#include "cineassist/backends.h"

#include "sim/sim_camera.h"
#if CINEASSIST_WITH_SONY
#include "sony/sony_camera.h"
#endif

namespace cineassist {

void registerBuiltinBackends() {
    registerCameraBackend("sim", [] { return std::make_unique<SimCamera>(); });
#if CINEASSIST_WITH_SONY
    registerCameraBackend("sony", [] { return std::make_unique<SonyCamera>(); });
#endif
}

} // namespace cineassist
