// AI Visual Check: grabs the live frame, sends it to Claude with the Generated Outputs
// plan (shot list, storyboard panel, lighting plan, camera package) and shows where the
// set matches the plan and what to fix.
import { useCallback, useRef, useState } from 'react'
import {
  ScanEye, Loader2, ListChecks, Image as ImageIcon, Lightbulb, Aperture, Frame, Move,
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowRightLeft, Zap,
} from 'lucide-react'
import { onset as onsetApi } from '../../services/api'
import { ENGINE_URL, cameraEngine } from '../../services/cameraEngine'

const ENABLED_KEY = 'cineassist_visual_check'

function loadEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'off' } catch { return true }
}
const MAX_FRAME_WIDTH = 1280

const CATEGORY = {
  shotList: { label: 'Shot List', icon: ListChecks },
  storyboard: { label: 'Storyboard', icon: ImageIcon },
  lighting: { label: 'Lighting Plan', icon: Lightbulb },
  cameraLens: { label: 'Camera & Lens', icon: Aperture },
  composition: { label: 'Composition', icon: Frame },
  movement: { label: 'Movement', icon: Move },
}

const STATUS = {
  match: { label: 'Matches plan', icon: CheckCircle2, cls: 'text-onset-400 bg-onset-500/10 border-onset-500/25' },
  minor: { label: 'Minor fix', icon: AlertTriangle, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  major: { label: 'Off plan', icon: XCircle, cls: 'text-red-400 bg-red-500/10 border-red-500/25' },
  unknown: { label: 'Can’t tell', icon: HelpCircle, cls: 'text-slate-400 bg-slate-800 border-slate-700' },
}

const READINESS = {
  ready: 'bg-onset-500/15 text-onset-400',
  adjust: 'bg-amber-500/15 text-amber-400',
  not_ready: 'bg-red-500/15 text-red-400',
}

const ADJUST_LABEL = {
  fNumber: (v) => `Aperture f/${v}`,
  iso: (v) => `ISO ${v}`,
  shutterAngle: (v) => `Shutter ${v}°`,
  whiteBalanceK: (v) => `WB ${v}K`,
  ndStops: (v) => (v > 0 ? `ND ${v} stops` : 'ND clear'),
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Could not read the frame'))
  reader.readAsDataURL(blob)
})

function drawToJpeg(source, width, height) {
  const scale = Math.min(1, MAX_FRAME_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Rough light-balance numbers from the frame so the lighting comparison isn't only by eye:
// left/right and top/bottom brightness (camera POV), clipping, crushed blacks, colour cast.
function measureLight(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = 160
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const zone = { left: [0, 0], right: [0, 0], top: [0, 0], bottom: [0, 0] }
        let sum = 0; let clipped = 0; let crushed = 0; let r = 0; let b = 0
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
            sum += luma; r += data[i]; b += data[i + 2]
            if (luma > 250) clipped++
            if (luma < 8) crushed++
            const add = (k) => { zone[k][0] += luma; zone[k][1]++ }
            add(x < w / 2 ? 'left' : 'right')
            add(y < h / 2 ? 'top' : 'bottom')
          }
        }
        const n = w * h
        const avg = (k) => zone[k][0] / Math.max(1, zone[k][1])
        const stops = (a, c) => Math.log2(Math.max(1, a) / Math.max(1, c)).toFixed(1)
        const pct = (v) => `${((v / n) * 100).toFixed(1)}%`
        resolve(`mean luma ${Math.round(sum / n)}/255; camera-left half ${Math.round(avg('left'))} vs camera-right half ` +
          `${Math.round(avg('right'))} (${stops(avg('left'), avg('right'))} stops left-over-right); top ${Math.round(avg('top'))} vs bottom ` +
          `${Math.round(avg('bottom'))}; clipped ${pct(clipped)}; crushed ${pct(crushed)}; red/blue balance ${(r / Math.max(1, b)).toFixed(2)} (>1 warm, <1 cool)`)
      } catch { resolve('') }
    }
    img.onerror = () => resolve('')
    img.src = dataUrl
  })
}

async function grabFrame({ engineOnline, videoRef }) {
  if (engineOnline) {
    const res = await fetch(`${ENGINE_URL}/live.jpg?t=${Date.now()}`)
    if (!res.ok) throw new Error('Camera engine has no live frame yet')
    return blobToDataUrl(await res.blob())
  }
  const video = videoRef?.current
  if (video?.videoWidth) return drawToJpeg(video, video.videoWidth, video.videoHeight)
  throw new Error('No live feed — connect the camera engine or start the webcam feed')
}

