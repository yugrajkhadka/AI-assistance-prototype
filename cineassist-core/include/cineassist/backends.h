#pragma once

#include "cineassist/camera.h"

namespace cineassist {

// Register every backend compiled into this build ("sim" always; "sony" when
// built with the Sony Camera Remote SDK). Call once at start-up.
void registerBuiltinBackends();

} // namespace cineassist
