// Overhead lighting floor plan. Camera sits at the bottom looking "up" the plan
// at the subject, so camera-left is screen-left. Fixtures are placed from each
// light's azimuth/elevation/distance; labels are kept short and pushed apart so
// they never overlap, and the full detail lives in the legend under the plan.
import { useMemo, useState } from 'react'
import { Camera as CameraIcon, Lightbulb } from 'lucide-react'
import { getLights, getPracticals, describeDirection, isUnlitPlan } from '../../utils/lightingLayout'

const COLOR_HEX = { cinema: '#818cf8', amber: '#fbbf24', blue: '#60a5fa', slate: '#cbd5e1' }
const W = 640
const H = 440
const SUBJECT = { x: W / 2, y: 215 }
const FRAME = { x0: 18, y0: 14, x1: W - 18, y1: H - 14 }

const SHOT_CAMERA_DISTANCE = { wide: 165, 'two-shot': 140, medium: 120, 'over-shoulder': 110, 'close-up': 90, insert: 75 }

function cameraDistanceForShot(shot) {
  const type = (shot?.type || '').toLowerCase()
  const key = Object.keys(SHOT_CAMERA_DISTANCE).find((k) => type.includes(k))
  return SHOT_CAMERA_DISTANCE[key] || 130
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Plan coordinates for a light: 0° = beside the camera (toward the bottom),
// ±180° = behind the subject (top). Overhead units sit on top of the subject.
function placeLight(light) {
  if (light.elevationDeg >= 75) {
    const a = (light.azimuthDeg * Math.PI) / 180
    return { x: SUBJECT.x + Math.sin(a) * 34, y: SUBJECT.y - 30, overhead: true }
  }
  const r = clamp(70 + light.distanceM * 26, 85, 185)
  const a = (light.azimuthDeg * Math.PI) / 180
  return {
    x: clamp(SUBJECT.x + Math.sin(a) * r, FRAME.x0 + 30, FRAME.x1 - 30),
    y: clamp(SUBJECT.y + Math.cos(a) * r, FRAME.y0 + 30, FRAME.y1 - 30),
    overhead: false,
  }
}

function placePractical(p, index, count) {
  if (typeof p.azimuthDeg === 'number') {
    const r = clamp(55 + (p.distanceM || 2) * 26, 70, 190)
    const a = (p.azimuthDeg * Math.PI) / 180
    return { x: clamp(SUBJECT.x + Math.sin(a) * r, FRAME.x0 + 16, FRAME.x1 - 16), y: clamp(SUBJECT.y + Math.cos(a) * r, FRAME.y0 + 16, FRAME.y1 - 16) }
  }
  // Unknown position: line them up along the back of the set.
  const span = FRAME.x1 - FRAME.x0 - 120
  return { x: FRAME.x0 + 60 + (count === 1 ? span / 2 : (span * index) / (count - 1)), y: FRAME.y0 + 22 }
}

// Push label boxes apart (and off the subject/camera) until nothing overlaps.
function layoutLabels(items, obstacles) {
  const boxes = items.map((it) => ({ ...it }))
  const overlap = (a, b) => !(a.x + a.w / 2 + 4 < b.x - b.w / 2 || b.x + b.w / 2 + 4 < a.x - a.w / 2 || a.y + a.h / 2 + 3 < b.y - b.h / 2 || b.y + b.h / 2 + 3 < a.y - a.h / 2)
  for (let iter = 0; iter < 120; iter += 1) {
    let moved = false
    for (let i = 0; i < boxes.length; i += 1) {
      for (const other of [...boxes.slice(i + 1), ...obstacles]) {
        const a = boxes[i]
        if (!overlap(a, other)) continue
        moved = true
        const dy = a.y - other.y || (i % 2 ? 1 : -1)
        const dx = a.x - other.x || 1
        const push = 3
        // Labels are wide and short, so separate them vertically unless they're
        // almost side by side — sideways nudges just bounce between neighbours.
        if (Math.abs(dy) >= Math.abs(dx) * 0.2) {
          a.y += Math.sign(dy) * push
          if (other.movable) other.y -= Math.sign(dy) * push
        } else {
          a.x += Math.sign(dx) * push
          if (other.movable) other.x -= Math.sign(dx) * push
        }
      }
      const a = boxes[i]
      a.x = clamp(a.x, FRAME.x0 + a.w / 2 + 2, FRAME.x1 - a.w / 2 - 2)
      a.y = clamp(a.y, FRAME.y0 + a.h / 2 + 2, FRAME.y1 - a.h / 2 - 2)
    }
    if (!moved) break
  }
  return boxes
}

function Fixture({ x, y, angle, colorHex, beamLength, overhead }) {
  return (
    <g>
      {!overhead && (
        <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
          <polygon points={`-9,2 9,2 ${beamLength * 0.38},${beamLength} ${-beamLength * 0.38},${beamLength}`} fill={colorHex} opacity="0.13" />
        </g>
      )}
      {overhead && <circle cx={x} cy={y} r="15" fill={colorHex} opacity="0.12" stroke={colorHex} strokeDasharray="3 3" />}
      <g transform={`translate(${x}, ${y}) rotate(${angle})`}>
        <polygon points="-6,-8 6,-8 11,3 -11,3" fill="#0f172a" stroke={colorHex} strokeWidth="1.4" />
      </g>
    </g>
  )
}

export default function LightingFloorPlan({ lightingPlan, shots = [], readOnly = false }) {
  const [activeShotIndex, setActiveShotIndex] = useState(0)
  const lights = useMemo(() => getLights(lightingPlan), [lightingPlan])
  const practicals = useMemo(() => getPracticals(lightingPlan), [lightingPlan])

  const activeShot = shots[activeShotIndex]
  const camera = { x: SUBJECT.x, y: Math.min(SUBJECT.y + cameraDistanceForShot(activeShot), FRAME.y1 - 34) }

  const placed = useMemo(() => lights.map((light) => ({ ...light, pos: placeLight(light) })), [lights])
  const placedPracticals = useMemo(() => practicals.map((p, i) => ({ ...p, pos: placePractical(p, i, practicals.length) })), [practicals])

  const labels = useMemo(() => {
    const items = placed.map((light) => {
      // Start each label just outside its fixture, away from the subject.
      const dx = light.pos.x - SUBJECT.x
      const dy = light.pos.y - SUBJECT.y
      const len = Math.hypot(dx, dy) || 1
      const w = Math.max(light.label.length * 7, (light.short || '').length * 5.6) + 14
      return {
        id: light.id, w, h: light.short ? 28 : 16, movable: true,
        x: light.pos.x + (dx / len) * 34, y: light.pos.y + (dy / len) * 30 + (light.pos.overhead ? -28 : 0),
      }
    })
    const obstacles = [
      { x: SUBJECT.x, y: SUBJECT.y, w: 44, h: 44 },
      { x: camera.x, y: camera.y + 8, w: 70, h: 46 },
      ...placed.map((l) => ({ x: l.pos.x, y: l.pos.y, w: 26, h: 20 })),
      // Practical marker plus its "P1" label underneath.
      ...placedPracticals.map((p) => ({ x: p.pos.x, y: p.pos.y + 7, w: 28, h: 34 })),
    ]
    return Object.fromEntries(layoutLabels(items, obstacles).map((b) => [b.id, b]))
  }, [placed, placedPracticals, camera.x, camera.y])

  if (isUnlitPlan(lightingPlan)) {
    return (
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-400">
        <div className="text-sm font-medium text-white mb-1">Overhead Lighting Floor Plan</div>
        Not a photographed scene{lightingPlan?.reason ? ` — ${lightingPlan.reason}` : ' (graphics / title card)'}; no lighting rig needed.
      </div>
    )
  }

  return (
    <div className="theme-dark lighting-card p-6 rounded-xl border border-slate-800 bg-slate-900/40 break-inside-avoid">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">Overhead Lighting Floor Plan{readOnly && activeShot ? <span className="text-slate-500 font-normal"> · camera for shot 1 ({activeShot.type})</span> : null}</div>
        <div className="text-xs text-slate-500">Top view · camera at bottom · camera-left is screen-left</div>
      </div>

      {shots.length > 0 && !readOnly && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-slate-500">Camera for:</span>
          {shots.map((shot, i) => (
            <button
              key={shot._id || shot.id || i}
              onClick={() => setActiveShotIndex(i)}
              className={`px-2.5 py-1 rounded-full text-xs transition ${i === activeShotIndex ? 'bg-cinema-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              {i + 1}. {shot.type || 'Shot'}
            </button>
          ))}
        </div>
      )}

      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block max-h-136" role="img" aria-label="Overhead lighting floor plan">
          <rect x="0" y="0" width={W} height={H} rx="10" fill="#0b1220" stroke="#334155" />
          <rect x={FRAME.x0} y={FRAME.y0} width={FRAME.x1 - FRAME.x0} height={FRAME.y1 - FRAME.y0} rx="6" fill="none" stroke="#334155" strokeDasharray="4 4" />
          <text x={FRAME.x0 + 8} y={FRAME.y0 + 14} fill="#475569" fontSize="9">UPSTAGE / BEHIND SUBJECT</text>
          <text x={FRAME.x0 + 8} y={FRAME.y1 - 6} fill="#475569" fontSize="9">CAMERA SIDE</text>

          {/* lens axis */}
          <line x1={SUBJECT.x} y1={SUBJECT.y} x2={camera.x} y2={camera.y} stroke="#64748b" strokeDasharray="3 3" />

          {placed.map((light) => {
            const angle = (Math.atan2(-(SUBJECT.x - light.pos.x), SUBJECT.y - light.pos.y) * 180) / Math.PI
            const dist = Math.hypot(SUBJECT.x - light.pos.x, SUBJECT.y - light.pos.y)
            return (
              <Fixture
                key={light.id}
                x={light.pos.x}
                y={light.pos.y}
                angle={angle}
                colorHex={COLOR_HEX[light.color]}
                beamLength={Math.max(0, dist - 16)}
                overhead={light.pos.overhead}
              />
            )
          })}

          {placedPracticals.map((p) => (
            <g key={p.id}>
              <circle cx={p.pos.x} cy={p.pos.y} r="7" fill="#fbbf24" opacity="0.25" />
              <circle cx={p.pos.x} cy={p.pos.y} r="3.5" fill="#fde68a" />
              <text x={p.pos.x} y={p.pos.y + 17} textAnchor="middle" fill="#fcd34d" fontSize="9" fontWeight="600">{p.id}</text>
            </g>
          ))}

          {/* subject */}
          <ellipse cx={SUBJECT.x} cy={SUBJECT.y + 6} rx="16" ry="9" fill="#cbd5e1" stroke="#475569" />
          <circle cx={SUBJECT.x} cy={SUBJECT.y - 4} r="10" fill="#e2e8f0" stroke="#475569" />
          <text x={SUBJECT.x} y={SUBJECT.y + 30} textAnchor="middle" fill="#94a3b8" fontSize="9">SUBJECT</text>

          {/* camera */}
          <g>
            <rect x={camera.x - 12} y={camera.y - 7} width="24" height="15" rx="3" fill="#0f172a" stroke="#94a3b8" />
            <rect x={camera.x - 5} y={camera.y - 14} width="10" height="8" rx="1.5" fill="#0f172a" stroke="#94a3b8" />
            <text x={camera.x} y={camera.y + 21} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600">CAMERA{activeShot?.lens ? ` · ${activeShot.lens}` : ''}</text>
          </g>

          {/* labels last, so they sit above beams; leader line when pushed away */}
          {placed.map((light) => {
            const box = labels[light.id]
            if (!box) return null
            const far = Math.hypot(box.x - light.pos.x, box.y - light.pos.y) > 34
            return (
              <g key={`label-${light.id}`}>
                {far && <line x1={light.pos.x} y1={light.pos.y} x2={box.x} y2={box.y} stroke={COLOR_HEX[light.color]} strokeWidth="0.8" opacity="0.6" />}
                <rect x={box.x - box.w / 2} y={box.y - box.h / 2} width={box.w} height={box.h} rx="4" fill="#0f172a" stroke={COLOR_HEX[light.color]} strokeWidth="0.8" opacity="0.95" />
                <text x={box.x} y={box.y - (light.short ? 3 : -4)} textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="700">{light.label}</text>
                {light.short && <text x={box.x} y={box.y + 10} textAnchor="middle" fill="#94a3b8" fontSize="9">{light.short}</text>}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1 pr-3 font-medium">Light</th>
              <th className="py-1 pr-3 font-medium">Fixture</th>
              <th className="py-1 pr-3 font-medium">Direction</th>
              <th className="py-1 pr-3 font-medium">Height</th>
              <th className="py-1 pr-3 font-medium">Distance</th>
              <th className="py-1 pr-3 font-medium">Output</th>
              <th className="py-1 font-medium">Color</th>
            </tr>
          </thead>
          <tbody>
            {placed.map((light) => (
              <tr key={light.id} className="border-t border-slate-800 text-slate-300 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: COLOR_HEX[light.color] }} />
                  {light.label}
                </td>
                <td className="py-1.5 pr-3 min-w-48" title={light.data?.type || light.name}>{light.name}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{describeDirection(light)}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{light.elevationDeg >= 75 ? 'overhead' : `${Math.round(light.elevationDeg)}° up`}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{light.distanceM ? `${light.distanceM} m` : '—'}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{light.intensity != null ? `${light.intensity}%` : '—'}</td>
                <td className="py-1.5 whitespace-nowrap" title={light.data?.color || ''}>{light.colorShort || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {placedPracticals.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {placedPracticals.map((p) => (
            <div key={p.id} className="text-xs text-slate-300 flex gap-2">
              <span className="font-semibold text-amber-300 shrink-0">{p.id}</span>
              <span>
                {p.name}
                <span className="text-slate-500">{[p.colorTempK ? ` · ${p.colorTempK}K` : '', p.dimmerPct != null ? ` · ${p.dimmerPct}%` : ''].join('')}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLOR_HEX.cinema }} /> Key</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLOR_HEX.amber }} /> Fill</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLOR_HEX.blue }} /> Back</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLOR_HEX.slate }} /> Extra</span>
        <span className="flex items-center gap-1"><Lightbulb className="w-3 h-3 text-amber-300" /> Practical</span>
        <span className="flex items-center gap-1"><CameraIcon className="w-3 h-3 text-white/60" /> Camera</span>
      </div>
    </div>
  )
}
