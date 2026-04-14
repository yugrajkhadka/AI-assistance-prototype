import { useState } from 'react'
import {
  CheckCircle2, XCircle, Clock, MessageSquare, GitCompare, UserCheck,
  GripVertical, Split, Merge, RotateCcw, Wand2, DollarSign, MapPin,
  Camera as CameraIcon, ChevronDown, ChevronRight, Send, History, Lock, ArrowRight
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { shots as shotsApi } from '../../services/api'

const statusConfig = {
  approved: { color: 'bg-onset-500/20 text-onset-400 border-onset-500/30', icon: CheckCircle2 },
  pending: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  revision: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default function ReviewApproval() {
  const { currentProject, analysisData } = useProject()
  const [activeTab, setActiveTab] = useState('review')
  const [selectedScene, setSelectedScene] = useState(0)
  const [compareMode, setCompareMode] = useState(false)
  const [annotationText, setAnnotationText] = useState('')
  const [promptText, setPromptText] = useState('')
  const [dragIdx, setDragIdx] = useState(null)

  const scenes = analysisData?.scenes || []
  const scene = scenes[selectedScene]
  const approvalLog = analysisData?.approvalLog || []
  const shotOrder = (scene?.shots || []).map((_, i) => i)

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setDragIdx(idx)
  }
  const handleDragEnd = () => setDragIdx(null)

  if (!scene) return (
    <div className="animate-fadeIn text-center py-16">
      <div className="text-lg text-white mb-2">No analysis data available</div>
      <p className="text-sm text-slate-400">Run AI analysis first to review and approve outputs.</p>
    </div>
  )

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Review & Approval</h1>
          <p className="text-slate-400 text-sm">Review outputs, manage approvals, and refine cinematography plans</p>
        </div>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 pb-px">
        {[
          { id: 'review', label: 'Review & Approve', icon: UserCheck },
          { id: 'modify', label: 'Modification Tools', icon: Wand2 },
          { id: 'log', label: 'Change Log', icon: History },
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

      {/* Scene Selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {scenes.map((s, i) => (
          <button
            key={s.number || i}
            onClick={() => setSelectedScene(i)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              selectedScene === i ? 'bg-cinema-500 text-white font-medium' : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            SC {s.number}
          </button>
        ))}
      </div>

      {/* REVIEW TAB */}
      {activeTab === 'review' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Compare toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800">
            <span className="text-sm text-slate-400">Version comparison mode</span>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                compareMode ? 'bg-cinema-500/20 text-cinema-400 border border-cinema-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {compareMode ? 'Comparing v2.3 ↔ v2.4' : 'Compare Versions'}
            </button>
          </div>

          {/* Shots for review */}
          {(scene.shots || []).map((shot, i) => {
            const cfg = statusConfig[shot.status] || statusConfig.pending
            const StatusIcon = cfg.icon
            return (
              <div key={shot._id || shot.id || i} className={`rounded-xl border ${cfg.color.split(' ')[0].replace('bg-', 'border-').replace('/20', '/30')} bg-slate-900/40 overflow-hidden`}>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <StatusIcon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
                    <span className="text-xs font-mono text-cinema-400">Shot {i + 1}</span>
                    <span className="text-sm font-medium text-white flex-1">{shot.description}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${cfg.color}`}>{shot.status}</span>
                  </div>

                  {compareMode && (
                    <div className="grid grid-cols-2 gap-3 mt-3 p-3 rounded-lg bg-slate-800/30">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">v2.3 (Previous)</div>
                        <div className="text-xs text-slate-400">Lens: {shot.lens === '85mm' ? '100mm' : shot.lens}</div>
                        <div className="text-xs text-slate-400">Movement: Static</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-cinema-400 uppercase mb-1">v2.4 (Current)</div>
                        <div className="text-xs text-white">Lens: {shot.lens}</div>
                        <div className="text-xs text-white">Movement: {shot.movement}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-500">Assignee:</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">Marcus Rivera (DP)</span>
                  </div>

                  {/* Inline annotation */}
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add annotation..."
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      className="flex-1 bg-slate-800/50 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
                    />
                    <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-xs text-slate-400 hover:text-white transition">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-onset-500/15 hover:bg-onset-500/25 text-onset-400 rounded-md text-xs font-medium transition">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-md text-xs font-medium transition">
                      <Clock className="w-3.5 h-3.5" /> Request Revision
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md text-xs transition">
                      <Lock className="w-3.5 h-3.5" /> Lock
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Approval Gate */}
          <div className="p-4 rounded-xl border border-cinema-500/20 bg-cinema-500/5">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Approval Gate — Scene {scene.number}</span>
            </div>
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-slate-500">Director:</span>
                <span className="ml-1 text-onset-400">Approved</span>
              </div>
              <div>
                <span className="text-slate-500">DP:</span>
                <span className="ml-1 text-amber-400">Pending</span>
              </div>
              <div>
                <span className="text-slate-500">Producer:</span>
                <span className="ml-1 text-slate-600">Not Reviewed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODIFICATION TOOLS TAB */}
      {activeTab === 'modify' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Shot Editor — Drag to reorder */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <GripVertical className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Shot Editor — Drag to Reorder</span>
            </div>
            <div className="space-y-1">
              {shotOrder.map((orderIdx, i) => {
                const shot = scene.shots[orderIdx]
                if (!shot) return null
                return (
                  <div
                    key={shot.id}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition cursor-move ${
                      dragIdx === i ? 'border-cinema-400 bg-cinema-500/10' : 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/50'
                    }`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                    <span className="text-xs font-mono text-cinema-400 w-6">{i + 1}</span>
                    <span className="text-sm text-white flex-1 truncate">{shot.description}</span>
                    <span className="text-xs text-slate-500">{shot.type}</span>
                    <div className="flex gap-1">
                      <button className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white" title="Split">
                        <Split className="w-3 h-3" />
                      </button>
                      <button className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white" title="Merge with next">
                        <Merge className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md text-xs transition">
                <RotateCcw className="w-3 h-3" /> Revert Order
              </button>
            </div>
          </div>

          {/* Prompt Refinement */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Prompt Refinement</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Describe changes in natural language and the AI will update the shot plan.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g., Make shot 2 a wider angle and add a dolly movement..."
                className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
              />
              <button className="px-4 py-2 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
                <Send className="w-4 h-4" /> Apply
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              {['Add more coverage', 'Reduce shot count', 'More dynamic movement', 'Simpler lighting'].map((q) => (
                <button key={q} onClick={() => setPromptText(q)} className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition">
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Constraints Panel */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Constraints Panel</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Budget Impact</div>
                <div className="text-sm text-white font-medium">$12,400</div>
                <div className="text-[10px] text-amber-400 mt-1">+$800 from HMI addition</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Gear Available</div>
                <div className="text-sm text-white font-medium">ARRI Alexa Mini</div>
                <div className="text-[10px] text-onset-400 mt-1">All lenses available</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Location Limits</div>
                <div className="text-sm text-white font-medium">2h window</div>
                <div className="text-[10px] text-slate-400 mt-1">Natural light dependent</div>
              </div>
            </div>
          </div>

          {/* Batch Operations */}
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-4 py-2 bg-cinema-500/15 hover:bg-cinema-500/25 text-cinema-400 rounded-lg text-xs font-medium transition">
              Batch Approve All Pending
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition">
              <RotateCcw className="w-3 h-3" /> Revert All Changes
            </button>
          </div>
        </div>
      )}

      {/* CHANGE LOG TAB */}
      {activeTab === 'log' && (
        <div className="space-y-2 animate-fadeIn">
          {approvalLog.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                entry.action === 'Approved' ? 'bg-onset-500/20' : entry.action === 'Revision Requested' ? 'bg-amber-500/20' : 'bg-red-500/20'
              }`}>
                {entry.action === 'Approved' ? <CheckCircle2 className="w-4 h-4 text-onset-400" /> :
                 entry.action === 'Revision Requested' ? <Clock className="w-4 h-4 text-amber-400" /> :
                 <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{entry.user}</span>
                  <span className="text-xs text-slate-500">{entry.role}</span>
                </div>
                <div className="text-sm text-slate-400 mt-0.5">
                  <span className={`font-medium ${entry.action === 'Approved' ? 'text-onset-400' : entry.action === 'Revision Requested' ? 'text-amber-400' : 'text-red-400'}`}>
                    {entry.action}
                  </span>
                  {' '}{entry.target}
                </div>
                {entry.note && <div className="text-xs text-slate-500 mt-1">"{entry.note}"</div>}
              </div>
              <div className="text-xs text-slate-600 flex-shrink-0">
                {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
