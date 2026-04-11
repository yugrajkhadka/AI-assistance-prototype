import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Camera, Sun, MapPin, Move, Sliders, Lock, Unlock,
  AlertTriangle, CheckCircle2, TrendingUp, Send, Mic, MicOff,
  StickyNote, Zap, Eye, BarChart3, Users, Shield, ChevronRight,
  Image, CircleDot, Layers
} from 'lucide-react'
import { sampleScenes, sampleCameraSettings } from '../../data/sampleProject'

const guidanceModes = [
  { id: 'suggest', label: 'Suggest', desc: 'Shows recommendations, no auto-apply', color: 'text-cinema-400' },
  { id: 'assist', label: 'Assist', desc: 'Recommends and highlights priority actions', color: 'text-amber-400' },
  { id: 'lock', label: 'Lock', desc: 'Non-intrusive — locked areas stay unchanged', color: 'text-onset-400' },
]

const recommendations = [
  { id: 1, type: 'camera', icon: Camera, title: 'Switch to 85mm for tighter framing', impact: 'high', confidence: 93, desc: 'Current 50mm is showing too much background clutter. 85mm will isolate the subject.' },
  { id: 2, type: 'lighting', icon: Sun, title: 'Increase fill by 0.5 stop', impact: 'medium', confidence: 87, desc: 'Shadow side is deeper than the plan. Small fill increase maintains intended ratio.' },
  { id: 3, type: 'position', icon: MapPin, title: 'Camera 6 inches left for cleaner background', impact: 'low', confidence: 81, desc: 'Minor reposition avoids the edge of the practicals entering frame.' },
  { id: 4, type: 'movement', icon: Move, title: 'Slow push-in during dialogue', impact: 'high', confidence: 90, desc: 'Scene builds emotional intensity — subtle forward movement enhances tension.' },
]

const chatHistory = [
  { role: 'system', text: 'CineAssist AI connected. Scene 1 loaded. Ready for on-set guidance.' },
  { role: 'user', text: 'What lens should I use for the close-up of Elena?' },
  { role: 'assistant', text: 'For Shot 2 (CU of Elena\'s hand reaching for the frame), the plan calls for 85mm. Given the current camera-to-subject distance of ~4ft, this gives a comfortable working distance with nice compression and bokeh at T1.5. If you need more room, the 75mm is a solid alternative with similar rendering.' },
  { role: 'user', text: 'The window light changed — it\'s sunnier now.' },
  { role: 'assistant', text: 'I see the plan assumes overcast soft light. With direct sun:\n\n1. Add ND 0.9 (3 stops) to maintain T1.5\n2. Rig a 4x4 silk on the window to diffuse\n3. Your fill bounce will need repositioning — move 1ft closer to camera-right\n\nThis preserves the naturalistic look while compensating for the harder light. Want me to update camera settings?' },
]

const deviationAlerts = [
  { id: 1, type: 'lighting', severity: 'warning', text: 'Fill ratio drifted to 4:1 — plan specifies 3:1', fix: 'Move bounce board 8" closer' },
  { id: 2, type: 'coverage', severity: 'info', text: 'Missing reverse angle on David — 70% scene coverage', fix: 'Schedule OTS favoring David' },
]

