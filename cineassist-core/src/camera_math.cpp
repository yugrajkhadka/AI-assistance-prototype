#include "cineassist/camera_math.h"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>

namespace cineassist::math {

namespace {

// Lower-case copy without spaces, for tolerant parsing.
std::string squash(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        if (!std::isspace(static_cast<unsigned char>(c)))
            out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    }
    return out;
}

// First decimal number in `s` starting at or after `from`; sets `end` past it.
bool firstNumber(const std::string& s, size_t from, double& value, size_t* end = nullptr) {
    for (size_t i = from; i < s.size(); ++i) {
        const char c = s[i];
        if (std::isdigit(static_cast<unsigned char>(c)) ||
            (c == '.' && i + 1 < s.size() && std::isdigit(static_cast<unsigned char>(s[i + 1])))) {
            char* stop = nullptr;
            value = std::strtod(s.c_str() + i, &stop);
            if (end) *end = static_cast<size_t>(stop - s.c_str());
            return true;
        }
    }
    return false;
}

} // namespace

double shutterSecondsFromAngle(double angleDeg, double fps) {
    if (angleDeg <= 0 || fps <= 0) return 0;
    return angleDeg / (360.0 * fps);
}

double shutterAngleFromSeconds(double seconds, double fps) {
    if (seconds <= 0 || fps <= 0) return 0;
    return seconds * 360.0 * fps;
}

double apertureStops(double fromFNumber, double toFNumber) {
    if (fromFNumber <= 0 || toFNumber <= 0) return 0;
    return 2.0 * std::log2(toFNumber / fromFNumber);
}

double apertureAfterStops(double fNumber, double stops) {
    if (fNumber <= 0) return 0;
    return fNumber * std::pow(2.0, stops / 2.0);
}

double nearestThirdStopAperture(double fNumber) {
    static const double kScale[] = {0.95, 1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2,
                                    3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13,
                                    14, 16, 18, 20, 22};
    if (fNumber <= 0) return 0;
    double best = kScale[0];
    double bestErr = 1e9;
    for (double v : kScale) {
        const double err = std::fabs(std::log2(v / fNumber));
        if (err < bestErr) { bestErr = err; best = v; }
    }
    return best;
}

double isoStops(int fromIso, int toIso) {
    if (fromIso <= 0 || toIso <= 0) return 0;
    return std::log2(static_cast<double>(toIso) / fromIso);
}

double shutterStops(double fromSec, double toSec) {
    if (fromSec <= 0 || toSec <= 0) return 0;
    return std::log2(toSec / fromSec);
}

double ndDensityToStops(double density) { return density / 0.3; }
double ndStopsToDensity(double stops) { return stops * 0.3; }

double approxTStopFromF(double fNumber) { return fNumber > 0 ? apertureAfterStops(fNumber, 1.0 / 3.0) : 0; }
double approxFStopFromT(double tStop) { return tStop > 0 ? apertureAfterStops(tStop, -1.0 / 3.0) : 0; }

double normaliseFrameRate(double fps) {
    static const double kRates[] = {23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60,
                                    100, 119.88, 120, 240};
    for (double r : kRates) {
        if (std::fabs(fps - r) < 0.02) return r;
    }
    return fps;
}

bool frameRatesEqual(double a, double b) {
    return std::fabs(normaliseFrameRate(a) - normaliseFrameRate(b)) < 0.01;
}

bool isFlickerSafe(double shutterSeconds, int mainsHz) {
    if (shutterSeconds <= 0 || mainsHz <= 0) return true;
    const double period = 1.0 / (2.0 * mainsHz);
    const double cycles = shutterSeconds / period;
    if (cycles < 0.95) return false;  // shorter than one flicker cycle: always visible
    return std::fabs(cycles - std::round(cycles)) < 0.05;
}

double parseStop(const std::string& s) {
    double v = 0;
    return firstNumber(s, 0, v) ? v : 0;
}

double parseShutterSpeed(const std::string& s) {
    const std::string t = squash(s);
    double a = 0;
    size_t end = 0;
    if (!firstNumber(t, 0, a, &end)) return 0;
    if (end < t.size() && t[end] == '/') {
        double b = 0;
        if (firstNumber(t, end + 1, b) && b > 0) return a / b;
        return 0;
    }
    return a;  // already seconds ("0.02", "1s")
}

double parseAngle(const std::string& s) { return parseStop(s); }

