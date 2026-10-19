import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List, Image, Sun, Camera, Maximize, Move, ChevronRight, ChevronDown,
  Check, Edit3, MessageSquare, Pin, Eye, ArrowUpDown, Aperture, Focus, AlertTriangle, BarChart3
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { shots as shotsApi } from '../../services/api'
import ShotStoryboard from '../../components/storyboard/ShotStoryboard'
import LightingFloorPlan from '../../components/lighting/LightingFloorPlan'
import SceneBlockingFloorPlan from '../../components/blocking/SceneBlockingFloorPlan'
import { getKeySide, getLights, getPracticals, describeDirection, isUnlitPlan } from '../../utils/lightingLayout'

const outputTabs = [
  { id: 'shots', label: 'Shot List', icon: List },
  { id: 'storyboard', label: 'Storyboard', icon: Image },
  { id: 'lighting', label: 'Lighting Plans', icon: Sun },
  { id: 'camera', label: 'Camera & Lens', icon: Camera },
  { id: 'composition', label: 'Composition', icon: Maximize },
  { id: 'movement', label: 'Movement', icon: Move },
]

const LIGHT_TITLE = { key: 'Key Light', fill: 'Fill Light', back: 'Back Light' }
const LIGHT_TEXT = { cinema: 'text-cinema-400', amber: 'text-amber-400', blue: 'text-blue-400', slate: 'text-slate-300' }
const LIGHT_BAR = { cinema: 'bg-cinema-400', amber: 'bg-amber-400', blue: 'bg-blue-400', slate: 'bg-slate-400' }

// "About 3:1 key-to-fill on Dracula's face…" → "3:1"; older plans stored prose here.
const ratioShort = (ratio = '') => (String(ratio).match(/\d+(?:\.\d+)?\s*:\s*\d+/) || [String(ratio).slice(0, 12)])[0].replace(/\s+/g, '')

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

