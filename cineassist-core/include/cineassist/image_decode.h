// CineAssist Core — still / live-view image decoding (JPEG, PNG, PPM via stb_image).
#pragma once

#include "cineassist/camera.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace cineassist {

// Decode an in-memory JPEG/PNG into RGB8. Used for Sony live view, which is JPEG.
bool decodeImage(const uint8_t* data, size_t size, Frame& out, std::string& error);
bool decodeImageFile(const std::string& path, Frame& out, std::string& error);

// Encode an RGB8 frame as JPEG (quality 1..100) for streaming to a monitor/UI.
bool encodeJpeg(const Frame& frame, int quality, std::vector<uint8_t>& out);

// Write a binary PPM (P6) — dependency-free way to dump what the engine saw.
bool writePpm(const std::string& path, const Frame& frame);

} // namespace cineassist
