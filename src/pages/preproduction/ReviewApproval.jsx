import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, XCircle, Clock, MessageSquare, GitCompare, UserCheck,
  GripVertical, RotateCcw, Wand2, DollarSign, History, Lock, Unlock, Send
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { analysis as analysisApi, shots as shotsApi } from '../../services/api'

const statusConfig = {
  approved: { color: 'bg-onset-500/20 text-onset-400 border-onset-500/30', icon: CheckCircle2 },
  pending: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  revision: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

function updateSceneInAnalysis(analysisData, sceneIndex, updatedScene) {
  return {
    ...analysisData,
    scenes: analysisData.scenes.map((scene, index) => index === sceneIndex ? updatedScene : scene),
  }
}

export default function ReviewApproval() {
  const { currentProject, analysisData, setAnalysisData } = useProject()
  const [activeTab, setActiveTab] = useState('review')
  const [selectedScene, setSelectedScene] = useState(0)
  const [compareMode, setCompareMode] = useState(false)
  const [annotationByShot, setAnnotationByShot] = useState({})
  const [promptText, setPromptText] = useState('')
  const [shotOrder, setShotOrder] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [busy, setBusy] = useState(false)

  const scenes = analysisData?.scenes || []
  const scene = scenes[selectedScene]
  const approvalLog = analysisData?.approvalLog || []

  useEffect(() => {
    setShotOrder((scene?.shots || []).map((shot) => shot._id || shot.id))
  }, [scene?._id, scene?.shots])

  const orderedShots = useMemo(() => {
    if (!scene?.shots) return []
    const shotMap = new Map(scene.shots.map((shot) => [shot._id || shot.id, shot]))
    return shotOrder.map((id) => shotMap.get(id)).filter(Boolean)
  }, [scene?.shots, shotOrder])

  if (!scene) return (
    <div className="animate-fadeIn text-center py-16">
      <div className="text-lg text-white mb-2">No analysis data available</div>
      <p className="text-sm text-slate-400">Run AI analysis first to review and approve outputs.</p>
    </div>
  )

  const persistShotUpdate = async (shotId, payload) => {
    if (!currentProject?._id) return
    setBusy(true)
    try {
      const updatedShot = await shotsApi.updateStatus(currentProject._id, selectedScene, shotId, payload)
      if (payload.status === 'approved' || payload.status === 'revision') {
        const action = payload.status === 'approved' ? 'Approved' : 'Revision Requested'
        const target = `Scene ${scene.number} Shot ${orderedShots.findIndex((item) => (item._id || item.id) === shotId) + 1}`
        const note = payload.locked !== undefined ? `${action} while ${payload.locked ? 'locking' : 'unlocking'} shot.` : ''
        const approvalLog = await shotsApi.approve(currentProject._id, { action, target, note })
        setAnalysisData({
          ...analysisData,
          approvalLog,
          scenes: analysisData.scenes.map((existingScene, sceneIndex) => sceneIndex !== selectedScene
            ? existingScene
            : {
                ...existingScene,
                shots: existingScene.shots.map((shot) => ((shot._id || shot.id) === (updatedShot._id || updatedShot.id) ? updatedShot : shot)),
              }),
        })
        return
      }
      setAnalysisData({
        ...analysisData,
        scenes: analysisData.scenes.map((existingScene, sceneIndex) => sceneIndex !== selectedScene
          ? existingScene
          : {
              ...existingScene,
              shots: existingScene.shots.map((shot) => ((shot._id || shot.id) === (updatedShot._id || updatedShot.id) ? updatedShot : shot)),
            }),
      })
    } finally {
      setBusy(false)
    }
  }

  const addAnnotation = async (shotId) => {
    const text = annotationByShot[shotId]?.trim()
    if (!text || !currentProject?._id) return
    setBusy(true)
    try {
      const notes = await shotsApi.updateStatus(currentProject._id, selectedScene, shotId, { notes: text })
      setAnalysisData({
        ...analysisData,
        scenes: analysisData.scenes.map((existingScene, sceneIndex) => sceneIndex !== selectedScene
          ? existingScene
          : {
              ...existingScene,
              shots: existingScene.shots.map((shot) => ((shot._id || shot.id) === shotId ? notes : shot)),
            }),
      })
      setAnnotationByShot((current) => ({ ...current, [shotId]: '' }))
    } finally {
      setBusy(false)
    }
  }

  const saveOrder = async () => {
    if (!currentProject?._id) return
    setBusy(true)
    try {
      const reorderedShots = await shotsApi.reorder(currentProject._id, selectedScene, shotOrder)
      setAnalysisData(updateSceneInAnalysis(analysisData, selectedScene, { ...scene, shots: reorderedShots }))
    } finally {
      setBusy(false)
    }
  }

  const batchApprove = async () => {
    if (!currentProject?._id) return
    setBusy(true)
    try {
      const result = await shotsApi.batchApprove(currentProject._id, selectedScene)
      setAnalysisData(updateSceneInAnalysis(analysisData, selectedScene, { ...scene, shots: result.shots }))
    } finally {
      setBusy(false)
    }
  }

  const refineScene = async () => {
    if (!currentProject?._id || !promptText.trim()) return
    setBusy(true)
    try {
      const updatedScene = await analysisApi.refineScene(currentProject._id, selectedScene, promptText)
      setAnalysisData(updateSceneInAnalysis(analysisData, selectedScene, updatedScene))
      setPromptText('')
    } finally {
      setBusy(false)
    }
  }

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDragOver = (event, idx) => {
    event.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    setShotOrder((current) => {
      const reordered = [...current]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(idx, 0, moved)
      return reordered
    })
    setDragIdx(idx)
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Review & Approval</h1>
          <p className="text-slate-400 text-sm">Approve coverage, request revisions, lock key shots, and reshape the scene plan.</p>
        </div>
        {busy && <div className="text-xs text-slate-500">Updating scene plan…</div>}
      </div>

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
              activeTab === tab.id ? 'text-cinema-400 border-cinema-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {scenes.map((item, index) => (
          <button
            key={item.number || index}
            onClick={() => setSelectedScene(index)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              selectedScene === index ? 'bg-cinema-500 text-white font-medium' : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            SC {item.number}
          </button>
        ))}
      </div>

      {activeTab === 'review' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800">
            <span className="text-sm text-slate-400">Version comparison mode</span>
            <button
              onClick={() => setCompareMode((current) => !current)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                compareMode ? 'bg-cinema-500/20 text-cinema-400 border border-cinema-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {compareMode ? 'Comparing fallback vs current' : 'Compare Versions'}
            </button>
          </div>

          {orderedShots.map((shot, index) => {
            const shotId = shot._id || shot.id
            const cfg = statusConfig[shot.status] || statusConfig.pending
            const StatusIcon = cfg.icon
            return (
              <div key={shotId} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <StatusIcon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
                    <span className="text-xs font-mono text-cinema-400">Shot {index + 1}</span>
                    <span className="text-sm font-medium text-white flex-1">{shot.description}</span>
                    {shot.locked && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-200">Locked</span>}
                    <span className={`text-xs px-2 py-0.5 rounded ${cfg.color}`}>{shot.status}</span>
                  </div>

                  {compareMode && (
                    <div className="grid grid-cols-2 gap-3 mt-3 p-3 rounded-lg bg-slate-800/30">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase mb-1">Original fallback intent</div>
                        <div className="text-xs text-slate-400">{shot.type} on {shot.lens}</div>
                        <div className="text-xs text-slate-400 mt-1">{shot.movement}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-cinema-400 uppercase mb-1">Current editorial value</div>
                        <div className="text-xs text-white">{shot.description}</div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 mt-3 text-xs">
                    <div className="p-2 rounded bg-slate-800/50 text-slate-300">{shot.lens}</div>
                    <div className="p-2 rounded bg-slate-800/50 text-slate-300">{shot.movement}</div>
                    <div className="p-2 rounded bg-slate-800/50 text-slate-300">{shot.angle}</div>
                    <div className="p-2 rounded bg-slate-800/50 text-slate-300">{shot.duration}</div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add annotation for this shot..."
                      value={annotationByShot[shotId] || ''}
                      onChange={(event) => setAnnotationByShot((current) => ({ ...current, [shotId]: event.target.value }))}
                      className="flex-1 bg-slate-800/50 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
                    />
                    <button onClick={() => addAnnotation(shotId)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-xs text-slate-400 hover:text-white transition">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => persistShotUpdate(shotId, { status: 'approved' })} className="flex items-center gap-1.5 px-3 py-1.5 bg-onset-500/15 hover:bg-onset-500/25 text-onset-400 rounded-md text-xs font-medium transition">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => persistShotUpdate(shotId, { status: 'revision' })} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-md text-xs font-medium transition">
                      <Clock className="w-3.5 h-3.5" /> Request Revision
                    </button>
                    <button onClick={() => persistShotUpdate(shotId, { locked: !shot.locked })} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs transition">
                      {shot.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {shot.locked ? 'Unlock' : 'Lock'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="p-4 rounded-xl border border-cinema-500/20 bg-cinema-500/5">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Approval Gate — Scene {scene.number}</span>
            </div>
            <div className="text-xs text-slate-400">
              {orderedShots.filter((shot) => shot.status === 'approved').length} of {orderedShots.length} shots approved, {orderedShots.filter((shot) => shot.locked).length} locked for continuity.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'modify' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <GripVertical className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Shot Editor — Drag to Reorder</span>
            </div>
            <div className="space-y-1">
              {orderedShots.map((shot, index) => (
                <div
                  key={shot._id || shot.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDragEnd={() => setDragIdx(null)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition cursor-move ${
                    dragIdx === index ? 'border-cinema-400 bg-cinema-500/10' : 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/50'
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <span className="text-xs font-mono text-cinema-400 w-6">{index + 1}</span>
                  <span className="text-sm text-white flex-1 truncate">{shot.description}</span>
                  <span className="text-xs text-slate-500">{shot.type}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveOrder} className="flex items-center gap-1.5 px-3 py-1.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-md text-xs transition">
                Save Order
              </button>
              <button onClick={() => setShotOrder((scene.shots || []).map((shot) => shot._id || shot.id))} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md text-xs transition">
                <RotateCcw className="w-3 h-3" /> Revert Order
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-4 h-4 text-cinema-400" />
              <span className="text-sm font-medium text-white">Prompt Refinement</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Describe a real production adjustment and the shot plan will be regenerated around it.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="e.g. Split coverage for a cramped apartment, keep eyelines clean, favor practical lamp motivation"
                className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
              />
              <button onClick={refineScene} className="px-4 py-2 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
                <Send className="w-4 h-4" /> Apply
              </button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[
                'Add practical insert coverage for continuity bridges',
                'Make the scene feel more handheld and unstable',
                'Reduce the company move count and simplify lighting',
                'Favor an over-shoulder structure for a confrontation'
              ].map((quickPrompt) => (
                <button key={quickPrompt} onClick={() => setPromptText(quickPrompt)} className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition">
                  {quickPrompt}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-white">Real-World Constraint Read</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Coverage Risk</div>
                <div className="text-sm text-white font-medium">{orderedShots.filter((shot) => shot.type === 'Insert').length > 0 ? 'Balanced' : 'Thin on inserts'}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Blocking Complexity</div>
                <div className="text-sm text-white font-medium">{scene.characters?.length > 2 ? 'High' : 'Manageable'}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-500 mb-1">Edit Flexibility</div>
                <div className="text-sm text-white font-medium">{orderedShots.length >= 4 ? 'Strong' : 'Limited'}</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={batchApprove} className="flex items-center gap-1.5 px-4 py-2 bg-cinema-500/15 hover:bg-cinema-500/25 text-cinema-400 rounded-lg text-xs font-medium transition">
              Batch Approve All Pending
            </button>
          </div>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="space-y-2 animate-fadeIn">
          {approvalLog.length === 0 && <div className="text-sm text-slate-500">Approval log will populate as the team approves or flags shots.</div>}
          {approvalLog.map((entry) => (
            <div key={entry.id || entry._id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                entry.action === 'Approved' ? 'bg-onset-500/20' : entry.action === 'Revision Requested' ? 'bg-amber-500/20' : 'bg-red-500/20'
              }`}>
                {entry.action === 'Approved' ? <CheckCircle2 className="w-4 h-4 text-onset-400" /> :
                 entry.action === 'Revision Requested' ? <Clock className="w-4 h-4 text-amber-400" /> :
                 <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1">
                <div className="text-sm text-white">{entry.user}</div>
                <div className="text-xs text-slate-500 mt-0.5">{entry.action} {entry.target}</div>
                {entry.note && <div className="text-xs text-slate-400 mt-1">{entry.note}</div>}
              </div>
              <div className="text-xs text-slate-600">
                {new Date(entry.createdAt || Date.now()).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