// printMode renders one scene + one tab read-only for the PDF report: data comes
// from props, every shot is expanded, notes are open, and controls are hidden.
export default function GeneratedOutputs({ printMode = false, project, analysis, sceneIndex = 0, tab = 'shots' } = {}) {
  const navigate = useNavigate()
  const ctx = useProject()
  const currentProject = printMode ? project : ctx.currentProject
  const analysisData = printMode ? analysis : ctx.analysisData
  const { setAnalysisData } = ctx
  const [activeTabState, setActiveTab] = useState('shots')
  const [selectedSceneState, setSelectedScene] = useState(0)
  const activeTab = printMode ? tab : activeTabState
  const selectedScene = printMode ? sceneIndex : selectedSceneState
  const [expandedShot, setExpandedShot] = useState(null)
  const [noteDrafts, setNoteDrafts] = useState({})

  const scenes = useMemo(() => analysisData?.scenes || [], [analysisData?.scenes])
  const scene = scenes[selectedScene]
  const compositionRules = useMemo(() => {
    if (!scene) return []
    const lead = scene.characters?.[0] || 'the lead'
    return [
      {
        name: 'Power-Point Anchor',
        desc: `Keep ${lead} riding the left or right third so the frame breathes and the environment carries pressure around them.`,
        active: true,
      },
      {
        name: 'Practical-Motivated Depth',
        desc: `Use practicals and doorway depth in ${scene.locations?.[0] || 'the set'} so the frame feels like a real room rather than coverage floating in space.`,
        active: true,
      },
      {
        name: 'Compression Shift',
        desc: 'Let longer focal lengths arrive only when the emotional beat tightens, so the visual grammar escalates with the scene.',
        active: (scene.shots || []).some((shot) => shot.lens?.includes('85') || shot.lens?.includes('100')),
      },
      {
        name: 'Foreground Occlusion',
        desc: 'Introduce furniture, shoulders, or practicals in foreground whenever the scene benefits from surveillance, intimacy, or tension.',
        active: (scene.characters || []).length > 1,
      },
    ]
  }, [scene])

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
      const updatedShot = await shotsApi.updateStatus(currentProject._id, selectedScene, shotId, { status: 'approved' })
      setAnalysisData({
        ...analysisData,
        scenes: analysisData.scenes.map((item, index) => index !== selectedScene
          ? item
          : { ...item, shots: item.shots.map((shot) => ((shot._id || shot.id) === (updatedShot._id || updatedShot.id) ? updatedShot : shot)) }),
      })
    } catch { /* handle */ }
  }

  // A newly drawn panel arrives; merge it in without clobbering panels drawn in parallel.
  const handleStoryboardFrame = (sceneIndex, shotIndex, frame) => {
    setAnalysisData((current) => {
      if (!current?.scenes?.[sceneIndex]) return current
      return {
        ...current,
        scenes: current.scenes.map((item, index) => {
          if (index !== sceneIndex) return item
          const board = [...(item.storyboard || [])]
          board[shotIndex] = { ...board[shotIndex], ...frame }
          return { ...item, storyboard: board }
        }),
      }
    })
  }

  const handleNote = async (shotId) => {
    const text = noteDrafts[shotId]?.trim()
    if (!text || !currentProject?._id) return
    const updatedShot = await shotsApi.updateStatus(currentProject._id, selectedScene, shotId, { notes: text })
    setAnalysisData({
      ...analysisData,
      scenes: analysisData.scenes.map((item, index) => index !== selectedScene
        ? item
        : { ...item, shots: item.shots.map((shot) => ((shot._id || shot.id) === shotId ? updatedShot : shot)) }),
    })
    setNoteDrafts((current) => ({ ...current, [shotId]: '' }))
  }

  return (
    <div className={printMode ? '' : 'animate-fadeIn'}>
      {!printMode && (<>
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

      </>)}

      {/* Output Tabs */}
      {!printMode && (
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-slate-800 pb-px">
        {outputTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 ${
              activeTab === item.id
                ? 'text-cinema-400 border-cinema-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        ))}
      </div>
      )}

      {/* Shot List */}
      {activeTab === 'shots' && (
        <div className="space-y-2 animate-fadeIn">
          {(scene.shots || []).map((shot, idx) => (
            <div
              key={shot._id || shot.id || idx}
              className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden break-inside-avoid"
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
                {!printMode && <ChevronDown className={`w-4 h-4 text-slate-500 transition ${expandedShot === idx ? 'rotate-180' : ''}`} />}
              </div>
              {(printMode || expandedShot === idx) && (
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
                    {!printMode && (<>
                    <button onClick={() => handleApproveShot(shot._id || shot.id)} className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Accept">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => navigate('/pre-production/review')} className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleNote(shot._id || shot.id)} className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Comment">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition" title="Pin to Timeline">
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    </>)}
                  </div>
                  {(shot.notes || []).length > 0 && printMode && (
                    <div className="mt-2 space-y-1">
                      {shot.notes.map((note, n) => (
                        <div key={n} className="text-xs text-slate-400"><span className="text-slate-500">{note.author || 'Note'}:</span> {note.text}</div>
                      ))}
                    </div>
                  )}
                  {!printMode && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={noteDrafts[shot._id || shot.id] || ''}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [shot._id || shot.id]: event.target.value }))}
                      placeholder="Add practical note for this shot"
                      className="flex-1 bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500"
                    />
                  </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Storyboard */}
      {activeTab === 'storyboard' && (
        <div className="animate-fadeIn">
          <ShotStoryboard
            projectId={currentProject?._id}
            sceneIndex={selectedScene}
            scene={scene}
            keySide={getKeySide(scene.lightingPlan)}
            onFrame={handleStoryboardFrame}
            onAnalysis={(fresh) => fresh?.scenes && setAnalysisData(fresh)}
            readOnly={printMode}
          />
        </div>
      )}

      {/* Lighting Plans */}
      {activeTab === 'lighting' && scene.lightingPlan && (
        <div className="animate-fadeIn space-y-4">
          {isUnlitPlan(scene.lightingPlan) ? (
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-300">
              <div className="text-sm font-medium text-white mb-1">No lighting rig</div>
              {scene.lightingPlan.reason || 'This scene is graphics / a title card and is not photographed.'}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {getLights(scene.lightingPlan).map((light) => (
                  <div key={light.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 break-inside-avoid">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className={`text-sm font-semibold ${LIGHT_TEXT[light.color]}`}>{LIGHT_TITLE[light.role] || light.title || light.label}</div>
                      <span className="text-xs font-mono text-slate-400">{light.short}</span>
                    </div>
                    <div className="text-sm text-white">{light.name}</div>
                    {light.data.modifier && <div className="text-xs text-slate-400">{light.data.modifier}</div>}
                    <dl className="mt-3 space-y-1.5 text-xs">
                      {light.data.motivation && <div className="flex gap-2"><dt className="text-slate-500 w-20 shrink-0">Motivated by</dt><dd className="text-slate-200">{light.data.motivation}</dd></div>}
                      <div className="flex gap-2"><dt className="text-slate-500 w-20 shrink-0">Direction</dt><dd className="text-slate-200">{describeDirection(light)}{light.elevationDeg < 75 ? `, ${Math.round(light.elevationDeg)}° up` : ''}{light.distanceM ? `, ${light.distanceM} m` : ''}</dd></div>
                      {light.data.position && <div className="flex gap-2"><dt className="text-slate-500 w-20 shrink-0">Placement</dt><dd className="text-slate-200 line-clamp-4" title={light.data.position}>{light.data.position}</dd></div>}
                      {light.colorShort && <div className="flex gap-2"><dt className="text-slate-500 w-20 shrink-0">Color</dt><dd className="text-slate-200">{light.colorShort}</dd></div>}
                    </dl>
                    {light.intensity != null && (
                      <div className="mt-3 bg-slate-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${LIGHT_BAR[light.color]}`} style={{ width: `${light.intensity}%` }} />
                      </div>
                    )}
                    {(light.data.notes || (light.data.color && light.data.color.length > 40)) && (
                      <details open={printMode} className="mt-2 text-xs text-slate-400">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Rigging notes</summary>
                        {light.data.notes && <p className="mt-1 leading-5">{light.data.notes}</p>}
                        {light.data.color && light.data.color.length > 40 && <p className="mt-1 leading-5">Color: {light.data.color}</p>}
                      </details>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">Lighting Ratio</span>
                  <span className="text-sm text-cinema-400 font-mono">
                    {ratioShort(scene.lightingPlan.ratio)}
                    {scene.lightingPlan.cameraWhiteBalanceK ? <span className="text-slate-500"> · camera WB {scene.lightingPlan.cameraWhiteBalanceK}K</span> : null}
                  </span>
                </div>
                {(scene.lightingPlan.ratioNote || (scene.lightingPlan.ratio || '').length > 12) && (
                  <p className="text-xs text-slate-400 leading-5">{scene.lightingPlan.ratioNote || scene.lightingPlan.ratio}</p>
                )}
                {getPracticals(scene.lightingPlan).length > 0 && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1.5">Practicals (in frame)</div>
                    <div className="space-y-1.5">
                      {getPracticals(scene.lightingPlan).map((p) => (
                        <div key={p.id} className="text-xs flex gap-2">
                          <span className="font-semibold text-amber-300 shrink-0 w-6">{p.id}</span>
                          <span className="text-slate-200">
                            {p.name}
                            <span className="text-slate-500">{[p.colorTempK ? ` · ${p.colorTempK}K` : '', p.dimmerPct != null ? ` · dimmed to ${p.dimmerPct}%` : ''].join('')}</span>
                            {p.note && p.note !== p.name && <span className="block text-slate-500 leading-5">{p.note}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {scene.lightingPlan.notes && (
                  <details open={printMode} className="text-xs text-slate-400">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Gaffer notes</summary>
                    <p className="mt-1 leading-5">{scene.lightingPlan.notes}</p>
                  </details>
                )}
              </div>
            </>
          )}

          <LightingFloorPlan lightingPlan={scene.lightingPlan} shots={scene.shots || []} readOnly={printMode} />
        </div>
      )}

      {/* Camera & Lens */}
      {activeTab === 'camera' && (
        <div className="animate-fadeIn space-y-3">
          {(scene.shots || []).map((shot, i) => (
            <div key={shot._id || shot.id || i} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 break-inside-avoid">
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

          <SceneBlockingFloorPlan blocking={scene.blocking} />

          {/* Depth Cues */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="text-sm font-medium text-white mb-3">Real-World Composition Notes</div>
            <div className="flex gap-3">
              {[
                'Leave room for actor movement past furniture or door frames',
                'Keep at least one editorial cutaway when blocking becomes messy',
                'Protect eyelines before reaching for more camera movement',
                'Use practicals to motivate shape, not just as background decoration'
              ].map((cue) => (
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
            <div key={shot._id || shot.id || i} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center gap-4 break-inside-avoid">
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
