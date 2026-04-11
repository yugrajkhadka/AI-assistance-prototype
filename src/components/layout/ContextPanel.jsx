import { useState } from 'react'
import { X, Sparkles, Lightbulb, AlertTriangle } from 'lucide-react'

const suggestions = [
  { id: 1, type: 'tip', icon: Lightbulb, text: 'Scene 1 lighting is naturalistic — consider adding a subtle hair light for separation in the CU.' },
  { id: 2, type: 'insight', icon: Sparkles, text: 'Scenes 1 and 3 share a melancholy mood. Matching color temperature (5200-5600K) will maintain emotional continuity.' },
  { id: 3, type: 'warning', icon: AlertTriangle, text: 'Scene 3 HMI augment may exceed budget. Reflector + bounce alternative suggested.' },
  { id: 4, type: 'tip', icon: Lightbulb, text: 'The 85mm on Scene 1 Shot 2 gives shallow DOF. Ensure focus puller is briefed on the push-in.' },
]

export default function ContextPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('suggestions')

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/95 flex flex-col animate-slideIn flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cinema-400" />
          <span className="font-medium text-sm text-white">AI Context</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-slate-800">
        {['suggestions', 'properties'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium uppercase tracking-wide transition ${activeTab === tab ? 'text-cinema-400 border-b-2 border-cinema-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'suggestions' ? (
          suggestions.map((s) => (
            <div
              key={s.id}
              className={`p-3 rounded-lg border text-sm ${
                s.type === 'warning'
                  ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                  : s.type === 'insight'
                  ? 'bg-cinema-500/5 border-cinema-500/20 text-cinema-200'
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-300'
              }`}
            >
              <div className="flex items-start gap-2">
                <s.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{s.text}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current View</div>
              <div className="text-sm text-white">Pre-Production</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Active Scene</div>
              <div className="text-sm text-white">Scene 1 — INT. APARTMENT</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Shot Count</div>
              <div className="text-sm text-white">187 total (42 scenes)</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Approval Status</div>
              <div className="flex gap-2 mt-1">
                <span className="px-2 py-0.5 rounded text-xs bg-onset-500/20 text-onset-400">Approved: 134</span>
                <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">Pending: 41</span>
                <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Revision: 12</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
