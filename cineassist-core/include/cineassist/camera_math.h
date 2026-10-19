// CineAssist Core — exposure and camera math.
//
// Pure functions, no allocation. Ported from the conversions in
// src/pages/onset/LiveCamera.jsx (shutter angle <-> speed, T <-> f) and extended
// with the stop arithmetic the guidance engine needs.
#pragma once

#include <string>

namespace cineassist::math {

// Shutter angle (deg) and frame rate -> exposure time in seconds.
double shutterSecondsFromAngle(double angleDeg, double fps);
// Exposure time and frame rate -> shutter angle (deg).
double shutterAngleFromSeconds(double seconds, double fps);

// Stops between two apertures: positive = `to` lets in less light than `from`.
double apertureStops(double fromFNumber, double toFNumber);
// Aperture `stops` stops smaller (positive) or larger (negative) than `fNumber`.
double apertureAfterStops(double fNumber, double stops);
// Snap to the nearest third-stop aperture on the standard scale.
double nearestThirdStopAperture(double fNumber);

double isoStops(int fromIso, int toIso);       // positive = brighter
double shutterStops(double fromSec, double toSec);  // positive = brighter

// ND optical density (0.3, 0.6, ...) <-> stops (1, 2, ...).
double ndDensityToStops(double density);
double ndStopsToDensity(double stops);

// Typical cinema lens light loss: T ≈ f + ~1/3 stop. Used only when one is missing.
double approxTStopFromF(double fNumber);
double approxFStopFromT(double tStop);

// Common frame-rate snapping (23.976 vs 23.98 vs 24000/1001).
double normaliseFrameRate(double fps);
bool frameRatesEqual(double a, double b);

// Mains-flicker safe? Returns true if the shutter period is an integer multiple
// of the light's flicker period (1/(2*mainsHz)).
bool isFlickerSafe(double shutterSeconds, int mainsHz);

// ─── Parsing of the human-readable strings the web app stores ─────────────────
// All return 0 on failure.
double parseStop(const std::string& s);           // "T2.8", "f/4", "2.8"
double parseShutterSpeed(const std::string& s);   // "1/48", "1/50s", "0.02"
double parseAngle(const std::string& s);          // "180°", "172.8", "180 deg"
double parseFrameRate(const std::string& s);      // "23.98fps", "24", "4K UHD 24fps"
int parseKelvin(const std::string& s);            // "5600K", "4300 k"
double parseFocalLength(const std::string& s);    // "35mm", "24-70mm" (returns first)
double parseNdStops(const std::string& s);        // "ND 0.6" -> 2, "Clear" -> 0, "3 stops"
int parseIso(const std::string& s);               // "ISO 800", "800"

// ─── Formatting ────────────────────────────────────────────────────────────────
std::string formatAperture(double fNumber, bool tStop = false); // "f/2.8" / "T2.8"
std::string formatShutter(double seconds);                      // "1/48"
std::string formatAngle(double deg);                            // "180°"
std::string formatFrameRate(double fps);                        // "23.98fps"
std::string formatStops(double stops);                          // "+1 1/3 stops"

} // namespace cineassist::math
