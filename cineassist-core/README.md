# CineAssist Core (C++)

This is the on-set guidance engine from the CineAssist web app, rewritten as portable C++17. It can run inside camera firmware, on an accessory board attached to the camera (Raspberry Pi, Jetson, an FPGA SoC), or on a laptop connected to the camera.

The web app plans the shoot. This engine runs on set: it compares the live camera against that plan and tells the operator what to change, or changes it.

```
 Web app (pre-production)                 On set (this folder)
 ┌──────────────────────────┐  plan.json  ┌──────────────────────────────────────────┐
 │ script → scenes, shots,  │ ──────────▶ │ Session ─▶ GuidanceEngine ◀─ FrameAnalyzer│
 │ camera package, lighting │             │                 ▲               ▲        │
 └──────────────────────────┘ ◀────────── │            CameraState     live view     │
          progress.json (takes, notes)    │                 └── ICamera backend ──┘   │
                                          │  sim · Sony CrSDK · <your SDK / HAL>      │
                                          └──────────────────────────────────────────┘
```

## What it does

| Area | Behaviour |
|---|---|
| **Exposure** | Measures exposure from the image in stops relative to mid-grey, plus highlight clipping and crushed shadows. Supports Rec.709 and log footage (S-Log3-style curves). |
| **Exposure fixes** | Fixes are tried in the safest production order: ND first, then native ISO, then the iris within the planned T-stop range. The shutter is never touched. Anything the camera can't absorb becomes a lighting instruction, such as moving the key closer. |
| **Plan deviations** | Compares the live camera with the shot plan: lens, aperture, frame rate, shutter angle, ISO and white balance. Each mismatch gets a severity, a fix and its likely effect on the edit. The result also includes a 0–100 plan-match score. (The web app does this with an LLM; here it is deterministic and works offline.) |
| **Flicker** | Checks whether the shutter is safe against 50/60 Hz mains flicker when the scene has practicals, LEDs or fluorescents, and proposes a safe shutter angle. |
| **Focus** | Measures sharpness in the centre of the frame and tracks the best value seen in the current shot. A sharp drop while recording raises a focus-drift alert. |
| **Composition** | Estimates where the subject is from image detail. On singles (close-ups, mediums) it warns about a dead-centre subject or too much headroom. |
| **Colour** | Estimates the colour cast from near-neutral pixels and warns about warm/cool or green/magenta spill. |
| **Coverage and continuity** | Tracks scene coverage %, warns about the 180° line on multi-character scenes, and records takes and notes. Progress is saved to disk after every change. |
| **Modes** | **Suggest** lists all options. **Assist** gives only the single safest move. **Lock** respects locked areas (camera, lighting, framing) and works around them. |
| **Q&A** | Answers offline questions, for example "what lens is next?", "fix exposure", "coverage left" or "we lose the reverse before lunch". |

## Build

Requirements: CMake 3.16 or newer and a C++17 compiler. The core library has **no dependencies** (the JSON parser is built in, and JPEG decoding uses the bundled `third_party/stb_image.h`).

```bash
cd cineassist-core
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
cd build && ctest --output-on-failure
```

The Sony backend is switched on automatically if the Camera Remote SDK is found at `../CrSDK_v2.02.00_20260610a_Mac/extracted/SimpleCli`. To use a different location, pass `-DCINEASSIST_SONY_SDK_DIR=/path/to/SimpleCli`, or turn it off with `-DCINEASSIST_WITH_SONY=OFF`.

### macOS: clear the quarantine flag on the Sony SDK once

When downloaded, the SDK's `CrAdapter/*.dylib` plugins carry the macOS quarantine flag. That flag makes `SCRSDK::Init()` hang inside `dlopen()`, and Sony's own samples hang the same way. The engine stops waiting after 15 seconds and prints a message instead of freezing. To fix it properly, run:

```bash
xattr -dr com.apple.quarantine ../CrSDK_v2.02.00_20260610a_Mac
cmake --build build      # re-copies the cleaned libraries next to the binary
```

## Run

```bash
# Simulator: a synthetic scene that responds to iris, ISO, shutter, ND, white balance and focus
./build/cineassist-onset --backend sim --project examples/sample_project.json --mains 50

# Use a real still as the live view
./build/cineassist-onset --backend sim --image frame.jpg --project plan.json

# Sony camera: FX3/FX30/FX6/FX9/BURANO/VENICE 2/α series, over USB or Ethernet
./build/cineassist-onset --backend sony --list
./build/cineassist-onset --backend sony --project plan.json --save progress.json --mode assist

# For a monitor UI or another process: one JSON object per tick on stdout
./build/cineassist-onset --backend sony --project plan.json --json
```

For a Sony camera over USB, set the camera's USB connection mode to **PC Remote**. For network connections that need SSH, set `CINEASSIST_SONY_USER` and `CINEASSIST_SONY_PASSWORD`.

While the app is running, type these commands:

| Command | Effect |
|---|---|
| `status` | Redraw the guidance display |
| `next` / `prev` / `shot N` / `scene N` | Move through the shot list |
| `apply` / `apply N` / `apply all` | Send a proposed adjustment to the camera |
| `rec` / `stop` | Start or stop recording |
| `done [notes]` | Mark the shot complete; adds a take and updates coverage |
| `note TEXT` | Add a note to the current shot |
| `mode suggest\|assist\|lock` | Change guidance mode |
| `lock camera` / `unlock lighting` / `lock framing` | Lock or unlock an area |
| `ask QUESTION` | Ask a question |
| `snap FILE.ppm` | Save the current live-view frame to a file |
| `quit` | Exit |

