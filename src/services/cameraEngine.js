// Client for the local CineAssist C++ camera engine (cineassist-onset --http 8765).
// The engine owns the physical camera: it streams live view as MJPEG and applies
// settings to the body, so the browser needs no camera permission.
export const ENGINE_URL = import.meta.env.VITE_CAMERA_ENGINE_URL || 'http://127.0.0.1:8765'

export const liveStreamUrl = () => `${ENGINE_URL}/live.mjpg`

async function call(path, body, timeoutMs = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, body === undefined
      ? { signal: controller.signal }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.result || `Camera engine error ${res.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

export const cameraEngine = {
  status: () => call('/api/status', undefined, 1500),
  // USB / Wi-Fi discovery, or a direct network connection when `address` is set.
  // Network connects can take up to a minute (discovery, SSH handshake, and time to
  // accept a pairing prompt on the camera).
  connect: ({ address = '', model = '', user = '', password = '', fingerprint } = {}) =>
    call('/api/connect', { backend: 'sony', address, model, user, password, ...(fingerprint !== undefined ? { fingerprint } : {}) }, 150000),
  useSimulator: () => call('/api/connect', { backend: 'sim' }),
  loadProject: (scenes, cameraSettings) => call('/api/project', { scenes, cameraSettings: cameraSettings || {} }),
  select: (scene, shot) => call('/api/select', { scene, shot }),
  apply: (index) => call('/api/apply', { index }),
  applyAll: () => call('/api/apply', { all: true }),
  set: (property, value) => call('/api/settings', { property, value }),
  record: (on) => call('/api/record', { on }),
  mode: (mode) => call('/api/mode', { mode }),
  locks: (locks) => call('/api/locks', locks),
  autoApply: (on) => call('/api/autoapply', { on }),
  complete: (notes) => call('/api/complete', { notes }),
  ask: (question) => call('/api/ask', { question }, 8000),
}

// ─── Converters from the web app's display strings to engine units ──────────
const firstNumber = (value) => {
  const match = String(value ?? '').match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : NaN
}

export const toEngineSetting = {
  iso: (v) => ['iso', Number(v)],
  whiteBalance: (v) => ['whiteBalanceK', firstNumber(v) < 100 ? firstNumber(v) * 1000 : firstNumber(v)],
  // "ND 0.6" (optical density) -> 2 stops; "Clear" -> 0
  nd: (v) => ['ndStops', /clear/i.test(v) ? 0 : Math.round((firstNumber(v) / 0.3) * 100) / 100],
  frameRate: (v) => ['frameRate', firstNumber(v) === 23.98 ? 23.976 : firstNumber(v) === 29.97 ? 29.97 : firstNumber(v)],
  shutterAngle: (v) => ['shutterAngle', firstNumber(v)],
  shutterSpeed: (v) => {
    const [num, den] = String(v).split('/').map(Number)
    return ['shutterSeconds', den ? num / den : num]
  },
  aperture: (v) => ['fNumber', firstNumber(v)],
}

// ─── Formatting engine camera state for the HUD ─────────────────────────────
export function formatEngineCamera(cam) {
  if (!cam) return null
  const stop = cam.tStop > 0 ? cam.tStop : cam.fNumber
  const round1 = (n) => Math.round(n * 10) / 10
  return {
    model: cam.model || 'Camera',
    lens: cam.lensModel || '',
    aperture: stop > 0 ? `${cam.tStop > 0 ? 'T' : 'f/'}${round1(stop)}` : '--',
    iso: cam.isoAuto ? 'AUTO' : cam.iso || '--',
    shutter: cam.shutter || '--',
    // Bodies in speed mode report no angle; derive it so the operator always sees both.
    angle: cam.shutterAngle > 0
      ? `${round1(cam.shutterAngle)}°`
      : cam.shutterSeconds > 0 && cam.frameRate > 0 ? `${round1(cam.shutterSeconds * 360 * cam.frameRate)}°` : '--',
    frameRate: cam.frameRate > 0 ? `${cam.frameRate === 23.976 ? '23.98' : round1(cam.frameRate)}fps` : '--',
    whiteBalance: cam.whiteBalanceAuto ? 'AWB' : cam.whiteBalanceK > 0 ? `${cam.whiteBalanceK}K` : '--',
    nd: cam.ndStops > 0 ? `${round1(cam.ndStops)} stops` : 'Clear',
    focal: cam.focalLengthMm > 0 ? `${Math.round(cam.focalLengthMm)}mm` : '--',
    battery: cam.batteryPercent >= 0 ? `${cam.batteryPercent}%` : '--',
    recording: !!cam.recording,
  }
}
