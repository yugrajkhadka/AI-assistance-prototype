// Procedural storyboard sketch, drawn from the shot's own type, angle, and
// movement — no image-generation API involved. One parametric human
// silhouette (natural proportions) is reused at different scale/position per
// shot type, the same way a real camera just moves closer or further from
// the same subject. Shading direction follows the scene's actual key-light
// side so the sketch stays grounded in the generated lighting plan.
import { useId } from 'react'

const FRAME = { x0: 6, y0: 6, x1: 154, y1: 84 }

function horizonY(angle = '') {
  const a = angle.toLowerCase()
  if (a === 'high') return 20
  if (a.includes('slightly high')) return 30
  if (a.includes('slightly low')) return 58
  if (a === 'low') return 70
  return 45
}

// Local unit figure: head-top at y=0, feet at y=260, natural standing pose
// with a slight contrapposto (weight on one leg) for a less rigid silhouette.
function SilhouetteBody() {
  return (
    <>
      <ellipse cx="50" cy="27" rx="16" ry="19" />
      <path d="M 34,20 C 34,8 66,8 66,20 C 68,14 62,4 50,4 C 38,4 32,14 34,20 Z" />
      <path d="M 43,40 L 57,40 L 54,53 L 46,53 Z" />
      <path d="M 24,58 C 24,50 40,46 50,46 C 60,46 76,50 76,58 C 80,80 78,110 70,131 C 74,141 74,148 70,156 L 30,156 C 26,148 26,141 30,131 C 22,110 20,80 24,58 Z" />
      <path d="M 25,60 C 15,70 11,95 15,121 C 16,131 19,138 23,143 L 31,139 C 27,121 27,96 31,76 C 29,69 27,64 25,60 Z" />
      <path d="M 75,60 C 85,70 89,95 85,121 C 84,131 81,138 77,143 L 69,139 C 73,121 73,96 69,76 C 71,69 73,64 75,60 Z" />
      <path d="M 30,156 C 26,181 26,211 30,236 C 31,246 30,253 28,259 L 45,259 C 47,251 46,241 44,231 C 46,206 47,181 43,156 Z" />
      <path d="M 57,156 C 53,181 54,211 58,236 C 59,246 58,253 56,259 L 73,259 C 75,251 74,241 72,231 C 74,206 75,181 71,156 Z" />
    </>
  )
}

function Silhouette({ headCx, headCy, scale, fillId, opacity = 1, blur = false }) {
  const tx = headCx - 50 * scale
  const ty = headCy - 27 * scale
  return (
    <g
      transform={`translate(${tx}, ${ty}) scale(${scale})`}
      fill={`url(#${fillId})`}
      stroke="#334155"
      strokeWidth={1.2 / scale}
      opacity={opacity}
      filter={blur ? 'url(#dofBlur)' : undefined}
    >
      <SilhouetteBody />
    </g>
  )
}

function ShadingGradient({ id, keySide }) {
  const lit = '#8a93a6'
  const shadow = '#1e2836'
  const [x1, x2] = keySide === 'right' ? ['100%', '0%'] : ['0%', '100%']
  return (
    <linearGradient id={id} x1={x1} y1="0%" x2={x2} y2="0%">
      <stop offset="0%" stopColor={lit} />
      <stop offset="100%" stopColor={shadow} />
    </linearGradient>
  )
}

function PerspectiveEnvironment({ hy }) {
  const vpX = 80
  return (
    <g stroke="#c9c2b3" strokeWidth="0.5" opacity="0.6">
      <line x1={FRAME.x0} y1={FRAME.y1} x2={vpX} y2={hy} />
      <line x1={FRAME.x1} y1={FRAME.y1} x2={vpX} y2={hy} />
      <line x1={FRAME.x0} y1={FRAME.y0} x2={vpX} y2={hy} />
      <line x1={FRAME.x1} y1={FRAME.y0} x2={vpX} y2={hy} />
    </g>
  )
}

function MovementOverlay({ movement = '' }) {
  const m = movement.toLowerCase()
  if (m.includes('pan')) {
    return (
      <g stroke="#94a3b8" strokeWidth="1.4" fill="none">
        <line x1="30" y1="14" x2="130" y2="14" markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
      </g>
    )
  }
  if (m.includes('dolly') || m.includes('push') || m.includes('track') || m.includes('truck')) {
    return (
      <g stroke="#94a3b8" strokeWidth="1.4" fill="none">
        <line x1="80" y1="80" x2="80" y2="60" markerEnd="url(#arrowEnd)" />
      </g>
    )
  }
  if (m.includes('handheld')) {
    return (
      <path d="M 12 78 q 3 -6 6 0 q 3 -6 6 0 q 3 -6 6 0" stroke="#94a3b8" strokeWidth="1.2" fill="none" />
    )
  }
  return null
}

export default function StoryboardSketch({ shot, keySide = 'left' }) {
  const gradId = useId().replace(/:/g, '')
  const hy = horizonY(shot?.angle)
  const type = (shot?.type || '').toLowerCase()

  let body
  if (type.includes('over-shoulder') || type.includes('over shoulder')) {
    body = (
      <>
        <PerspectiveEnvironment hy={hy} />
        <Silhouette headCx={58} headCy={38} scale={0.34} fillId={gradId} />
        <Silhouette headCx={150} headCy={70} scale={1.9} fillId={gradId} opacity={0.55} blur />
      </>
    )
  } else if (type.includes('insert')) {
    body = (
      <g stroke="#334155" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="62" y="34" width="36" height="24" rx="3" />
        <line x1="70" y1="46" x2="90" y2="46" />
        {/* detail-frame corner marks, matching real storyboard "insert" convention */}
        <path d="M 54,28 L 54,22 L 60,22" />
        <path d="M 106,28 L 106,22 L 100,22" />
        <path d="M 54,64 L 54,70 L 60,70" />
        <path d="M 106,64 L 106,70 L 100,70" />
      </g>
    )
  } else if (type.includes('close')) {
    body = <Silhouette headCx={80} headCy={40} scale={1.55} fillId={gradId} />
  } else if (type.includes('medium')) {
    body = (
      <>
        <PerspectiveEnvironment hy={hy} />
        <Silhouette headCx={80} headCy={26} scale={0.46} fillId={gradId} />
      </>
    )
  } else {
    body = (
      <>
        <PerspectiveEnvironment hy={hy} />
        <Silhouette headCx={80} headCy={Math.max(16, hy - 12)} scale={0.15} fillId={gradId} />
      </>
    )
  }

  return (
    <svg viewBox="0 0 160 90" className="w-full h-full">
      <defs>
        <marker id="arrowEnd" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
        <marker id="arrowStart" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6 Z" fill="#94a3b8" />
        </marker>
        <filter id="dofBlur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <ShadingGradient id={gradId} keySide={keySide} />
      </defs>

      <rect x="0" y="0" width="160" height="90" fill="#f4f1ea" />
      <rect x={FRAME.x0} y={FRAME.y0} width={FRAME.x1 - FRAME.x0} height={FRAME.y1 - FRAME.y0} fill="none" stroke="#c9c2b3" />
      <line x1={FRAME.x0} y1={hy} x2={FRAME.x1} y2={hy} stroke="#c9c2b3" strokeDasharray="2 2" opacity="0.7" />

      <g clipPath="none">
        {body}
      </g>
      <MovementOverlay movement={shot?.movement} />
    </svg>
  )
}