double parseFrameRate(const std::string& s) {
    const std::string t = squash(s);
    // Prefer the number immediately before "fps" / "p" so "4K UHD 24fps" -> 24.
    for (const char* tag : {"fps", "p"}) {
        const size_t pos = t.find(tag);
        if (pos == std::string::npos || pos == 0) continue;
        size_t start = pos;
        while (start > 0 && (std::isdigit(static_cast<unsigned char>(t[start - 1])) || t[start - 1] == '.')) --start;
        if (start < pos) return normaliseFrameRate(std::strtod(t.c_str() + start, nullptr));
    }
    double v = 0;
    return firstNumber(t, 0, v) ? normaliseFrameRate(v) : 0;
}

int parseKelvin(const std::string& s) {
    double v = 0;
    if (!firstNumber(s, 0, v)) return 0;
    if (v < 100) v *= 1000;  // "5.6K"
    return static_cast<int>(std::lround(v));
}

double parseFocalLength(const std::string& s) {
    double v = 0;
    return firstNumber(s, 0, v) ? v : 0;
}

double parseNdStops(const std::string& s) {
    const std::string t = squash(s);
    if (t.empty() || t == "clear" || t == "none" || t == "off") return 0;
    double v = 0;
    if (!firstNumber(t, 0, v)) return 0;
    if (t.find("stop") != std::string::npos) return v;
    if (t.find("1/") != std::string::npos) {  // "ND 1/4" style transmission
        double d = 0;
        size_t slash = t.find("1/");
        if (firstNumber(t, slash + 2, d) && d > 0) return std::log2(d);
    }
    // ND density written as 0.3/0.6/0.9/1.2/... or as ND3/ND6/ND9 shorthand.
    if (v >= 3 && std::fmod(v, 3.0) == 0 && t.find('.') == std::string::npos) v /= 10.0;
    return ndDensityToStops(v);
}

int parseIso(const std::string& s) {
    double v = 0;
    return firstNumber(s, 0, v) ? static_cast<int>(std::lround(v)) : 0;
}

std::string formatAperture(double fNumber, bool tStop) {
    if (fNumber <= 0) return "--";
    char buf[32];
    const double r = std::round(fNumber * 10) / 10;
    if (std::fabs(r - std::round(r)) < 1e-6 && r >= 10) std::snprintf(buf, sizeof buf, "%s%.0f", tStop ? "T" : "f/", r);
    else std::snprintf(buf, sizeof buf, "%s%.1f", tStop ? "T" : "f/", r);
    std::string out(buf);
    // "f/2.0" reads oddly on set; cinema convention is "T2"/"f/2".
    if (out.size() > 2 && out.compare(out.size() - 2, 2, ".0") == 0) out.erase(out.size() - 2);
    return out;
}

std::string formatShutter(double seconds) {
    if (seconds <= 0) return "--";
    char buf[32];
    if (seconds >= 0.5) std::snprintf(buf, sizeof buf, "%.1fs", seconds);
    else std::snprintf(buf, sizeof buf, "1/%ld", std::lround(1.0 / seconds));
    return buf;
}

std::string formatAngle(double deg) {
    if (deg <= 0) return "--";
    char buf[32];
    const double r = std::round(deg * 10) / 10;
    if (std::fabs(r - std::round(r)) < 1e-6) std::snprintf(buf, sizeof buf, "%.0f°", r);
    else std::snprintf(buf, sizeof buf, "%.1f°", r);
    return buf;
}

std::string formatFrameRate(double fps) {
    if (fps <= 0) return "--";
    char buf[32];
    const double r = normaliseFrameRate(fps);
    if (std::fabs(r - std::round(r)) < 1e-6) std::snprintf(buf, sizeof buf, "%.0ffps", r);
    else std::snprintf(buf, sizeof buf, "%.2ffps", r);
    return buf;
}

std::string formatStops(double stops) {
    const double a = std::fabs(stops);
    const long whole = static_cast<long>(a + 1e-6);
    const double frac = a - whole;
    const char* third = "";
    long w = whole;
    if (frac > 0.83) { w += 1; }
    else if (frac > 0.5) third = "2/3";
    else if (frac > 0.17) third = "1/3";
    char buf[48];
    const char sign = stops < 0 ? '-' : '+';
    if (w == 0 && *third == '\0') return "0 stops";
    if (w == 0) std::snprintf(buf, sizeof buf, "%c%s stop", sign, third);
    else if (*third == '\0') std::snprintf(buf, sizeof buf, "%c%ld stop%s", sign, w, w == 1 ? "" : "s");
    else std::snprintf(buf, sizeof buf, "%c%ld %s stops", sign, w, third);
    return buf;
}

} // namespace cineassist::math
