import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List, Image, Sun, Camera, Maximize, Move, ChevronRight, ChevronDown,
  Check, Edit3, MessageSquare, Pin, Eye, ArrowUpDown, Aperture, Focus, AlertTriangle, BarChart3
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { shots as shotsApi } from '../../services/api'

const outputTabs = [
  { id: 'shots', label: 'Shot List', icon: List },
  { id: 'storyboard', label: 'Storyboard', icon: Image },
  { id: 'lighting', label: 'Lighting Plans', icon: Sun },
  { id: 'camera', label: 'Camera & Lens', icon: Camera },
  { id: 'composition', label: 'Composition', icon: Maximize },
  { id: 'movement', label: 'Movement', icon: Move },
]

const statusColors = {
  approved: 'bg-onset-500/20 text-onset-400',
  pending: 'bg-amber-500/20 text-amber-400',
  revision: 'bg-red-500/20 text-red-400',
}

const intentColors = {
  establish: 'bg-blue-500/15 text-blue-400',
  detail: 'bg-purple-500/15 text-purple-400',
  character: 'bg-cinema-500/15 text-cinema-400',
  emotion: 'bg-pink-500/15 text-pink-400',
  dialogue: 'bg-cyan-500/15 text-cyan-400',
  thematic: 'bg-amber-500/15 text-amber-400',
}

const storyboardStyles = ['Cinematic', 'Sketch', 'Noir', 'Anime', 'Photorealistic']

const compositionRules = [
  { name: 'Rule of Thirds', desc: 'Subject placed at power points for natural visual tension', active: true },
  { name: 'Leading Lines', desc: 'Environmental lines draw eye toward subject', active: true },
  { name: 'Depth Layering', desc: 'Foreground, midground, background separation', active: false },
  { name: 'Frame Within Frame', desc: 'Doorways, windows, arches as nested frames', active: true },
  { name: 'Negative Space', desc: 'Intentional emptiness to convey isolation or vastness', active: false },
]