// The storyboard panel is SVG; Claude takes raster images, so draw it to a JPEG.
function rasterizeSketch(svg) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try { resolve(drawToJpeg(img, img.naturalWidth || 1280, img.naturalHeight || 720)) } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

export default function VisualCheckPanel({ projectId, scenes, selectedScene, selectedShot, engineOnline, engineCamera, videoRef, liveAvailable, onSelectShot }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(loadEnabled)
  const [applied, setApplied] = useState({})
  const [lastFrame, setLastFrame] = useState('')
  const busyRef = useRef(false)

  const scene = scenes[selectedScene]
  const panel = scene?.storyboard?.find((f) => (f.shotIndex ?? -1) === selectedShot && f.sketchSvg)

  const runCheck = useCallback(async () => {
    if (busyRef.current || !projectId) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const image = await grabFrame({ engineOnline, videoRef })
      const reference = panel?.sketchSvg ? await rasterizeSketch(panel.sketchSvg) : null
      const frameStats = await measureLight(image)
      setLastFrame(image)
      const next = await onsetApi.visualCheck(projectId, {
        image,
        reference,
        sceneIndex: scene ? selectedScene : undefined,
        shotIndex: scene ? selectedShot : undefined,
        camera: engineCamera || undefined,
        frameStats: frameStats || undefined,
      })
      setResult(next)
      setApplied({})
    } catch (err) {
      setError(err.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [projectId, engineOnline, videoRef, panel?.sketchSvg, scene, selectedScene, selectedShot, engineCamera])

  // Off means no frames are sent to Claude at all.
  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    try { localStorage.setItem(ENABLED_KEY, next ? 'on' : 'off') } catch { /* private mode */ }
  }

  const applyAdjustment = async (adj, i) => {
    try {
      await cameraEngine.set(adj.property, adj.value)
      setApplied((prev) => ({ ...prev, [i]: 'done' }))
    } catch (err) {
      setApplied((prev) => ({ ...prev, [i]: err.message }))
    }
  }

  const detected = result?.detected
  const detectedScene = detected?.sceneIndex >= 0 ? scenes[detected.sceneIndex] : null
  const differs = detectedScene && (detected.sceneIndex !== selectedScene || (detected.shotIndex >= 0 && detected.shotIndex !== selectedShot))

  return (
    <div className="p-3 border-b border-slate-800 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <ScanEye className="w-4 h-4 text-cinema-400" /> AI Visual Check
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="AI Visual Check on/off"
          onClick={toggleEnabled}
          className={`relative w-9 h-5 rounded-full transition ${enabled ? 'bg-cinema-500' : 'bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </button>
      </div>

      {!enabled ? (
        <p className="text-[11px] text-slate-500">Off — no frames are sent for analysis. Turn on to compare the live view with the plan.</p>
      ) : (<>

      <p className="text-[11px] text-slate-500 leading-snug">
        Compares the live frame with the Generated Outputs plan for SC {scene?.number || selectedScene + 1} / shot {selectedShot + 1}
        {panel ? ' and its storyboard panel' : ''}, and detects the scene if the crew is on a different setup.
      </p>

      <button
        onClick={runCheck}
        disabled={busy || !liveAvailable}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cinema-500 hover:bg-cinema-600 disabled:opacity-50 text-white text-sm transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanEye className="w-4 h-4" />}
        {busy ? 'Analysing frame…' : 'Check frame against plan'}
      </button>
      {!liveAvailable && <div className="text-[11px] text-slate-500">Start the camera engine or webcam feed first.</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}

      {result && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <figure>
              {lastFrame && <img src={lastFrame} alt="Checked frame" className="w-full aspect-video object-cover rounded border border-slate-700" />}
              <figcaption className="text-[10px] text-slate-500 mt-0.5">On set</figcaption>
            </figure>
            <figure>
              {panel?.sketchSvg
                ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(panel.sketchSvg)}`} alt="Planned storyboard panel" className="w-full aspect-video object-cover rounded border border-slate-700 bg-white" />
                : <div className="w-full aspect-video rounded border border-dashed border-slate-700 grid place-items-center text-[10px] text-slate-600">No sketch</div>}
              <figcaption className="text-[10px] text-slate-500 mt-0.5">Planned</figcaption>
            </figure>
          </div>

          <div className="rounded-lg bg-slate-800/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300">
                {detectedScene
                  ? <>Detected <b className="text-white">SC {detectedScene.number || detected.sceneIndex + 1}{detected.shotIndex >= 0 ? ` / shot ${detected.shotIndex + 1}` : ''}</b></>
                  : 'Scene not recognised'}
                <span className="text-slate-500"> · {detected.confidence} confidence</span>
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${READINESS[result.overall.readiness] || READINESS.adjust}`}>
                {result.overall.readiness.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">{result.overall.summary}</p>
            {differs && (
              <button
                onClick={() => onSelectShot(detected.sceneIndex, Math.max(0, detected.shotIndex))}
                className="flex items-center gap-1.5 text-[11px] text-cinema-300 hover:text-white"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Switch plan to the detected setup
              </button>
            )}
          </div>

          {result.topActions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Do now</div>
              <ol className="space-y-1 list-decimal list-inside">
                {result.topActions.map((action, i) => <li key={i} className="text-xs text-slate-200 leading-snug">{action}</li>)}
              </ol>
            </div>
          )}

          {(result.lightingCheck?.applicable || result.lightingCheck?.lights?.length > 0) && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-300">
                <Lightbulb className="w-3.5 h-3.5" /> Lighting plan check
              </div>
              {!result.lightingCheck.applicable && (
                <div className="text-[11px] text-slate-400">No lit set visible in this frame — showing the plan to check against once the subject is framed.</div>
              )}
              <div className="space-y-0.5 text-[11px] leading-snug">
                {result.lightingCheck.keySideObserved && <div><span className="text-slate-500">Key side: </span><span className="text-slate-300">{result.lightingCheck.keySideObserved}</span></div>}
                {result.lightingCheck.ratioObserved && <div><span className="text-slate-500">Ratio: </span><span className="text-slate-300">{result.lightingCheck.ratioObserved}</span></div>}
                {result.lightingCheck.colourObserved && <div><span className="text-slate-500">Colour: </span><span className="text-slate-300">{result.lightingCheck.colourObserved}</span></div>}
              </div>
              <div className="space-y-1">
                {result.lightingCheck.lights.map((light, i) => {
                  const st = STATUS[light.status] || STATUS.unknown
                  const StatusIcon = st.icon
                  return (
                    <div key={i} className={`rounded border px-2 py-1.5 text-[11px] leading-snug ${st.cls}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="flex-1 font-medium text-slate-200">{light.role}</span>
                        <StatusIcon className="w-3 h-3" /><span className="text-[10px]">{st.label}</span>
                      </div>
                      {light.planned && <div><span className="text-slate-500">Plan: </span><span className="text-slate-300">{light.planned}</span></div>}
                      {light.observed && <div><span className="text-slate-500">Seen: </span><span className="text-slate-300">{light.observed}</span></div>}
                      {light.fix && light.status !== 'match' && <div><span className="text-slate-500">Fix: </span><span className="text-white">{light.fix}</span></div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {result.cameraAdjustments.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Camera adjustments</div>
              {result.cameraAdjustments.map((adj, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className="flex-1">
                    <span className="text-white">{(ADJUST_LABEL[adj.property] || ((v) => `${adj.property} ${v}`))(adj.value)}</span>
                    <span className="text-slate-500"> — {adj.reason}</span>
                  </div>
                  {engineOnline && (
                    <button
                      onClick={() => applyAdjustment(adj, i)}
                      disabled={applied[i] === 'done'}
                      title={applied[i] && applied[i] !== 'done' ? applied[i] : 'Send to camera'}
                      className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${applied[i] === 'done' ? 'bg-onset-500/15 text-onset-400' : applied[i] ? 'bg-red-500/15 text-red-400' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
                    >
                      <Zap className="w-3 h-3" /> {applied[i] === 'done' ? 'Applied' : applied[i] ? 'Failed' : 'Apply'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {result.categories.map((cat) => {
              const meta = CATEGORY[cat.key] || { label: cat.key, icon: HelpCircle }
              const st = STATUS[cat.status] || STATUS.unknown
              const Icon = meta.icon
              const StatusIcon = st.icon
              return (
                <details key={cat.key} open={cat.status === 'major' || cat.status === 'minor'} className={`rounded-lg border ${st.cls}`}>
                  <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-slate-200 font-medium">{meta.label}</span>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{st.label}</span>
                  </summary>
                  <div className="px-2.5 pb-2 space-y-1 text-[11px] leading-snug">
                    {cat.observed && <div><span className="text-slate-500">Seen: </span><span className="text-slate-300">{cat.observed}</span></div>}
                    {cat.planned && <div><span className="text-slate-500">Plan: </span><span className="text-slate-300">{cat.planned}</span></div>}
                    {cat.suggestion && <div><span className="text-slate-500">Fix: </span><span className="text-white">{cat.suggestion}</span></div>}
                  </div>
                </details>
              )
            })}
          </div>
          <div className="text-[10px] text-slate-600">Checked {new Date(result.checkedAt).toLocaleTimeString()} · {result.model}</div>
        </div>
      )}
      </>)}
    </div>
  )
}
