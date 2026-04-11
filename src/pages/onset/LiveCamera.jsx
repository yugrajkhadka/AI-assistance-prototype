import { useState } from 'react'
import {
  Camera, Video, Circle, Square, Tag, Sliders, Grid3x3, Crosshair,
  Eye, EyeOff, Thermometer, Sun, Aperture, Clock, Film, Layers,
  ChevronDown, Wifi, WifiOff, Battery, HardDrive, Monitor, Move
} from 'lucide-react'
import { sampleScenes, sampleCameraSettings } from '../../data/sampleProject'

const framingGuides = [
  { id: 'thirds', label: 'Rule of Thirds', icon: Grid3x3 },
  { id: 'center', label: 'Center Cross', icon: Crosshair },
  { id: 'safe', label: 'Safe Zones', icon: Monitor },
  { id: 'aspect', label: 'Aspect Ratio', icon: Layers },
]

export default function LiveCamera() {
  const [selectedScene, setSelectedScene] = useState(0)
  const [selectedShot, setSelectedShot] = useState(0)
  const [recording, setRecording] = useState(false)
  const [overlays, setOverlays] = useState({ thirds: true, center: false, safe: true, aspect: false })
  const [showHUD, setShowHUD] = useState(true)
  const [currentTake, setCurrentTake] = useState(1)

  const scene = sampleScenes[selectedScene]
  const shot = scene.shots[selectedShot]
  const cam = sampleCameraSettings

  const toggleOverlay = (id) => setOverlays(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="animate-fadeIn -m-6">
      {/* Full-width camera interface */}
      <div className="flex h-[calc(100vh-3rem)]">
        {/* Main Camera View */}
        <div className="flex-1 flex flex-col bg-black relative">
          {/* Camera viewport */}
          <div className="flex-1 relative overflow-hidden">
            {/* Simulated live preview */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-16 h-16 text-slate-700 mx-auto mb-3" />
                <div className="text-slate-600 text-sm">Live Camera Preview</div>
                <div className="text-slate-700 text-xs mt-1">{cam.resolution} &middot; {cam.frameRate} &middot; {cam.codec}</div>
              </div>
            </div>

            {/* Framing Overlays */}
            {overlays.thirds && (
              <div className="absolute inset-4 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/15" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/15" />
                <div className="absolute top-1/3 left-0 right-0 border-t border-white/15" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-white/15" />
                {/* Power points */}
                {[1/3, 2/3].map(x => [1/3, 2/3].map(y => (
                  <div key={`${x}-${y}`} className="absolute w-2 h-2 rounded-full bg-white/20" style={{ left: `${x*100}%`, top: `${y*100}%`, transform: 'translate(-50%,-50%)' }} />
                )))}
              </div>
            )}
            {overlays.center && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <Crosshair className="w-12 h-12 text-white/20" />
              </div>
            )}
            {overlays.safe && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-[5%] border border-dashed border-red-500/20 rounded" />
                <div className="absolute inset-[10%] border border-dashed border-yellow-500/15 rounded" />
              </div>
            )}

            {/* Recording indicator */}
            {recording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded bg-red-600/90">
                <Circle className="w-3 h-3 fill-white text-white animate-pulse" />
                <span className="text-white text-xs font-medium">REC</span>
                <span className="text-white/70 text-xs">00:04:32</span>
              </div>
            )}

            {/* HUD Overlay */}
            {showHUD && (
              <>
                {/* Top bar */}
                <div className="absolute top-3 right-4 flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1 text-white/50">
                    <Wifi className="w-3 h-3" />
                    <span>Connected</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/50">
                    <Battery className="w-3 h-3" />
                    <span>87%</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/50">
                    <HardDrive className="w-3 h-3" />
                    <span>412 GB free</span>
                  </div>
                </div>

                {/* Bottom HUD */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-12 pb-3 px-4">
                  <div className="flex items-end justify-between">
                    <div className="flex gap-4 text-[11px] text-white/70">
                      <div>
                        <div className="text-white/40">EXP</div>
                        <div className="text-white font-mono">{cam.exposure.value}</div>
                      </div>
                      <div>
                        <div className="text-white/40">ISO</div>
                        <div className="text-white font-mono">{cam.iso.value}</div>
                      </div>
                      <div>
                        <div className="text-white/40">SHUTTER</div>
                        <div className="text-white font-mono">{cam.shutter.value}</div>
                      </div>
                      <div>
                        <div className="text-white/40">WB</div>
                        <div className="text-white font-mono">{cam.whiteBalance.value}</div>
                      </div>
                      <div>
                        <div className="text-white/40">ND</div>
                        <div className="text-white font-mono">{cam.nd.value}</div>
                      </div>
                      <div>
                        <div className="text-white/40">LENS</div>
                        <div className="text-white font-mono">{cam.lens.focal} {cam.lens.tStop}</div>
                      </div>
                    </div>
                    <div className="text-right text-[11px]">
                      <div className="text-white/40">SCENE {scene.number} / SHOT {selectedShot + 1} / TAKE {currentTake}</div>
                      <div className="text-white font-medium">{shot.type} — {shot.lens}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Camera Controls Bar */}
          <div className="h-16 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              {/* Overlay toggles */}
              {framingGuides.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleOverlay(g.id)}
                  className={`p-2 rounded-lg transition ${overlays[g.id] ? 'bg-cinema-500/20 text-cinema-400' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                  title={g.label}
                >
                  <g.icon className="w-4 h-4" />
                </button>
              ))}
              <div className="w-px h-6 bg-slate-800 mx-1" />
              <button
                onClick={() => setShowHUD(!showHUD)}
                className={`p-2 rounded-lg transition ${showHUD ? 'text-white' : 'text-slate-600'}`}
                title="Toggle HUD"
              >
                {showHUD ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>

            {/* Record / Take controls */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition">
                <Tag className="w-3.5 h-3.5" /> Tag Take
              </button>
              <button
                onClick={() => {
                  if (recording) setCurrentTake(t => t + 1)
                  setRecording(!recording)
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  recording ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600/20 hover:bg-red-600/40 border-2 border-red-500'
                }`}
              >
                {recording ? <Square className="w-5 h-5 text-white fill-white" /> : <Circle className="w-5 h-5 text-red-400 fill-red-500" />}
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition">
                <Film className="w-3.5 h-3.5" /> Slate Sync
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Take {currentTake}</span>
              <Sliders className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Right Panel — Scene / Shot Selector */}
        <div className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800">
            <div className="text-sm font-medium text-white mb-2">Scene Selector</div>
            <div className="flex gap-1 flex-wrap">
              {sampleScenes.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedScene(i); setSelectedShot(0); setCurrentTake(1) }}
                  className={`px-2 py-1 rounded text-xs transition ${
                    selectedScene === i ? 'bg-cinema-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  SC {s.number}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 border-b border-slate-800">
            <div className="text-xs text-slate-500 mb-1">{scene.title}</div>
            <div className="text-xs text-slate-600">{scene.mood} &middot; {scene.style}</div>
          </div>

          {/* Shot list */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-1">
              {scene.shots.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedShot(i); setCurrentTake(1) }}
                  className={`w-full text-left p-2.5 rounded-lg transition ${
                    selectedShot === i ? 'bg-cinema-500/15 border border-cinema-500/30' : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-cinema-400">{i + 1}</span>
                    <span className="text-xs text-white truncate flex-1">{s.type}</span>
                    <span className={`w-2 h-2 rounded-full ${s.status === 'approved' ? 'bg-onset-400' : s.status === 'pending' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 truncate pl-5">{s.description}</div>
                  <div className="flex gap-2 mt-1 pl-5">
                    <span className="text-[10px] text-slate-600">{s.lens}</span>
                    <span className="text-[10px] text-slate-600">{s.movement}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Camera Settings Quick Panel */}
          <div className="p-3 border-t border-slate-800 space-y-2">
            <div className="text-xs font-medium text-white mb-1">Quick Settings</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'ISO', value: cam.iso.value, icon: Thermometer },
                { label: 'WB', value: cam.whiteBalance.value, icon: Sun },
                { label: 'Aperture', value: cam.exposure.value, icon: Aperture },
                { label: 'Shutter', value: cam.shutter.value, icon: Clock },
                { label: 'ND', value: cam.nd.value, icon: Layers },
                { label: 'FPS', value: cam.frameRate, icon: Film },
              ].map(({ label, value, icon: Icon }) => (
                <button key={label} className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition text-center group">
                  <Icon className="w-3 h-3 text-slate-500 group-hover:text-cinema-400 mx-auto mb-0.5 transition" />
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className="text-xs text-white font-mono">{value}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
