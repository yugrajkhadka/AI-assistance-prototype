import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, BarChart3, Users, MapPin, Package, Palette, Target, Clock,
  DollarSign, AlertTriangle, Loader2, ChevronRight, Sparkles, Camera
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'

const viewTabs = [
  { id: 'scenes', label: 'Scenes', icon: Play },
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'props', label: 'Props', icon: Package },
  { id: 'themes', label: 'Themes', icon: Palette },
]

const DEFAULT_MOODS = ['Contemplative', 'Tense', 'Joyful', 'Melancholy', 'Mysterious']
const DEFAULT_STYLES = ['Naturalistic', 'Stylized', 'Documentary', 'Expressionist', 'Classical']

// AI suggestions first, then the standard presets, without duplicates; the current
// value is always present so a select never shows a blank.
function mergeOptions(suggested = [], defaults = [], current = '') {
  const seen = new Set()
  return [current, ...suggested, ...defaults].filter((option) => {
    const key = String(option || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function AiPick({ show }) {
  if (!show) return null
  return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-cinema-500/15 text-cinema-300 align-middle">AI pick</span>
}

const VIEW_TITLES = { scenes: 'Scenes', characters: 'Characters', locations: 'Locations', props: 'Props', themes: 'Themes' }

// printMode renders read-only for the PDF report: data from props, no controls.
// `summary` shows the header/targets/stats block; `view` picks the tab content.
export default function AnalysisDashboard({ printMode = false, project, analysis, view = 'scenes', summary = true } = {}) {
  const navigate = useNavigate()
  const ctx = useProject()
  const { loading, error, runAnalysis, refreshAnalysis, selectedCamera } = ctx
  const currentProject = printMode ? project : ctx.currentProject
  const analysisData = printMode ? analysis : ctx.analysisData
  const [activeViewState, setActiveView] = useState('scenes')
  const activeView = printMode ? view : activeViewState
  useEffect(() => {
    if (!printMode && currentProject?._id && !analysisData) refreshAnalysis()
  }, [printMode, currentProject?._id, analysisData, refreshAnalysis])

  // Controls show the operator's choice if they made one, otherwise what the
  // analysis recommended for this script. A new analysis clears manual choices.
  const targets = analysisData?.creativeTargets
  const production = analysisData?.productionConstraints
  const analysisKey = analysisData?._id || analysisData?.updatedAt || ''
  const [choices, setChoices] = useState({ key: '', values: {} })
  const picked = choices.key === analysisKey ? choices.values : {}
  const choose = (field, value) => setChoices({ key: analysisKey, values: { ...picked, [field]: value } })
  const objectives = {
    mood: picked.mood || targets?.mood || 'Contemplative',
    style: picked.style || targets?.style || 'Naturalistic',
  }
  const constraints = {
    budget: picked.budget || production?.budget || 'Medium',
    time: picked.time || production?.timeline || 'Standard',
  }

  const moodOptions = mergeOptions(targets?.moodOptions, DEFAULT_MOODS, objectives.mood)
  const styleOptions = mergeOptions(targets?.styleOptions, DEFAULT_STYLES, objectives.style)

  const handleRunAnalysis = async () => {
    if (!currentProject?._id) return
    try {
      await runAnalysis(currentProject._id)
    } catch { /* error handled in context */ }
  }

  // Cheap derived values; the React compiler memoizes this component itself.
  const scenes = analysisData?.scenes || []
  const allLocations = [...new Set(scenes.flatMap((scene) => scene.locations || []))]
  const allProps = [...new Set(scenes.flatMap((scene) => scene.props || []))]
  const clarityStats = {
    scenes: scenes.length,
    characters: (analysisData?.characterArcs || []).length,
    locations: allLocations.length,
    props: allProps.length,
  }

  if (!currentProject?._id) {
    return (
      <div className="animate-fadeIn text-center py-16">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <div className="text-lg text-white mb-2">No script uploaded</div>
        <p className="text-sm text-slate-400 mb-4">Upload a screenplay first to run AI analysis.</p>
        <button onClick={() => navigate('/pre-production/upload')} className="px-4 py-2 bg-cinema-500 text-white rounded-lg text-sm">
          Go to Script Upload
        </button>
      </div>
    )
  }

  return (
    <div className={printMode ? '' : 'animate-fadeIn'}>
      {summary && (<>
      <div className="flex flex-col gap-4 mb-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">AI Analysis Dashboard</h1>
          <p className="text-slate-400 text-sm">
            {currentProject ? `Analyzing: ${currentProject.name}` : 'Deep analysis of your screenplay for cinematography planning'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {selectedCamera && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/50 text-xs text-slate-300">
              <Camera className="w-3.5 h-3.5 text-cinema-400" />
              {selectedCamera.brand} {selectedCamera.model}
            </div>
          )}
          {!printMode && <button
            onClick={handleRunAnalysis}
            disabled={loading || !currentProject?._id}
            className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analyzing...' : 'Run Full Analysis'}
          </button>}
        </div>
      </div>

      {!printMode && error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {!printMode && loading && (
        <div className="mb-6 p-4 rounded-xl border border-cinema-500/30 bg-cinema-500/5 animate-fadeIn">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-cinema-400 animate-spin" />
            <span className="text-sm font-medium text-white">Running AI analysis...</span>
          </div>
          <p className="text-xs text-slate-400">The dashboard updates as scenes, coverage ideas, and project metadata are prepared.</p>
        </div>
      )}

      <div className="grid gap-4 mb-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Creative Targets</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs text-slate-500">Mood<AiPick show={targets?.mood && objectives.mood === targets.mood} /></span>
              <select value={objectives.mood} onChange={(event) => choose('mood', event.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                {moodOptions.map((option) => <option key={option} value={option}>{option === targets?.mood ? `${option} (recommended)` : option}</option>)}
              </select>
            </label>
            <label>
              <span className="text-xs text-slate-500">Style<AiPick show={targets?.style && objectives.style === targets.style} /></span>
              <select value={objectives.style} onChange={(event) => choose('style', event.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                {styleOptions.map((option) => <option key={option} value={option}>{option === targets?.style ? `${option} (recommended)` : option}</option>)}
              </select>
            </label>
          </div>
          {targets?.rationale ? (
            <p className="text-xs text-slate-400 leading-5 mt-3"><Sparkles className="w-3 h-3 inline mr-1 text-cinema-400" />{targets.rationale}</p>
          ) : !analysisData && (
            <p className="text-xs text-slate-500 mt-3">Run the analysis and these are chosen from your script.</p>
          )}
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Production Constraints</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs text-slate-500">Budget<AiPick show={production?.budget && constraints.budget === production.budget} /></span>
              <select value={constraints.budget} onChange={(event) => choose('budget', event.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                {['Low', 'Medium', 'High', 'Unlimited'].map((option) => <option key={option} value={option}>{option === production?.budget ? `${option} (recommended)` : option}</option>)}
              </select>
            </label>
            <label>
              <span className="text-xs text-slate-500">Timeline<AiPick show={production?.timeline && constraints.time === production.timeline} /></span>
              <select value={constraints.time} onChange={(event) => choose('time', event.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                {['Tight', 'Standard', 'Relaxed'].map((option) => <option key={option} value={option}>{option === production?.timeline ? `${option} (recommended)` : option}</option>)}
              </select>
            </label>
          </div>
          {production && (
            <div className="mt-3 space-y-2">
              {production.estimatedShootDays > 0 && (
                <div className="text-xs text-slate-300 flex items-center gap-1.5"><Clock className="w-3 h-3 text-amber-400" /> ~{production.estimatedShootDays} shoot day{production.estimatedShootDays === 1 ? '' : 's'} estimated</div>
              )}
              {(production.drivers || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {production.drivers.map((driver) => (
                    <span key={driver} className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">{driver}</span>
                  ))}
                </div>
              )}
              {production.rationale && <p className="text-xs text-slate-400 leading-5">{production.rationale}</p>}
            </div>
          )}
        </div>
      </div>
      </>)}

      {analysisData && (
        <>
          {summary && (
          <div className="grid gap-3 mb-6 grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Confidence', value: `${analysisData.confidenceScore || 0}%`, sub: 'analysis confidence', color: 'text-onset-400' },
              { label: 'Scenes', value: clarityStats.scenes, sub: 'dramatic units found', color: 'text-cinema-400' },
              { label: 'Characters', value: clarityStats.characters, sub: 'named arcs tracked', color: 'text-amber-400' },
              { label: 'Locations', value: clarityStats.locations, sub: 'practical spaces identified', color: 'text-white' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-400 mt-1">{label}</div>
                <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
              </div>
            ))}
          </div>
          )}

          {printMode ? (
            activeView && (
              <div className="report-heading flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                {(() => { const Icon = viewTabs.find((t) => t.id === activeView)?.icon; return Icon ? <Icon className="w-4 h-4 text-cinema-400" /> : null })()}
                <span className="text-lg font-semibold text-white">{VIEW_TITLES[activeView]}</span>
              </div>
            )
          ) : (
          <div className="flex gap-1 mb-4 border-b border-slate-800 overflow-x-auto">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                  activeView === tab.id ? 'text-cinema-400 border-cinema-400' : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
          )}

          <div className={printMode ? '' : 'animate-fadeIn'}>
            {activeView === 'scenes' && (
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <div key={scene.number} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition break-inside-avoid">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-mono text-cinema-400 bg-cinema-500/10 px-2 py-0.5 rounded">SC {scene.number}</span>
                          <span className="text-base font-semibold text-white">{scene.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">{scene.mood}</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-6">{scene.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 min-w-[12rem]">
                        <div className="p-2 rounded-lg bg-slate-800/60">
                          <div className="text-slate-500">Coverage</div>
                          <div className="text-white mt-1">{scene.shots?.length || 0} shots</div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-800/60">
                          <div className="text-slate-500">Runtime</div>
                          <div className="text-white mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {scene.duration}</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 mt-4 md:grid-cols-2">
                      <div className="p-3 rounded-lg bg-slate-800/40">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Characters</div>
                        <div className="flex flex-wrap gap-2">
                          {(scene.characters || []).length > 0
                            ? scene.characters.map((character) => <span key={character} className="text-xs px-2 py-1 rounded bg-cinema-500/10 text-cinema-300">{character}</span>)
                            : <span className="text-xs text-slate-500">No clear character extraction</span>}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-800/40">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Locations</div>
                        <div className="flex flex-wrap gap-2">
                          {(scene.locations || []).length > 0
                            ? scene.locations.map((location) => <span key={location} className="text-xs px-2 py-1 rounded bg-onset-500/10 text-onset-300">{location}</span>)
                            : <span className="text-xs text-slate-500">No clear location extraction</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'characters' && (
              <div className="grid gap-3 lg:grid-cols-2">
                {(analysisData.characterArcs || []).map((character) => (
                  <div key={character.name} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-white">{character.name}</div>
                        <div className="text-xs text-slate-400 mt-1">{character.archetype}</div>
                      </div>
                      <div className="text-xs text-cinema-300">{character.screenTime}</div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-slate-800 rounded-full h-2">
                        <div className="bg-cinema-500 h-2 rounded-full" style={{ width: character.screenTime }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'locations' && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {allLocations.map((location) => (
                  <div key={location} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-onset-400 flex-shrink-0" />
                      <span className="text-sm text-white">{location}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'props' && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {allProps.map((prop) => (
                  <div key={prop} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center gap-3">
                    <Package className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-slate-200">{prop}</span>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'themes' && (
              <div className="grid gap-3 lg:grid-cols-2">
                {(analysisData.themes || []).map((theme) => (
                  <div key={theme} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                    <div className="flex items-center gap-3">
                      <Palette className="w-4 h-4 text-cinema-400" />
                      <span className="text-sm font-medium text-white">{theme}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {summary && analysisData.ambiguities?.length > 0 && (
            <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">Flagged Ambiguities</span>
              </div>
              <div className="space-y-2">
                {analysisData.ambiguities.map((ambiguity, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-xs font-mono text-amber-400/60 mt-0.5">SC {ambiguity.scene}</span>
                    <span className="text-slate-300">{ambiguity.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!printMode && <div className="mt-6 flex justify-end">
            <button onClick={() => navigate('/pre-production/outputs')} className="flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition">
              View Generated Outputs
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>}
        </>
      )}
    </div>
  )
}
