/*
 * CineAssist Core — C ABI for firmware and third-party SDK integration.
 *
 * This is the integration surface for camera firmware, an accessory SoC, or any
 * vendor SDK (Sony CrSDK, Canon EDSDK, Blackmagic, RED, ARRI, Z CAM, a UVC
 * capture pipeline...). The host owns the camera; it pushes the current settings
 * and live-view frames in, and reads guidance out. No C++ types cross this
 * boundary, no exceptions escape, and the engine never calls back into the host.
 *
 * Thread-safety: a ca_engine is not thread-safe; call it from one thread (e.g. the
 * firmware's UI/monitoring task). Separate engines are independent.
 *
 * Typical loop (5–10 Hz is plenty):
 *     ca_engine* e = ca_engine_create(NULL);
 *     ca_engine_load_project_file(e, "/media/plan.json", NULL, 0);
 *     for (;;) {
 *         ca_engine_set_camera_state(e, &state);           // from your SDK / HAL
 *         ca_engine_push_frame(e, y_plane, w, h, stride, CA_PIXEL_GRAY8, is_log);
 *         ca_engine_evaluate(e);
 *         for (int i = 0; i < ca_engine_guidance_count(e); ++i) {
 *             ca_guidance g; ca_engine_get_guidance(e, i, &g);
 *             draw_on_monitor(g.title, g.fix, g.severity);
 *         }
 *     }
 *     ca_engine_destroy(e);
 */
#ifndef CINEASSIST_C_H
#define CINEASSIST_C_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32) && defined(CINEASSIST_SHARED)
#  ifdef CINEASSIST_BUILDING
#    define CA_API __declspec(dllexport)
#  else
#    define CA_API __declspec(dllimport)
#  endif
#elif defined(__GNUC__)
#  define CA_API __attribute__((visibility("default")))
#else
#  define CA_API
#endif

#define CA_ABI_VERSION 1

typedef struct ca_engine ca_engine;

typedef enum {
    CA_PIXEL_GRAY8 = 0,   /* luma only — cheapest; pass the Y plane of any YUV format */
    CA_PIXEL_RGB8 = 1,
    CA_PIXEL_RGBA8 = 2,
    CA_PIXEL_BGRA8 = 3,
    CA_PIXEL_YUV420P = 4  /* I420; only the luma plane is read */
} ca_pixel_format;

typedef enum { CA_MODE_SUGGEST = 0, CA_MODE_ASSIST = 1, CA_MODE_LOCK = 2 } ca_mode;

typedef enum { CA_SEV_INFO = 0, CA_SEV_LOW = 1, CA_SEV_MEDIUM = 2, CA_SEV_HIGH = 3, CA_SEV_CRITICAL = 4 } ca_severity;

typedef enum {
    CA_ADJ_FNUMBER = 0, CA_ADJ_ISO = 1, CA_ADJ_SHUTTER_SECONDS = 2, CA_ADJ_SHUTTER_ANGLE = 3,
    CA_ADJ_WHITE_BALANCE_K = 4, CA_ADJ_ND_STOPS = 5, CA_ADJ_FRAME_RATE = 6
} ca_adjustment_property;

/* Live camera settings. Use 0 (or -1 for battery) for anything the body doesn't report. */
typedef struct {
    int connected;
    int recording;
    double f_number;
    double t_stop;
    int iso;
    int iso_auto;
    double shutter_seconds;
    double shutter_angle;
    double frame_rate;
    int white_balance_k;
    int white_balance_auto;
    double nd_stops;
    double focal_length_mm;
    int battery_percent;
    char model[64];
    char lens_model[64];
} ca_camera_state;

typedef struct {
    char id[48];
    char category[24];
    ca_severity severity;
    char title[128];
    char detail[256];
    char fix[192];
    int confidence;
    int blocked_by_lock;
} ca_guidance;

typedef struct {
    ca_adjustment_property property;
    double value;
    char label[128];
} ca_adjustment;

