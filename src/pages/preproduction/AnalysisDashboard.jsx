import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, BarChart3, Users, MapPin, Package, Palette, Target, Clock,
  DollarSign, AlertTriangle, CheckCircle2, Loader2, ChevronRight, Sparkles
} from 'lucide-react'
import { sampleScenes, sampleAnalysis } from '../../data/sampleProject'

const viewTabs = [
  { id: 'scenes', label: 'Scenes', icon: Play },
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'props', label: 'Props', icon: Package },
  { id: 'themes', label: 'Themes', icon: Palette },
]

export default function AnalysisDashboard() {
  const navigate = useNavigate()
  const [activeView, setActiveView] = useState('scenes')
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(true)
  const [objectives, setObjectives] = useState({ mood: 'Contemplative', style: 'Naturalistic' })
  const [constraints, setConstraints] = useState({ budget: 'Medium', time: 'Standard' })

  const runAnalysis = () => {
    setAnalysisRunning(true)
    setAnalysisComplete(false)
    setTimeout(() => {
      setAnalysisRunning(false)
      setAnalysisComplete(true)
    }, 3000)
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">AI Analysis Dashboard</h1>
          <p className="text-slate-400 text-sm">Deep analysis of your screenplay for cinematography planning</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runAnalysis}
            disabled={analysisRunning}
            className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {analysisRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analysisRunning ? 'Analyzing...' : 'Run Full Analysis'}
          </button>
        </div>
      </div>

      {/* Analysis Progress */}
      {analysisRunning && (
        <div className="mb-6 p-4 rounded-xl border border-cinema-500/30 bg-cinema-500/5 animate-fadeIn">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-cinema-400 animate-spin" />
            <span className="text-sm font-medium text-white">Running full analysis...</span>
          </div>
          <div className="space-y-2">
            {['Scene parsing', 'Character extraction', 'Location mapping', 'Theme analysis', 'Shot generation'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                {i < 3 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-onset-400" />
                ) : i === 3 ? (
                  <Loader2 className="w-3.5 h-3.5 text-cinema-400 animate-spin" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                )}
                <span className={`text-xs ${i <= 3 ? 'text-slate-300' : 'text-slate-600'}`}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Objectives & Constraints */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Objectives</span>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-500">Mood</label>
              <select
                value={objectives.mood}
                onChange={(e) => setObjectives({ ...objectives, mood: e.target.value })}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
              >
                <option>Contemplative</option>
                <option>Tense</option>
                <option>Joyful</option>
                <option>Melancholy</option>
                <option>Mysterious</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Style</label>
              <select
                value={objectives.style}
                onChange={(e) => setObjectives({ ...objectives, style: e.target.value })}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
              >
                <option>Naturalistic</option>
                <option>Stylized</option>
                <option>Documentary</option>
                <option>Expressionist</option>
                <option>Classical</option>
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
              <select
                value={constraints.budget}
                onChange={(e) => setConstraints({ ...constraints, budget: e.target.value })}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Unlimited</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Timeline</label>
              <select
                value={constraints.time}
                onChange={(e) => setConstraints({ ...constraints, time: e.target.value })}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
              >
                <option>Tight</option>
                <option>Standard</option>
                <option>Relaxed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Confidence & Summary */}
      {analysisComplete && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Confidence', value: `${sampleAnalysis.confidenceScore}%`, color: 'text-onset-400' },
              { label: 'Scenes', value: sampleAnalysis.sceneBreakdown.total, color: 'text-cinema-400' },
              { label: 'Flagged', value: sampleAnalysis.sceneBreakdown.flagged, color: 'text-amber-400' },
              { label: 'Style', value: sampleAnalysis.suggestedStyle.split(' ')[0], color: 'text-white' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* View Tabs */}
          <div className="flex gap-1 mb-4 border-b border-slate-800">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
                  activeView === tab.id
                    ? 'text-cinema-400 border-cinema-400'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="animate-fadeIn">
            {activeView === 'scenes' && (
              <div className="space-y-2">
                {sampleScenes.map((scene) => (
                  <div key={scene.id} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-cinema-400 bg-cinema-500/10 px-2 py-0.5 rounded">SC {scene.number}</span>
                        <span className="text-sm font-medium text-white">{scene.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">{scene.mood}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{scene.shots.length} shots</span>
                        <Clock className="w-3 h-3" />
                        <span>{scene.duration}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mt-2">{scene.description}</p>
                    <div className="flex gap-2 mt-2">
                      {scene.characters.map((c) => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded bg-cinema-500/10 text-cinema-300">{c}</span>
                      ))}
                      {scene.locations.map((l) => (
                        <span key={l} className="text-xs px-2 py-0.5 rounded bg-onset-500/10 text-onset-300">{l}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'characters' && (
              <div className="space-y-2">
                {sampleAnalysis.characterArcs.map((c) => (
                  <div key={c.name} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.archetype}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-slate-800 rounded-full h-2">
                        <div className="bg-cinema-500 h-2 rounded-full" style={{ width: c.screenTime }} />
                      </div>
                      <span className="text-xs text-slate-400 w-10">{c.screenTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'locations' && (
              <div className="grid grid-cols-2 gap-2">
                {['Elena\'s Apartment', 'Downtown Street', 'Corner Coffee Shop', 'Rooftop Garden', 'Art Gallery', 'Train Station'].map((loc) => (
                  <div key={loc} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-onset-400 flex-shrink-0" />
                    <span className="text-sm text-white">{loc}</span>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'props' && (
              <div className="grid grid-cols-3 gap-2">
                {['Photo frame', 'Alarm clock', 'Coffee cup', 'Headphones', 'Newspaper', 'Phone', 'Rain-streaked window', 'Neon sign'].map((prop) => (
                  <div key={prop} className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-slate-300">{prop}</span>
                  </div>
                ))}
              </div>
            )}

            {activeView === 'themes' && (
              <div className="space-y-3">
                {sampleAnalysis.themes.map((theme) => (
                  <div key={theme} className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center gap-3">
                    <Palette className="w-4 h-4 text-cinema-400" />
                    <span className="text-sm font-medium text-white">{theme}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ambiguities */}
          {sampleAnalysis.ambiguities.length > 0 && (
            <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">Flagged Ambiguities</span>
              </div>
              <div className="space-y-2">
                {sampleAnalysis.ambiguities.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-xs font-mono text-amber-400/60 mt-0.5">SC {a.scene}</span>
                    <span className="text-slate-400">{a.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => navigate('/pre-production/outputs')}
              className="flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition"
            >
              View Generated Outputs
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