## Using it from the web app (live view + camera control)

From the repo root:

```bash
npm run engine:build   # once
npm run engine         # = cineassist-onset --backend auto --http 8765
```

Then open **On-Set → Live Camera** in the web app. The page finds the engine on `http://127.0.0.1:8765` and switches from the browser webcam to the engine:

* **Live view** comes from the camera as an MJPEG stream, so the browser asks for no camera permission.
* **Guidance** is drawn over the picture. The Camera Engine panel lists the proposed fixes, each with an **Apply to camera** button, plus **Apply all**, **Auto-apply safest fix**, and the Suggest / Assist / Lock modes.
* **The settings dropdowns, the record button and Complete Shot** control the actual camera. The plan for the open project is sent to the engine automatically, so the guidance compares against your shot list.
* `--backend auto` uses a Sony camera if one is connected, otherwise the simulator, and switches as soon as you plug a camera in.

The bridge only listens on `127.0.0.1`. It accepts control requests only from pages served from this machine, and only when they carry a JSON content type, so other websites open in your browser can't change camera settings. HTTP endpoints are documented in [apps/http_bridge.h](apps/http_bridge.h). To use a different engine address, set `VITE_CAMERA_ENGINE_URL`.

## Wireless (Wi-Fi / LAN) cameras

The Sony backend connects over Wi-Fi or Ethernet as well as USB.

**On the camera** (α7 IV menu names; other bodies are similar):
1. **Network → Transfer/Remote → PC Remote Function → PC Remote: On**, and set **PC Remote Cnct Method** to Wi-Fi Access Point. With that setting, the camera joins your router; Wi-Fi Direct makes the camera host its own network instead.
2. **Network → Wi-Fi → Access Point Set.** to join the same network as the computer. The camera's IP address is shown under Wi-Fi settings.
3. If **Access Authentication** is on (**Network → Network Option → Access Authen. Settings**), note the user, password and fingerprint shown in **Access Authen. Info**.

**On the computer:**
* **Web app:** open Live Camera → Camera Engine → **Connect camera**. Leave the IP empty to auto-discover, or enter the camera's IP and model. Enter the Access Authentication user and password if the camera asks for them, then click **Connect**.
* **CLI:** `cineassist-onset --backend sony --camera-ip 192.168.1.50 --camera-model ILCE-7M4 --camera-user USER --camera-password PASS`. The credentials can also come from the `CINEASSIST_SONY_USER` / `_PASSWORD` / `_FINGERPRINT` environment variables.
* **macOS:** allow **Local Network** access for your terminal when prompted (System Settings → Privacy & Security → Local Network). Without it, discovery and connections to the camera's IP fail silently.

The camera's SSH host key is pinned on first successful connect (trust on first use). Compare the fingerprint the panel shows with the one on the camera screen. If a later connection presents a different key, it is refused. An address that doesn't answer fails within about 4 s, and a short Wi-Fi drop is handled by the SDK's auto-reconnect without leaving the camera.

## Getting the plan from the web app

Any of these JSON shapes is accepted:

* `GET /api/onset/:projectId` → `{ scenes, cameraSettings }`
* A full Analysis document
* `{ "project": {...}, "analysis": {...} }`. See [examples/sample_project.json](examples/sample_project.json).

`--save progress.json` writes the same shape back with takes, statuses and notes, so the web app can re-import it. On restart, the session resumes from that file.

## Integrating into firmware or another camera SDK

You don't need to write a new backend to add a camera. Firmware or any vendor SDK can drive the engine through the **C ABI** in [include/cineassist/cineassist_c.h](include/cineassist/cineassist_c.h): it uses plain C types and lets no exceptions escape. The host does five things:

1. Fill in a `ca_camera_state` from its own settings (HAL, EDSDK, Blackmagic REST, RED RCP2, and so on).
2. Push a frame with `ca_engine_push_frame`. Passing only the Y plane (`CA_PIXEL_GRAY8`) is the cheapest option.
3. Call `ca_engine_evaluate`.
4. Draw the `ca_guidance` items on the monitor overlay.
5. Optionally carry out the `ca_adjustment` items.

[examples/firmware_integration.c](examples/firmware_integration.c) is a complete example in pure C. The shared library `libcineassist` exports only this API.

### Adding a C++ backend

To add a full C++ backend, implement `cineassist::ICamera` (see [include/cineassist/camera.h](include/cineassist/camera.h)) and register it in [backends/builtin_backends.cpp](backends/builtin_backends.cpp). Use [backends/sony/sony_camera.cpp](backends/sony/sony_camera.cpp) as the reference: it covers property decoding, snapping to the nearest value the body accepts, live view, and recording.

## Embedded notes

* Frame analysis works on a downsampled grid at most 320 px wide using integer maths. After the first frame it allocates no memory per frame.
* The core (`cineassist_core`) uses only the standard library. It has no OS calls apart from file I/O for the plan and progress files, which the C ABI also lets you load from memory.
* Progress files are written atomically (to a temp file, then renamed), so a power cut can't leave a half-written file.

## Layout

```
include/cineassist/   public headers (C++ API + C ABI)
src/                  engine: math, JSON, plan I/O, analyser, guidance, session, C ABI
backends/sim/         simulated camera (always built)
backends/sony/        Sony Camera Remote SDK backend
apps/                 cineassist-onset CLI + HTTP bridge for the web app
tests/                unit + closed-loop tests (ctest)
examples/             sample plan, pure-C firmware example
third_party/          stb_image(.h/_write.h) (public domain), cpp-httplib (MIT)
```
