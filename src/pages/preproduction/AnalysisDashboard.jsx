import { useMemo, useState, useEffect } from 'react'
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

export default function AnalysisDashboard() {
  const navigate = useNavigate()
  const { currentProject, analysisData, loading, error, runAnalysis, refreshAnalysis, selectedCamera } = useProject()
  const [activeView, setActiveView] = useState('scenes')
  const [objectives, setObjectives] = useState({ mood: 'Contemplative', style: 'Naturalistic' })
  const [constraints, setConstraints] = useState({ budget: 'Medium', time: 'Standard' })

  useEffect(() => {
    if (currentProject?._id && !analysisData) refreshAnalysis()
  }, [currentProject?._id, analysisData, refreshAnalysis])

  const handleRunAnalysis = async () => {
    if (!currentProject?._id) return
    try {
      await runAnalysis(currentProject._id)
    } catch { /* error handled in context */ }
  }

  const scenes = analysisData?.scenes || []
  const allLocations = useMemo(() => [...new Set(scenes.flatMap((scene) => scene.locations || []))], [scenes])
  const allProps = useMemo(() => [...new Set(scenes.flatMap((scene) => scene.props || []))], [scenes])
  const clarityStats = useMemo(() => {
    const characters = analysisData?.characterArcs || []
    return {
      scenes: scenes.length,
      characters: characters.length,
      locations: allLocations.length,
      props: allProps.length,
    }
  }, [allLocations.length, allProps.length, analysisData?.characterArcs, scenes.length])

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
    <div className="animate-fadeIn">
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
          <button
            onClick={handleRunAnalysis}
            disabled={loading || !currentProject?._id}
            className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analyzing...' : 'Run Full Analysis'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
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
              <span className="text-xs text-slate-500">Mood</span>
              <select value={objectives.mood} onChange={(event) => setObjectives({ ...objectives, mood: event.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                <option>Contemplative</option><option>Tense</option><option>Joyful</option><option>Melancholy</option><option>Mysterious</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-slate-500">Style</span>
              <select value={objectives.style} onChange={(event) => setObjectives({ ...objectives, style: event.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                <option>Naturalistic</option><option>Stylized</option><option>Documentary</option><option>Expressionist</option><option>Classical</option>
              </select>
            </label>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Production Constraints</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs text-slate-500">Budget</span>
              <select value={constraints.budget} onChange={(event) => setConstraints({ ...constraints, budget: event.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                <option>Low</option><option>Medium</option><option>High</option><option>Unlimited</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-slate-500">Timeline</span>
              <select value={constraints.time} onChange={(event) => setConstraints({ ...constraints, time: event.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-white">
                <option>Tight</option><option>Standard</option><option>Relaxed</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {analysisData && (
        <>
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

          <div className="animate-fadeIn">
            {activeView === 'scenes' && (
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <div key={scene.number} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition">
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

          {analysisData.ambiguities?.length > 0 && (
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

          <div className="mt-6 flex justify-end">
            <button onClick={() => navigate('/pre-production/outputs')} className="flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition">
              View Generated Outputs
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
