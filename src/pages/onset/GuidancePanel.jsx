import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, Camera, Sun, MapPin, Move, Lock, Unlock,
  AlertTriangle, CheckCircle2, TrendingUp, Send, Mic, MicOff,
  Zap, Eye, BarChart3, Users, Shield, Layers, Loader2
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { onset as onsetApi } from '../../services/api'

const guidanceModes = [
  { id: 'suggest', label: 'Suggest', desc: 'Show options without touching the plan', color: 'text-cinema-400' },
  { id: 'assist', label: 'Assist', desc: 'Push the most production-safe adjustment first', color: 'text-amber-400' },
  { id: 'lock', label: 'Lock', desc: 'Protect locked visual decisions and guide around them', color: 'text-onset-400' },
]

function buildResponsiveRecommendations(scene, lockedAreas) {
  const lead = scene.characters?.[0] || 'the lead'
  const counterpart = scene.characters?.[1] || 'the counterpart'
  const location = scene.locations?.[0] || 'the set'

  return [
    {
      id: 1,
      type: 'camera',
      icon: Camera,
      title: `Stage a 35mm geography pass before you commit to close coverage`,
      impact: 'high',
      confidence: 91,
      desc: `In ${location}, open with a real walkable master so editorial has doorways, eyelines, and actor travel. Once ${lead} lands in the playable zone, step into the longer lens work.`,
      applyText: 'Switch plan to geography-first',
      locked: lockedAreas.camera,
    },
    {
      id: 2,
      type: 'lighting',
      icon: Sun,
      title: `Motivate the key from one practical direction and let the room fall off`,
      impact: 'medium',
      confidence: 86,
      desc: `Treat one side of the room as the believable source. That keeps ${lead} consistent across coverage and prevents the reverse on ${counterpart} from feeling like a different time of day.`,
      applyText: 'Favor motivated practical key',
      locked: lockedAreas.lighting,
    },
    {
      id: 3,
      type: 'framing',
      icon: MapPin,
      title: `Use a foreground edge to make the frame feel observed, not staged`,
      impact: 'medium',
      confidence: 83,
      desc: `A shoulder, doorway, or lamp edge in the foreground gives this scene depth and makes the audience feel like they’re discovering behavior inside a real room instead of watching isolated coverage.`,
      applyText: 'Add foreground obstruction',
      locked: lockedAreas.framing,
    },
    {
      id: 4,
      type: 'movement',
      icon: Move,
      title: `Reserve movement for the exact beat where the power changes hands`,
      impact: 'high',
      confidence: 88,
      desc: `Keep the build static or anchored, then push only when the subtext turns. That gives the move narrative purpose instead of making every line feel equally important.`,
      applyText: 'Hold static until turn',
      locked: false,
    },
  ]
}

function buildDeviationAlerts(scene) {
  const coverage = scene.shots?.length
    ? Math.round((scene.shots.filter((shot) => shot.status === 'approved').length / scene.shots.length) * 100)
    : 0

  return [
    {
      id: 'coverage',
      severity: coverage < 60 ? 'warning' : 'info',
      text: coverage < 60
        ? `Coverage is only ${coverage}% approved. You still need editorial protection before moving on.`
        : `Coverage is holding at ${coverage}% approved. Keep checking inserts and reverses before striking.`,
      fix: coverage < 60 ? 'Prioritize insert and reverse coverage' : 'Verify cutaway continuity',
    },
    {
      id: 'blocking',
      severity: scene.characters?.length > 1 ? 'warning' : 'info',
      text: scene.characters?.length > 1
        ? 'Multi-character blocking means eyeline drift will show up fast if actor marks keep moving.'
        : 'Single-subject scene. Performance continuity matters more than coverage complexity.',
      fix: scene.characters?.length > 1 ? 'Tape the conversation axis and protect eye lines' : 'Protect the emotional landing in the close-up',
    },
  ]
}

function buildFallbackChatReply(question, scene, activeMode) {
  const lead = scene.characters?.[0] || 'the lead'
  const location = scene.locations?.[0] || 'the room'
  const firstShot = scene.shots?.[0]
  const opener = activeMode === 'assist'
    ? 'Work the safest production answer first:'
    : activeMode === 'lock'
      ? 'Keep the locked choices intact and solve around them:'
      : 'Best option from the current plan:'

  return `${opener}

For "${question}", stage the next pass around ${lead} in ${location}. ${firstShot
    ? `Keep the base coverage on ${firstShot.lens} and only add movement if the beat changes power.`
    : 'Start with a playable geography shot, then split into emotional coverage only after the blocking settles.'}

If you need an alt shot division, shoot it like a real company move:
1. Master for entrances, exits, and props.
2. Medium for the playable action.
3. Close reaction when the scene turns.
4. Insert or over-shoulder so editorial can bridge timing or continuity.`
}