typedef struct {
    int valid;
    double mean_luma, median_luma;
    double clipped_fraction, crushed_fraction;
    double ev_offset;
    double sharpness, center_sharpness;
    double subject_x, subject_y;
} ca_frame_stats;

typedef struct {
    int mains_hz;              /* 50 or 60; 0 = default (60) */
    double max_nd_stops;       /* 0 = default (7) */
    double nd_step;            /* 1 for fixed ND, 0.333 for variable; 0 = default (1) */
    int max_analysis_width;    /* 0 = default (320) */
} ca_config;

CA_API int ca_abi_version(void);
CA_API const char* ca_version_string(void);

CA_API ca_engine* ca_engine_create(const ca_config* config /* nullable */);
CA_API void ca_engine_destroy(ca_engine* e);

/* Load the pre-production plan exported by the CineAssist web app.
 * `save_path` (nullable) is where on-set progress (takes, statuses) is persisted.
 * Returns 0 on success; on failure writes a message to err (if non-null). */
CA_API int ca_engine_load_project_file(ca_engine* e, const char* path, char* err, size_t err_cap);
CA_API int ca_engine_load_project_json(ca_engine* e, const char* json, char* err, size_t err_cap);
CA_API void ca_engine_set_save_path(ca_engine* e, const char* save_path);

CA_API int ca_engine_scene_count(const ca_engine* e);
CA_API int ca_engine_shot_count(const ca_engine* e, int scene);
CA_API int ca_engine_select(ca_engine* e, int scene, int shot);
CA_API int ca_engine_next_shot(ca_engine* e);
CA_API int ca_engine_current_scene(const ca_engine* e);
CA_API int ca_engine_current_shot(const ca_engine* e);
/* Writes "SC 1 / Shot 2 — Close-Up (85mm)" style label. Returns length. */
CA_API size_t ca_engine_current_shot_label(const ca_engine* e, char* buf, size_t cap);

CA_API void ca_engine_set_mode(ca_engine* e, ca_mode mode);
CA_API void ca_engine_set_locks(ca_engine* e, int lighting, int camera, int framing);

CA_API void ca_engine_set_camera_state(ca_engine* e, const ca_camera_state* state);
/* Frame data is analysed immediately and not retained. Returns 0 if analysed. */
CA_API int ca_engine_push_frame(ca_engine* e, const uint8_t* data, int width, int height, int stride_bytes,
                                ca_pixel_format format, int log_encoded);

/* Run the engine on the latest state/frame. Returns the number of guidance items. */
CA_API int ca_engine_evaluate(ca_engine* e);
CA_API int ca_engine_guidance_count(const ca_engine* e);
CA_API int ca_engine_get_guidance(const ca_engine* e, int index, ca_guidance* out);
CA_API int ca_engine_adjustment_count(const ca_engine* e);
CA_API int ca_engine_get_adjustment(const ca_engine* e, int index, ca_adjustment* out);
CA_API int ca_engine_readiness(const ca_engine* e);    /* 0..100 */
CA_API int ca_engine_plan_match(const ca_engine* e);   /* 0..100 overall plan match */
CA_API int ca_engine_get_frame_stats(const ca_engine* e, ca_frame_stats* out);

/* Full last result as JSON (guidance, adjustments, deviations, frame stats).
 * Returns the full length; output is truncated (but NUL-terminated) if cap is short. */
CA_API size_t ca_engine_result_json(const ca_engine* e, char* buf, size_t cap);

/* On-set bookkeeping. Returns new scene coverage %, or -1 if no shot is selected. */
CA_API int ca_engine_complete_shot(ca_engine* e, const char* notes /* nullable */);
CA_API int ca_engine_add_note(ca_engine* e, const char* text);

/* Offline operator Q&A. Returns the full answer length. */
CA_API size_t ca_engine_ask(ca_engine* e, const char* question, char* buf, size_t cap);

#ifdef __cplusplus
}
#endif

#endif /* CINEASSIST_C_H */
