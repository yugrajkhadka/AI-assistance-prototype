import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, BarChart3, Users, MapPin, Package, Palette, Target, Clock,
  DollarSign, AlertTriangle, CheckCircle2, Loader2, ChevronRight, Sparkles
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
  const { currentProject, analysisData, loading, error, runAnalysis, refreshAnalysis } = useProject()
  const [activeView, setActiveView] = useState('scenes')
  const [objectives, setObjectives] = useState({ mood: 'Contemplative', style: 'Naturalistic' })
  const [constraints, setConstraints] = useState({ budget: 'Medium', time: 'Standard' })

  useEffect(() => {
    if (currentProject?._id && !analysisData) refreshAnalysis()
  }, [currentProject?._id])

  const handleRunAnalysis = async () => {
    if (!currentProject?._id) return
    try {
      await runAnalysis(currentProject._id)
    } catch { /* error is set in context */ }
  }

  const scenes = analysisData?.scenes || []
  const allLocations = [...new Set(scenes.flatMap(s => s.locations || []))]
  const allProps = [...new Set(scenes.flatMap(s => s.props || []))]

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">AI Analysis Dashboard</h1>
          <p className="text-slate-400 text-sm">
            {currentProject ? `Analyzing: ${currentProject.name}` : 'Deep analysis of your screenplay for cinematography planning'}
          </p>
        </div>
        <div className="flex gap-2">
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

      {!currentProject?._id && (
        <div className="text-center py-16">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <div className="text-lg text-white mb-2">No script uploaded</div>
          <p className="text-sm text-slate-400 mb-4">Upload a screenplay first to run AI analysis.</p>
          <button onClick={() => navigate('/pre-production/upload')} className="px-4 py-2 bg-cinema-500 text-white rounded-lg text-sm">
            Go to Script Upload
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Analysis Progress */}
      {loading && (
        <div className="mb-6 p-4 rounded-xl border border-cinema-500/30 bg-cinema-500/5 animate-fadeIn">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-cinema-400 animate-spin" />
            <span className="text-sm font-medium text-white">Running AI analysis with Claude...</span>
          </div>
          <p className="text-xs text-slate-400">This may take 30-60 seconds for full script analysis with shot generation.</p>
          <div className="space-y-2 mt-3">
            {['Script parsing', 'Character extraction', 'Scene breakdown', 'Shot list generation', 'Lighting & storyboard'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-cinema-400 animate-spin" />
                <span className="text-xs text-slate-300">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Objectives & Constraints */}
      {currentProject?._id && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Objectives</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-500">Mood</label>
                <select value={objectives.mood} onChange={(e) => setObjectives({ ...objectives, mood: e.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>Contemplative</option><option>Tense</option><option>Joyful</option><option>Melancholy</option><option>Mysterious</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Style</label>
                <select value={objectives.style} onChange={(e) => setObjectives({ ...objectives, style: e.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>Naturalistic</option><option>Stylized</option><option>Documentary</option><option>Expressionist</option><option>Classical</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Constraints</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-slate-500">Budget</label>
                <select value={constraints.budget} onChange={(e) => setConstraints({ ...constraints, budget: e.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>Low</option><option>Medium</option><option>High</option><option>Unlimited</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Timeline</label>
                <select value={constraints.time} onChange={(e) => setConstraints({ ...constraints, time: e.target.value })} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>Tight</option><option>Standard</option><option>Relaxed</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {analysisData && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Confidence', value: `${analysisData.confidenceScore || 0}%`, color: 'text-onset-400' },
              { label: 'Scenes', value: analysisData.sceneBreakdown?.total || scenes.length, color: 'text-cinema-400' },
              { label: 'Flagged', value: analysisData.sceneBreakdown?.flagged || 0, color: 'text-amber-400' },
              { label: 'Style', value: (analysisData.suggestedStyle || 'N/A').split(' ')[0], color: 'text-white' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-1 mb-4 border-b border-slate-800">
            {viewTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveView(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 ${activeView === tab.id ? 'text-cinema-400 border-cinema-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                <tab.icon className="w-4 h-4" />{tab.label}
              </button>
            ))}
          </div>

          <div className="animate-fadeIn">
            {activeView === 'scenes' && (
              <div className="space-y-2">
                {scenes.map((scene) => (
                  <div key={scene.number} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-cinema-400 bg-cinema-500/10 px-2 py-0.5 rounded">SC {scene.number}</span>
                        <span className="text-sm font-medium text-white">{scene.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">{scene.mood}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{scene.shots?.length || 0} shots</span>
                        <Clock className="w-3 h-3" /><span>{scene.duration}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mt-2">{scene.description}</p>
                    <div className="flex gap-2 mt-2">
                      {scene.characters?.map((c) => <span key={c} className="text-xs px-2 py-0.5 rounded bg-cinema-500/10 text-cinema-300">{c}</span>)}
                      {scene.locations?.map((l) => <span key={l} className="text-xs px-2 py-0.5 rounded bg-onset-500/10 text-onset-300">{l}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'characters' && (
              <div className="space-y-2">
                {(analysisData.characterArcs || []).map((c) => (
                  <div key={c.name} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                    <div><div className="text-sm font-medium text-white">{c.name}</div><div className="text-xs text-slate-500">{c.archetype}</div></div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-slate-800 rounded-full h-2"><div className="bg-cinema-500 h-2 rounded-full" style={{ width: c.screenTime }} /></div>
                      <span className="text-xs text-slate-400 w-10">{c.screenTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'locations' && (
              <div className="grid grid-cols-2 gap-2">
                {allLocations.map((loc) => (
                  <div key={loc} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-onset-400 flex-shrink-0" /><span className="text-sm text-white">{loc}</span>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'props' && (
              <div className="grid grid-cols-3 gap-2">
                {allProps.map((prop) => (
                  <div key={prop} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /><span className="text-sm text-slate-300">{prop}</span>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'themes' && (
              <div className="space-y-3">
                {(analysisData.themes || []).map((theme) => (
                  <div key={theme} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-3">
                    <Palette className="w-4 h-4 text-cinema-400" /><span className="text-sm font-medium text-white">{theme}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {analysisData.ambiguities?.length > 0 && (
            <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-sm font-medium text-amber-300">Flagged Ambiguities</span></div>
              <div className="space-y-2">
                {analysisData.ambiguities.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-xs font-mono text-amber-400/60 mt-0.5">SC {a.scene}</span>
                    <span className="text-slate-400">{a.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button onClick={() => navigate('/pre-production/outputs')} className="flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition">
              View Generated Outputs<ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
