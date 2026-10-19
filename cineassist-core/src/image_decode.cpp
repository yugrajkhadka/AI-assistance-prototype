#include "cineassist/image_decode.h"

#include <cstdio>
#include <cstring>

// Only the decoders the camera path needs; keeps code size down on embedded targets.
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STBI_ONLY_PNM
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBI_WRITE_NO_STDIO
#include "stb_image_write.h"

namespace cineassist {

bool decodeImage(const uint8_t* data, size_t size, Frame& out, std::string& error) {
    if (!data || size == 0 || size > 0x7fffffff) {
        error = "empty image buffer";
        return false;
    }
    int w = 0, h = 0, comp = 0;
    unsigned char* px = stbi_load_from_memory(data, static_cast<int>(size), &w, &h, &comp, 3);
    if (!px) {
        error = std::string("image decode failed: ") + (stbi_failure_reason() ? stbi_failure_reason() : "unknown");
        return false;
    }
    out.width = w;
    out.height = h;
    out.format = PixelFormat::RGB8;
    out.pixels.assign(px, px + static_cast<size_t>(w) * h * 3);
    stbi_image_free(px);
    return true;
}

bool decodeImageFile(const std::string& path, Frame& out, std::string& error) {
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) {
        error = "cannot open " + path;
        return false;
    }
    int w = 0, h = 0, comp = 0;
    unsigned char* px = stbi_load_from_file(f, &w, &h, &comp, 3);
    std::fclose(f);
    if (!px) {
        error = "cannot decode " + path + ": " + (stbi_failure_reason() ? stbi_failure_reason() : "unknown");
        return false;
    }
    out.width = w;
    out.height = h;
    out.format = PixelFormat::RGB8;
    out.pixels.assign(px, px + static_cast<size_t>(w) * h * 3);
    stbi_image_free(px);
    return true;
}

bool encodeJpeg(const Frame& frame, int quality, std::vector<uint8_t>& out) {
    if (frame.format != PixelFormat::RGB8 || frame.pixels.empty()) return false;
    out.clear();
    auto sink = [](void* ctx, void* data, int size) {
        auto* v = static_cast<std::vector<uint8_t>*>(ctx);
        const auto* p = static_cast<const uint8_t*>(data);
        v->insert(v->end(), p, p + size);
    };
    return stbi_write_jpg_to_func(sink, &out, frame.width, frame.height, 3, frame.pixels.data(), quality) != 0;
}

bool writePpm(const std::string& path, const Frame& frame) {
    if (frame.format != PixelFormat::RGB8 || frame.pixels.empty()) return false;
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    std::fprintf(f, "P6\n%d %d\n255\n", frame.width, frame.height);
    const size_t n = std::fwrite(frame.pixels.data(), 1, frame.pixels.size(), f);
    std::fclose(f);
    return n == frame.pixels.size();
}

} // namespace cineassist