export default function GuidancePanel() {
  const { currentProject, analysisData } = useProject()
  const [activeMode, setActiveMode] = useState('suggest')
  const [activeTab, setActiveTab] = useState('guidance')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'system', text: 'CineAssist AI connected. Ready for on-set guidance.' },
  ])
  const [voiceActive, setVoiceActive] = useState(false)
  const [lockedAreas, setLockedAreas] = useState({ lighting: false, camera: false, framing: false })
  const [selectedScene, setSelectedScene] = useState(0)
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  const scenes = analysisData?.scenes || []
  const scene = scenes[selectedScene] || { title: 'No Scene', shots: [], characters: [], props: [], locations: [] }
  const recommendations = useMemo(() => buildResponsiveRecommendations(scene, lockedAreas), [scene, lockedAreas])
  const deviationAlerts = useMemo(() => buildDeviationAlerts(scene), [scene])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput
    setMessages((current) => [...current, { role: 'user', text: userMsg }])
    setChatInput('')

    if (currentProject?._id) {
      setChatLoading(true)
      try {
        const res = await onsetApi.chat(currentProject._id, userMsg, selectedScene)
        setMessages((current) => [...current, { role: 'assistant', text: res.response || res.text || buildFallbackChatReply(userMsg, scene, activeMode) }])
      } catch {
        setMessages((current) => [...current, { role: 'assistant', text: buildFallbackChatReply(userMsg, scene, activeMode) }])
      } finally {
        setChatLoading(false)
      }
    } else {
      setMessages((current) => [...current, { role: 'assistant', text: buildFallbackChatReply(userMsg, scene, activeMode) }])
    }
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">On-Set Guidance & Assistant</h1>
          <p className="text-slate-400 text-sm">Responsive scene guidance, continuity checks, and practical on-set chat.</p>
        </div>
        {scenes.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {scenes.map((item, index) => (
              <button
                key={item._id || item.id || index}
                onClick={() => setSelectedScene(index)}
                className={`px-2 py-1 rounded text-xs transition ${
                  selectedScene === index ? 'bg-cinema-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                SC {item.number || index + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 mb-5 sm:grid-cols-3">
        {guidanceModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={`p-3 rounded-xl border transition text-left ${
              activeMode === mode.id
                ? 'border-cinema-500/40 bg-cinema-500/10'
                : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'
            }`}
          >
            <div className={`text-sm font-medium ${activeMode === mode.id ? mode.color : 'text-slate-400'}`}>
              {mode.id === 'lock' ? <Lock className="w-3.5 h-3.5 inline mr-1" /> : mode.id === 'assist' ? <Zap className="w-3.5 h-3.5 inline mr-1" /> : <Sparkles className="w-3.5 h-3.5 inline mr-1" />}
              {mode.label}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">{mode.desc}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-800 pb-px overflow-x-auto">
        {[
          { id: 'guidance', label: 'Guidance', icon: Sparkles },
          { id: 'analysis', label: 'Scene Analysis', icon: Eye },
          { id: 'chat', label: 'AI Chat', icon: Send },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === tab.id ? 'text-cinema-400 border-cinema-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'guidance' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-wrap gap-2 mb-2">
            {Object.entries(lockedAreas).map(([area, locked]) => (
              <button
                key={area}
                onClick={() => setLockedAreas((current) => ({ ...current, [area]: !current[area] }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
                  locked ? 'bg-onset-500/15 text-onset-400 border border-onset-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {area.charAt(0).toUpperCase() + area.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {recommendations.map((rec) => (
              <div key={rec.id} className={`p-4 rounded-xl border transition ${rec.locked ? 'border-slate-800 bg-slate-900/20 opacity-50' : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    rec.impact === 'high' ? 'bg-cinema-500/20' : rec.impact === 'medium' ? 'bg-amber-500/20' : 'bg-slate-800'
                  }`}>
                    <rec.icon className={`w-4 h-4 ${rec.impact === 'high' ? 'text-cinema-400' : rec.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{rec.title}</span>
                      {rec.locked && <Lock className="w-3 h-3 text-slate-600" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-5">{rec.desc}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className="w-3 h-3" />
                        <span className={`${rec.impact === 'high' ? 'text-cinema-400' : rec.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}`}>{rec.impact} impact</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <BarChart3 className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-400">{rec.confidence}% confidence</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cinema-400" />
                <span className="text-sm font-medium text-white">Players In Frame</span>
              </div>
              <div className="space-y-1">
                {(scene.characters || []).map((character) => (
                  <div key={character} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-onset-400" />
                    <span className="text-xs text-slate-300">{character}</span>
                  </div>
                ))}
                {(scene.characters || []).length === 0 && <div className="text-xs text-slate-500 italic">No character data</div>}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-white">Props & Business</span>
              </div>
              <div className="space-y-1">
                {(scene.props || []).map((prop) => (
                  <div key={prop} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-onset-400" />
                    <span className="text-xs text-slate-300">{prop}</span>
                  </div>
                ))}
                {(scene.props || []).length === 0 && <div className="text-xs text-slate-500 italic">No prop data</div>}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-onset-400" />
                <span className="text-sm font-medium text-white">Continuity Pressure</span>
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                <div>Location: {scene.locations?.[0] || 'Unknown'}</div>
                <div>Coverage count: {scene.shots?.length || 0} planned shots</div>
                <div>Mood target: {scene.mood || 'Neutral'}</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cinema-400" />
                <span className="text-sm font-medium text-white">Coverage Heatmap</span>
              </div>
              <span className="text-xs text-slate-500">
                {(scene.shots || []).length > 0
                  ? `${Math.round((scene.shots.filter((shot) => shot.status === 'approved').length / scene.shots.length) * 100)}% approved`
                  : 'No shots'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {(scene.shots || []).map((item, index) => (
                <div
                  key={item._id || item.id || index}
                  className={`p-3 rounded-lg text-center ${
                    item.status === 'approved' ? 'bg-onset-500/20 border border-onset-500/20' :
                    item.status === 'pending' ? 'bg-amber-500/10 border border-amber-500/20' :
                    'bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className="text-xs font-mono text-white">Shot {index + 1}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.type}</div>
                  <div className={`text-[10px] mt-1 ${item.status === 'approved' ? 'text-onset-400' : item.status === 'pending' ? 'text-amber-400' : 'text-red-400'}`}>
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-white">Deviation Alerts</div>
            {deviationAlerts.map((alert) => (
              <div key={alert.id} className={`p-3 rounded-lg border ${
                alert.severity === 'warning' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700 bg-slate-800/30'
              }`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alert.severity === 'warning' ? 'text-amber-400' : 'text-slate-500'}`} />
                  <div className="flex-1">
                    <div className="text-sm text-white">{alert.text}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">Quick fix:</span>
                      <span className="text-xs text-cinema-400">{alert.fix}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="animate-fadeIn min-h-[60vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-950/60">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-white">Scene Chat</div>
              <div className="text-xs text-slate-500">Ask for alt shot division, blocking fixes, lighting pivots, or continuity saves.</div>
            </div>
            <button
              onClick={() => setVoiceActive((current) => !current)}
              className={`self-start sm:self-auto flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${
                voiceActive ? 'bg-cinema-500/15 text-cinema-300 border border-cinema-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {voiceActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {voiceActive ? 'Voice off' : 'Voice on'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`w-full sm:w-auto sm:max-w-[85%] lg:max-w-[70%] p-3 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-cinema-500/20 text-white rounded-br-sm'
                    : msg.role === 'assistant'
                      ? 'bg-slate-800/60 text-slate-300 rounded-bl-sm border border-slate-700/50'
                      : 'bg-slate-900/50 text-slate-500 text-xs italic border border-slate-800'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3 h-3 text-cinema-400" />
                      <span className="text-[11px] text-cinema-400 font-medium">CineAssist AI</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap leading-6">{msg.text}</div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="w-full sm:w-auto sm:max-w-[85%] lg:max-w-[70%] p-3 rounded-xl text-sm bg-slate-800/60 text-slate-300 rounded-bl-sm border border-slate-700/50">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3 h-3 text-cinema-400" />
                    <span className="text-[11px] text-cinema-400 font-medium">CineAssist AI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-cinema-400" />
                    <span className="text-slate-400">Thinking through the production-safe answer...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder='Ask something like: "Generate alt shot division if we lose the reverse before lunch."'
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cinema-500"
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
