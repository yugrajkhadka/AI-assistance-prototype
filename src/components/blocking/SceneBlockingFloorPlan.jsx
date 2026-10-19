// Top-down blocking floor plan driven by AI-generated character start/end
// positions and movement (server/src/prompts/blocking.js), not fabricated
// placeholder coordinates.
const FRAME = { x0: 8, y0: 8, x1: 92, y1: 62 }
const CHAR_COLORS = ['#818cf8', '#fbbf24', '#4ade80', '#f472b6', '#60a5fa']

function mapX(px) {
  return FRAME.x0 + (px / 100) * (FRAME.x1 - FRAME.x0)
}
function mapY(py) {
  return FRAME.y0 + (py / 100) * (FRAME.y1 - FRAME.y0)
}

function CameraGlyph({ x, y }) {
  return (
    <g>
      <rect x={x - 3.4} y={y - 1.8} width="6.8" height="4.2" rx="0.9" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
      <rect x={x - 1.4} y={y - 3.4} width="2.8" height="2" rx="0.4" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
    </g>
  )
}

export default function SceneBlockingFloorPlan({ blocking }) {
  const characters = blocking?.characters || []
  const camera = blocking?.camera || { x: 50, y: 95 }
  const cameraPos = { x: mapX(camera.x), y: mapY(Math.min(camera.y, 100)) }

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">Scene Blocking</div>
        <div className="text-xs text-slate-500">Derived from generated staging</div>
      </div>

      {characters.length === 0 ? (
        <div className="text-xs text-slate-500 p-4 text-center">No blocking generated for this scene yet.</div>
      ) : (
        <>
          <div className="w-full h-64">
            <svg viewBox="0 0 100 70" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className="block">
              <rect x="0" y="0" width="100" height="70" rx="2" className="fill-slate-800/50 stroke-slate-700" />
              <rect x={FRAME.x0} y={FRAME.y0} width={FRAME.x1 - FRAME.x0} height={FRAME.y1 - FRAME.y0} rx="1.5" className="fill-none stroke-slate-700" strokeDasharray="1.2 1.2" />

              <defs>
                <marker id="blockingArrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                  <path d="M0,0 L4,2 L0,4 Z" fill="#94a3b8" />
                </marker>
              </defs>

              {characters.map((char, i) => {
                const color = CHAR_COLORS[i % CHAR_COLORS.length]
                const start = { x: mapX(char.start?.x ?? 20), y: mapY(char.start?.y ?? 70) }
                const end = { x: mapX(char.end?.x ?? 50), y: mapY(char.end?.y ?? 40) }
                return (
                  <g key={char.name || i}>
                    <line
                      x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                      stroke={color} strokeWidth="0.5" strokeDasharray="1.5 1" markerEnd="url(#blockingArrow)" opacity="0.85"
                    />
                    <circle cx={start.x} cy={start.y} r="2.6" fill={color} opacity="0.9" />
                    <circle cx={end.x} cy={end.y} r="2.6" fill="none" stroke={color} strokeWidth="0.5" />
                    <text x={start.x} y={start.y - 3.5} textAnchor="middle" className="fill-white text-[2.6px] font-medium">
                      {char.name}
                    </text>
                  </g>
                )
              })}

              <CameraGlyph x={cameraPos.x} y={cameraPos.y} />
              <text x={cameraPos.x} y={cameraPos.y + 6} textAnchor="middle" className="fill-slate-400 text-[2.4px]">CAM</text>
            </svg>
          </div>

          <div className="mt-3 space-y-1.5">
            {characters.map((char, i) => (
              <div key={char.name || i} className="flex items-start gap-2 text-xs">
                <span className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: CHAR_COLORS[i % CHAR_COLORS.length] }} />
                <span className="text-slate-300"><span className="text-white font-medium">{char.name}</span> — {char.movement}</span>
              </div>
            ))}
            {blocking?.notes && (
              <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-800">
                <span className="font-medium text-slate-400">Notes:</span> {blocking.notes}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
