/*
 * Firmware integration example — pure C, using only cineassist_c.h.
 *
 * Shows the shape of a camera-firmware (or accessory SoC) integration: the
 * firmware owns the sensor pipeline and settings, pushes them into the engine,
 * and draws the returned guidance on its monitor overlay. Here the "sensor" is a
 * synthetic luma plane and the "overlay" is stdout.
 */
#include "cineassist/cineassist_c.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define W 320
#define H 180

/* Stand-in for the firmware's Y plane: an overexposed frame with a hot window. */
static void fake_sensor_luma(unsigned char* y, int brightness) {
    for (int r = 0; r < H; ++r) {
        for (int c = 0; c < W; ++c) {
            int v = brightness + ((r / 6 + c / 6) % 2 ? 25 : -25);
            if (c < W / 4 && r < H / 2) v = 255;  /* clipped window */
            y[r * W + c] = (unsigned char)(v < 0 ? 0 : v > 255 ? 255 : v);
        }
    }
}

int main(int argc, char** argv) {
    const char* plan = argc > 1 ? argv[1] : "sample_project.json";
    char err[256] = {0};

    ca_config cfg;
    memset(&cfg, 0, sizeof cfg);
    cfg.mains_hz = 50;   /* PAL region */
    cfg.nd_step = 1.0 / 3.0;   /* variable ND body */

    ca_engine* e = ca_engine_create(&cfg);
    if (!e) return 1;
    if (ca_engine_load_project_file(e, plan, err, sizeof err) != 0) {
        fprintf(stderr, "load failed: %s\n", err);
        ca_engine_destroy(e);
        return 1;
    }
    ca_engine_select(e, 0, 1);   /* scene 1, shot 2: the 85mm close-up */
    ca_engine_set_mode(e, CA_MODE_ASSIST);

    /* Settings as the firmware's HAL would report them. */
    ca_camera_state st;
    memset(&st, 0, sizeof st);
    st.connected = 1;
    st.f_number = 2.8;
    st.iso = 800;
    st.shutter_seconds = 1.0 / 48.0;
    st.frame_rate = 23.976;
    st.white_balance_k = 5600;
    st.focal_length_mm = 50;   /* plan says 85mm */
    st.battery_percent = 64;
    st.nd_stops = 0;
    strncpy(st.model, "FIRMWARE-HAL", sizeof st.model - 1);

    unsigned char* luma = (unsigned char*)malloc(W * H);
    if (!luma) return 1;
    for (int tick = 0; tick < 3; ++tick) {
        fake_sensor_luma(luma, 200);
        ca_engine_set_camera_state(e, &st);
        ca_engine_push_frame(e, luma, W, H, W, CA_PIXEL_GRAY8, 0);
        ca_engine_evaluate(e);
    }

    char label[128];
    ca_engine_current_shot_label(e, label, sizeof label);
    printf("%s | ready %d%% | plan match %d%%\n", label, ca_engine_readiness(e), ca_engine_plan_match(e));
    for (int i = 0; i < ca_engine_guidance_count(e); ++i) {
        ca_guidance g;
        ca_engine_get_guidance(e, i, &g);
        printf("  [%d] %-12s %s -> %s\n", g.severity, g.category, g.title, g.fix);
    }
    for (int i = 0; i < ca_engine_adjustment_count(e); ++i) {
        ca_adjustment a;
        ca_engine_get_adjustment(e, i, &a);
        printf("  apply: %s (prop %d = %.3f)\n", a.label, (int)a.property, a.value);
    }
    free(luma);

    /* Exit non-zero if the engine missed the obvious problems, so this doubles as a test. */
    int sawLens = 0, sawClip = 0;
    for (int i = 0; i < ca_engine_guidance_count(e); ++i) {
        ca_guidance g;
        ca_engine_get_guidance(e, i, &g);
        if (strcmp(g.category, "lens") == 0) sawLens = 1;
        if (strstr(g.id, "exposure.") == g.id) sawClip = 1;
    }
    ca_engine_destroy(e);
    return (sawLens && sawClip) ? 0 : 3;
}
