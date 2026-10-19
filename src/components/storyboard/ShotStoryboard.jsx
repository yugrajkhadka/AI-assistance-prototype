// Shot-by-shot storyboard for one scene. Each panel is a pencil-style drawing
// made by Claude from the shot's type, lens, angle, movement, and the scene's
// location, props and key-light side. The server draws every panel in the
// background after analysis (three at a time) and stores them with the analysis.
// While a panel is being drawn — or if Claude isn't configured — the procedural
// StoryboardSketch stands in so the board is never empty.
import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, AlertTriangle, Camera, Move, Sun } from 'lucide-react'
import StoryboardSketch from './StoryboardSketch'
import { analysis as analysisApi } from '../../services/api'
import useSketchProgress from '../../hooks/useSketchProgress'


// SVG is shown through <img>, so even if markup slipped past the server's
// sanitizer, no script inside it can run.
const svgDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// For the PDF report each sketch is pre-rendered to a JPEG at print resolution.
// Chrome would otherwise embed the pencil-texture SVG as a ~1.5 MB 300-dpi bitmap
// per panel; a JPEG keeps the whole report a few MB. The report waits until no
// [data-raster-pending] element remains before it signals it is ready to print.
const RASTER_WIDTH = 1400
const RASTER_HEIGHT = Math.round(RASTER_WIDTH * 9 / 16)

function RasterSketch({ svg, label }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = RASTER_WIDTH
        canvas.height = RASTER_HEIGHT
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#f4f1ea'
        ctx.fillRect(0, 0, RASTER_WIDTH, RASTER_HEIGHT)
        ctx.drawImage(img, 0, 0, RASTER_WIDTH, RASTER_HEIGHT)
        setSrc(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        setSrc(svgDataUri(svg)) // canvas unavailable: fall back to the SVG itself
      }
    }
    img.onerror = () => { if (!cancelled) setSrc(svgDataUri(svg)) }
    img.src = svgDataUri(svg)
    return () => { cancelled = true }
  }, [svg])
  if (!src) return <div data-raster-pending="true" className="absolute inset-0" />
  return <img src={src} alt={label} className="absolute inset-0 w-full h-full object-contain" />
}

// The server draws every panel in the background (started after analysis); this
// component shows progress and fills panels in as they're saved. readOnly (PDF
// report): show what's drawn, never start drawing, no controls.
export default function ShotStoryboard({ projectId, sceneIndex, scene, keySide, onFrame, onAnalysis, readOnly = false }) {
  const shots = scene?.shots || []
  const frames = scene?.storyboard || []
  const [drawing, setDrawing] = useState({})   // shotIndex -> true (manual redraw)
  const [errors, setErrors] = useState({})     // shotIndex -> message
  const { status } = useSketchProgress(readOnly ? null : projectId, { autoStart: true, onUpdate: onAnalysis })
  const disabled = status && !status.available ? 'Storyboard sketches need Claude — set ANTHROPIC_API_KEY in server/.env' : ''

  const draw = async (shotIndex, force = false) => {
    setDrawing((current) => ({ ...current, [shotIndex]: true }))
    setErrors((current) => ({ ...current, [shotIndex]: '' }))
    try {
      const result = await analysisApi.sketchShot(projectId, sceneIndex, shotIndex, force)
      onFrame(sceneIndex, shotIndex, result.frame)
    } catch (error) {
      setErrors((current) => ({ ...current, [shotIndex]: error.message }))
    } finally {
      setDrawing((current) => ({ ...current, [shotIndex]: false }))
    }
  }

  const done = shots.filter((_, i) => frames[i]?.sketchSvg).length
  const drawingInBackground = Boolean(status?.running)

  return (
    <div className="space-y-4">
      {!readOnly && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-300">
          {shots.length} shot{shots.length === 1 ? '' : 's'} · {done}/{shots.length} panels drawn in this scene
          {status ? <span className="text-slate-500"> · {status.drawn}/{status.total} across the project</span> : null}
        </div>
        {disabled ? (
          <div className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{disabled} — showing quick sketches.</div>
        ) : drawingInBackground ? (
          <div className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Drawing in the background — panels appear as they finish (about 1–2 min each, three at a time). You can leave this page.</div>
        ) : status?.failed > 0 && done < shots.length ? (
          <div className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{status.failed} panel(s) failed{status.lastError ? `: ${status.lastError}` : ''} — use ↻ to retry.</div>
        ) : null}
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {shots.map((shot, i) => {
          const frame = frames[i] || {}
          const busy = drawing[i] || (drawingInBackground && !frame.sketchSvg)
          return (
            <div key={shot._id || shot.id || i} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden break-inside-avoid">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-cinema-400 bg-cinema-500/10 px-2 py-0.5 rounded">SHOT {i + 1}</span>
                  <span className="text-sm font-medium text-white truncate">{shot.type}</span>
                </div>
                <span className="text-xs text-slate-400 font-mono shrink-0">{shot.lens}{shot.duration ? ` · ${shot.duration}` : ''}</span>
              </div>

              <div className="aspect-video relative bg-[#f4f1ea]">
                {frame.sketchSvg && readOnly ? (
                  <RasterSketch svg={frame.sketchSvg} label={`Storyboard sketch, shot ${i + 1}: ${shot.type}`} />
                ) : frame.sketchSvg ? (
                  <img src={svgDataUri(frame.sketchSvg)} alt={`Storyboard sketch, shot ${i + 1}: ${shot.type}`} className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className={`absolute inset-0 ${busy ? 'opacity-40' : ''}`}>
                    <StoryboardSketch shot={shot} keySide={keySide} />
                  </div>
                )}
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-3 py-1.5 rounded-full bg-black/70 text-white text-xs flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {drawing[i] ? `Drawing shot ${i + 1}…` : 'Queued for drawing…'}
                    </div>
                  </div>
                )}
                {!disabled && !busy && !readOnly && (
                  <button
                    onClick={() => draw(i, true)}
                    title={frame.sketchSvg ? 'Redraw this panel' : 'Draw this panel'}
                    className="absolute top-2 right-2 p-1.5 rounded bg-black/50 hover:bg-black/70 text-white transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="p-3 space-y-1.5">
                <p className="text-sm text-slate-200 leading-5">{shot.description}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Camera className="w-3 h-3" />{shot.angle}</span>
                  <span className="flex items-center gap-1"><Move className="w-3 h-3" />{shot.movement}</span>
                  {shot.lighting && <span className="flex items-center gap-1"><Sun className="w-3 h-3" /><span className={readOnly ? '' : 'truncate max-w-[18rem]'} title={shot.lighting}>{shot.lighting}</span></span>}
                </div>
                {errors[i] && !disabled && <div className="text-[11px] text-red-400">Couldn't draw: {errors[i]}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