export default function GeneratedOutputs() {
  const navigate = useNavigate()
  const { currentProject, analysisData } = useProject()
  const [activeTab, setActiveTab] = useState('shots')
  const [selectedScene, setSelectedScene] = useState(0)
  const [storyboardStyle, setStoryboardStyle] = useState('Cinematic')
  const [expandedShot, setExpandedShot] = useState(null)

  const scenes = analysisData?.scenes || []
  const scene = scenes[selectedScene]

  if (!analysisData || scenes.length === 0) {
    return (
      <div className="animate-fadeIn text-center py-16">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <div className="text-lg text-white mb-2">No analysis data</div>
        <p className="text-sm text-slate-400 mb-4">Run AI analysis first to generate outputs.</p>
        <button onClick={() => navigate('/pre-production/analysis')} className="px-4 py-2 bg-cinema-500 text-white rounded-lg text-sm">Go to Analysis</button>
      </div>
    )
  }

  const handleApproveShot = async (shotId) => {
    if (!currentProject?._id) return
    try {
      await shotsApi.updateStatus(currentProject._id, selectedScene, shotId, { status: 'approved' })
    } catch { /* handle */ }
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Generated Outputs</h1>
          <p className="text-slate-400 text-sm">AI-generated cinematography plans — review, edit, and approve</p>
        </div>
        <button
          onClick={() => navigate('/pre-production/review')}
          className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition"
        >
          Review & Approve <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Scene Selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {scenes.map((s, i) => (
          <button
            key={s.number || i}
            onClick={() => setSelectedScene(i)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              selectedScene === i
                ? 'bg-cinema-500 text-white font-medium'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            SC {s.number || i + 1}
          </button>
        ))}
      </div>

      {/* Scene Header */}
      <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 mb-4 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{scene.title}</span>
          <span className="text-xs text-slate-500 ml-3">{scene.mood} &middot; {scene.style}</span>
        </div>
        <span className="text-xs text-slate-500">{scene.shots?.length || 0} shots &middot; {scene.duration}</span>
      </div>

      {/* Output Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-slate-800 pb-px">
        {outputTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 ${
              activeTab === tab.id
                ? 'text-cinema-400 border-cinema-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shot List */}
      {activeTab === 'shots' && (
        <div className="space-y-2 animate-fadeIn">
          {(scene.shots || []).map((shot, idx) => (
            <div
              key={shot._id || shot.id || idx}
              className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden"
            >
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-800/30 transition"
                onClick={() => setExpandedShot(expandedShot === idx ? null : idx)}
              >
                <span className="text-xs font-mono text-cinema-400 w-8">{idx + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${intentColors[shot.intent]}`}>{shot.intent}</span>
                <span className="text-sm text-white flex-1">{shot.description}</span>
                <span className="text-xs text-slate-500">{shot.type}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColors[shot.status]}`}>{shot.status}</span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition ${expandedShot === idx ? 'rotate-180' : ''}`} />
              </div>
              {expandedShot === idx && (
                <div className="px-3 pb-3 border-t border-slate-800/50 animate-fadeIn">
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <div className="text-center p-2 rounded bg-slate-800/50">
                      <div className="text-xs text-slate-500">Lens</div>
                      <div className="text-sm text-white font-medium">{shot.lens}</div>
                    </div>
                    <div className="text-center p-2 rounded bg-slate-800/50">
                      <div className="text-xs text-slate-500">Movement</div>
                      <div className="text-sm text-white font-medium">{shot.movement}</div>
                    </div>
                    <div className="text-center p-2 rounded bg-slate-800/50">
                      <div className="text-xs text-slate-500">Angle</div>
                      <div className="text-sm text-white font-medium">{shot.angle}</div>
                    </div>
                    <div className="text-center p-2 rounded bg-slate-800/50">
                      <div className="text-xs text-slate-500">Duration</div>
                      <div className="text-sm text-white font-medium">{shot.duration}</div>
                    </div>
                  </div>
                  <div className="mt-2 p-2 rounded bg-slate-800/50">
                    <div className="text-xs text-slate-500 mb-1">Lighting</div>
                    <div className="text-sm text-slate-300">{shot.lighting}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <BarChart3 className="w-3 h-3" />
                      Confidence: <span className={`font-medium ${shot.confidence >= 90 ? 'text-onset-400' : shot.confidence >= 80 ? 'text-amber-400' : 'text-red-400'}`}>{shot.confidence}%</span>
                    </div>
                    <div className="flex-1" />
                    <button onClick={() => handleApproveShot(shot._id || shot.id)} className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Accept">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Comment">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Pin to Timeline">
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Storyboard */}
      {activeTab === 'storyboard' && (
        <div className="animate-fadeIn">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500">Style Preset:</span>
            {storyboardStyles.map((s) => (
              <button
                key={s}
                onClick={() => setStoryboardStyle(s)}
                className={`px-3 py-1 rounded-full text-xs transition ${
                  storyboardStyle === s
                    ? 'bg-cinema-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(scene.storyboard || []).map((frame, i) => {
              const shot = scene.shots?.[frame.shotIndex ?? i]
              return (
                <div key={frame.id || i} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden group">
                  <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center">
                    {/* Simulated storyboard frame with grid overlay */}
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute left-1/3 top-0 bottom-0 border-l border-dashed border-cinema-400/40" />
                      <div className="absolute left-2/3 top-0 bottom-0 border-l border-dashed border-cinema-400/40" />
                      <div className="absolute top-1/3 left-0 right-0 border-t border-dashed border-cinema-400/40" />
                      <div className="absolute top-2/3 left-0 right-0 border-t border-dashed border-cinema-400/40" />
                    </div>
                    <div className="text-center z-10">
                      <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <div className="text-xs text-slate-500">{shot?.type} — {shot?.lens}</div>
                      <div className="text-xs text-slate-600 mt-1">{storyboardStyle} style</div>
                    </div>
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/50 text-xs text-white font-mono">
                      {i + 1}/{scene.storyboard?.length || 0}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition">
                      <div className="flex gap-1 justify-end">
                        <button className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-sm text-white">{frame.caption}</div>
                    <div className="text-xs text-slate-500 mt-1">{shot?.movement} &middot; {shot?.angle}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lighting Plans */}
      {activeTab === 'lighting' && scene.lightingPlan && (
        <div className="animate-fadeIn space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Key Light', data: scene.lightingPlan.keyLight || {}, color: 'cinema' },
              { label: 'Fill Light', data: scene.lightingPlan.fillLight || {}, color: 'amber' },
              { label: 'Back Light', data: scene.lightingPlan.backLight || {}, color: 'blue' },
            ].map(({ label, data, color }) => (
              <div key={label} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                <div className={`text-sm font-medium text-${color === 'cinema' ? 'cinema' : color}-400 mb-3`}>{label}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type</span>
                    <span className="text-white">{data.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Position</span>
                    <span className="text-white">{data.position}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Intensity</span>
                    <span className="text-white">{data.intensity}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Color Temp</span>
                    <span className="text-white">{data.color}</span>
                  </div>
                </div>
                <div className="mt-3 bg-slate-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${color === 'cinema' ? 'bg-cinema-400' : color === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${data.intensity}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Lighting Ratio</span>
              <span className="text-sm text-cinema-400 font-mono">{scene.lightingPlan.ratio}</span>
            </div>
            {scene.lightingPlan.practicals?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-1">Practicals</div>
                <div className="flex gap-2 flex-wrap">
                  {scene.lightingPlan.practicals.map((p) => (
                    <span key={p} className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-300">{p}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2">
              <span className="font-medium text-slate-400">Notes:</span> {scene.lightingPlan.notes}
            </div>
          </div>

          {/* Lighting Diagram */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-4">Overhead Lighting Diagram</div>
            <div className="relative w-full aspect-[2/1] bg-slate-800/50 rounded-lg border border-slate-700">
              {/* Set representation */}
              <div className="absolute inset-8 border border-dashed border-slate-600 rounded flex items-center justify-center">
                <span className="text-xs text-slate-600">SET</span>
              </div>
              {/* Key light indicator */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-cinema-500/40 border-2 border-cinema-400 flex items-center justify-center">
                  <Sun className="w-3 h-3 text-cinema-300" />
                </div>
                <span className="text-[10px] text-cinema-400 mt-1">KEY</span>
              </div>
              {/* Fill light indicator */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-amber-500/40 border-2 border-amber-400 flex items-center justify-center">
                  <Sun className="w-3 h-3 text-amber-300" />
                </div>
                <span className="text-[10px] text-amber-400 mt-1">FILL</span>
              </div>
              {/* Camera */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div className="w-6 h-6 rounded bg-white/10 border border-white/30 flex items-center justify-center">
                  <Camera className="w-3 h-3 text-white" />
                </div>
                <span className="text-[10px] text-white/60 mt-0.5">CAM</span>
              </div>
              {/* Subject */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="text-[10px] text-white/60">S</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera & Lens */}
      {activeTab === 'camera' && (
        <div className="animate-fadeIn space-y-3">
          {(scene.shots || []).map((shot, i) => (
            <div key={shot._id || shot.id || i} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-mono text-cinema-400">Shot {i + 1}</span>
                <span className="text-sm text-white font-medium">{shot.description}</span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                <div className="p-2 rounded-lg bg-slate-800/60 text-center">
                  <Aperture className="w-4 h-4 text-cinema-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Focal Length</div>
                  <div className="text-sm text-white font-medium">{shot.lens}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/60 text-center">
                  <Camera className="w-4 h-4 text-cinema-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Shot Size</div>
                  <div className="text-sm text-white font-medium">{shot.type}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/60 text-center">
                  <ArrowUpDown className="w-4 h-4 text-cinema-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Angle</div>
                  <div className="text-sm text-white font-medium">{shot.angle}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/60 text-center">
                  <Move className="w-4 h-4 text-cinema-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Movement</div>
                  <div className="text-sm text-white font-medium">{shot.movement}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/60 text-center">
                  <Focus className="w-4 h-4 text-cinema-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Framing</div>
                  <div className="text-sm text-white font-medium">{shot.intent}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composition */}
      {activeTab === 'composition' && (
        <div className="animate-fadeIn space-y-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-3">Composition Rules Applied</div>
            <div className="space-y-2">
              {compositionRules.map((rule) => (
                <div key={rule.name} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40">
                  <div className={`w-2 h-2 rounded-full ${rule.active ? 'bg-onset-400' : 'bg-slate-600'}`} />
                  <div className="flex-1">
                    <div className="text-sm text-white">{rule.name}</div>
                    <div className="text-xs text-slate-500">{rule.desc}</div>
                  </div>
                  <span className={`text-xs ${rule.active ? 'text-onset-400' : 'text-slate-600'}`}>
                    {rule.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Blocking diagram */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-3">Scene Blocking</div>
            <div className="relative w-full aspect-video bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-cinema-400/40" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-cinema-400/40" />
                <div className="absolute top-1/3 left-0 right-0 border-t border-cinema-400/40" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-cinema-400/40" />
              </div>
              {(scene.characters || []).map((char, i) => (
                <div
                  key={char}
                  className="absolute w-10 h-10 rounded-full bg-cinema-500/30 border-2 border-cinema-400 flex items-center justify-center"
                  style={{ top: `${35 + i * 20}%`, left: `${30 + i * 15}%` }}
                >
                  <span className="text-[10px] text-cinema-300 font-medium">{char.charAt(0)}</span>
                </div>
              ))}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 border-l-2 border-r-2 border-b-2 border-white/40" style={{ borderBottom: 'none', borderTop: '2px solid rgba(255,255,255,0.4)' }} />
                  <span className="text-[9px] text-white/40 mt-0.5">CAM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Depth Cues */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-3">Depth Cues</div>
            <div className="flex gap-3">
              {['Foreground Elements', 'Shallow DOF Separation', 'Atmospheric Haze', 'Practical Light Layers'].map((cue) => (
                <div key={cue} className="flex-1 p-3 rounded-lg bg-slate-800/50 text-center">
                  <div className="text-xs text-slate-300">{cue}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Movement */}
      {activeTab === 'movement' && (
        <div className="animate-fadeIn space-y-3">
          {(scene.shots || []).map((shot, i) => (
            <div key={shot._id || shot.id || i} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center gap-4">
              <span className="text-xs font-mono text-cinema-400 w-16">Shot {i + 1}</span>
              <div className="flex-1">
                <div className="text-sm text-white">{shot.description}</div>
                <div className="text-xs text-slate-500 mt-1">{shot.type} &middot; {shot.lens}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-cinema-300">{shot.movement}</div>
                <div className="text-xs text-slate-500">{shot.duration}</div>
              </div>
              <div className="w-20">
                <div className="text-[10px] text-slate-500 text-center mb-1">Speed</div>
                <div className="bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-cinema-400 h-1.5 rounded-full"
                    style={{ width: shot.movement === 'Static' ? '5%' : shot.movement.includes('Slight') ? '25%' : '60%' }}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-3">Movement Summary</div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'Static', count: (scene.shots || []).filter(s => s.movement === 'Static').length },
                { label: 'Pan/Tilt', count: (scene.shots || []).filter(s => s.movement?.includes('Pan')).length },
                { label: 'Push/Pull', count: (scene.shots || []).filter(s => s.movement?.toLowerCase().includes('push')).length },
                { label: 'Tracking', count: (scene.shots || []).filter(s => s.movement?.includes('Steadicam') || s.movement?.includes('Handheld')).length },
              ].map((m) => (
                <div key={m.label} className="p-2 rounded-lg bg-slate-800/50">
                  <div className="text-lg font-bold text-white">{m.count}</div>
                  <div className="text-xs text-slate-500">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