export default function GuidancePanel() {
  const [activeMode, setActiveMode] = useState('suggest')
  const [activeTab, setActiveTab] = useState('guidance')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState(chatHistory)
  const [voiceActive, setVoiceActive] = useState(false)
  const [lockedAreas, setLockedAreas] = useState({ lighting: false, camera: false, framing: false })
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!chatInput.trim()) return
    setMessages([...messages, { role: 'user', text: chatInput }])
    const input = chatInput
    setChatInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Analyzing your request about "${input.substring(0, 40)}..." — Based on the current scene setup and plan, I recommend adjusting the approach. The AI has evaluated multiple options and suggests maintaining the planned shot with minor modifications for on-set conditions.`
      }])
    }, 1000)
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">On-Set Guidance & Assistant</h1>
          <p className="text-slate-400 text-sm">Real-time AI recommendations, scene analysis, and intelligent chat</p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 mb-5">
        {guidanceModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={`flex-1 p-3 rounded-xl border transition text-left ${
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

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 pb-px">
        {[
          { id: 'guidance', label: 'Guidance', icon: Sparkles },
          { id: 'analysis', label: 'Scene Analysis', icon: Eye },
          { id: 'chat', label: 'AI Chat', icon: Send },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              activeTab === tab.id
                ? 'text-cinema-400 border-cinema-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* GUIDANCE TAB */}
      {activeTab === 'guidance' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Lock controls */}
          <div className="flex gap-2 mb-2">
            {Object.entries(lockedAreas).map(([area, locked]) => (
              <button
                key={area}
                onClick={() => setLockedAreas(prev => ({ ...prev, [area]: !prev[area] }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
                  locked ? 'bg-onset-500/15 text-onset-400 border border-onset-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {area.charAt(0).toUpperCase() + area.slice(1)}
              </button>
            ))}
          </div>

          {/* Recommendations */}
          {recommendations.map((rec) => {
            const isLocked = lockedAreas[rec.type]
            return (
              <div key={rec.id} className={`p-4 rounded-xl border transition ${
                isLocked ? 'border-slate-800 bg-slate-900/20 opacity-50' : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    rec.impact === 'high' ? 'bg-cinema-500/20' : rec.impact === 'medium' ? 'bg-amber-500/20' : 'bg-slate-800'
                  }`}>
                    <rec.icon className={`w-4 h-4 ${rec.impact === 'high' ? 'text-cinema-400' : rec.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{rec.title}</span>
                      {isLocked && <Lock className="w-3 h-3 text-slate-600" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{rec.desc}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className="w-3 h-3" />
                        <span className={`${rec.impact === 'high' ? 'text-cinema-400' : rec.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}`}>
                          {rec.impact} impact
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <BarChart3 className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-400">{rec.confidence}% confidence</span>
                      </div>
                    </div>
                  </div>
                  {!isLocked && (
                    <button className="px-3 py-1.5 bg-cinema-500/15 hover:bg-cinema-500/25 text-cinema-400 rounded-lg text-xs font-medium transition">
                      Apply
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SCENE ANALYSIS TAB */}
      {activeTab === 'analysis' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Detection Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cinema-400" />
                <span className="text-sm font-medium text-white">Actor Detection</span>
              </div>
              <div className="space-y-1">
                {sampleScenes[0].characters.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-onset-400" />
                    <span className="text-xs text-slate-300">{c} — in frame</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-white">Prop Check</span>
              </div>
              <div className="space-y-1">
                {sampleScenes[0].props.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-onset-400" />
                    <span className="text-xs text-slate-300">{p}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-onset-400" />
                <span className="text-sm font-medium text-white">Continuity</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-onset-400" />
                  <span className="text-xs text-slate-300">Wardrobe consistent</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-onset-400" />
                  <span className="text-xs text-slate-300">Hair/makeup match</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-300">Prop position shifted</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coverage Heatmap */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cinema-400" />
                <span className="text-sm font-medium text-white">Coverage Heatmap</span>
              </div>
              <span className="text-xs text-slate-500">Scene 1 — 75% covered</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {sampleScenes[0].shots.map((s, i) => (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg text-center ${
                    s.status === 'approved' ? 'bg-onset-500/20 border border-onset-500/20' :
                    s.status === 'pending' ? 'bg-amber-500/10 border border-amber-500/20' :
                    'bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className="text-xs font-mono text-white">Shot {i + 1}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{s.type}</div>
                  <div className={`text-[10px] mt-1 ${s.status === 'approved' ? 'text-onset-400' : s.status === 'pending' ? 'text-amber-400' : 'text-red-400'}`}>
                    {s.status === 'approved' ? 'Captured' : s.status === 'pending' ? 'Pending' : 'Needs redo'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deviation Alerts */}
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
                      <button className="text-xs text-cinema-400 hover:text-cinema-300 transition">{alert.fix}</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CHAT TAB */}
      {activeTab === 'chat' && (
        <div className="animate-fadeIn flex flex-col" style={{ height: 'calc(100vh - 16rem)' }}>
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
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
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {[
              { label: 'Apply recommended settings', icon: Sliders },
              { label: 'Generate alt shot', icon: Image },
              { label: 'Log note', icon: StickyNote },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => setChatInput(action.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 text-slate-400 text-xs hover:text-white hover:bg-slate-800 transition"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="flex gap-2">
            <button
              onClick={() => setVoiceActive(!voiceActive)}
              className={`p-2.5 rounded-lg transition ${voiceActive ? 'bg-red-500/20 text-red-400 animate-pulse-glow' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              title="Voice command"
            >
              {voiceActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask CineAssist AI anything..."
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
            />
            <button
              onClick={sendMessage}
              disabled={!chatInput.trim()}
              className="px-4 py-2.5 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-40 text-white rounded-lg transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
