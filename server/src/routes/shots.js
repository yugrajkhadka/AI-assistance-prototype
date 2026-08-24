import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Analysis from '../models/Analysis.js'
import { findAnalysisByProject, isDatabaseReady, saveAnalysis } from '../store/localStore.js'

const router = Router()

function findShot(scene, shotId) {
  return scene?.shots?.find((shot) => (shot._id || shot.id)?.toString() === shotId)
}

// Update shot status (approve, revision, etc.)
router.patch('/:projectId/scene/:sceneIndex/shot/:shotId', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const shot = isDatabaseReady() ? scene.shots.id(req.params.shotId) : findShot(scene, req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    const { status, notes, completedOnSet, takes } = req.body
    if (status) shot.status = status
    if (req.body.locked !== undefined) shot.locked = Boolean(req.body.locked)
    if (req.body.description !== undefined) shot.description = req.body.description
    if (req.body.lens !== undefined) shot.lens = req.body.lens
    if (req.body.movement !== undefined) shot.movement = req.body.movement
    if (req.body.angle !== undefined) shot.angle = req.body.angle
    if (req.body.lighting !== undefined) shot.lighting = req.body.lighting
    if (req.body.duration !== undefined) shot.duration = req.body.duration
    if (req.body.intent !== undefined) shot.intent = req.body.intent
    if (notes) shot.notes.push({ text: notes, author: req.user?.name || 'Anonymous' })
    if (completedOnSet !== undefined) shot.completedOnSet = completedOnSet
    if (takes !== undefined) shot.takes = takes

    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)
    res.json(shot)
  } catch (err) { next(err) }
})

// Reorder shots in a scene
router.put('/:projectId/scene/:sceneIndex/reorder', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const { order } = req.body // array of shot IDs in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array of shot IDs' })

    const shotMap = new Map(scene.shots.map((shot) => [String(shot._id || shot.id), shot]))
    scene.shots = order.map(id => shotMap.get(id)).filter(Boolean)
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json(scene.shots)
  } catch (err) { next(err) }
})

// Add approval log entry
router.post('/:projectId/approve', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const { action, target, note } = req.body
    analysis.approvalLog.push({
      user: req.user?.name || req.body.user || 'Anonymous',
      role: req.user?.role || req.body.role || 'crew',
      action,
      target,
      note: note || '',
    })
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json(analysis.approvalLog)
  } catch (err) { next(err) }
})

// Batch approve all pending shots in a scene
router.post('/:projectId/scene/:sceneIndex/batch-approve', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    let count = 0
    for (const shot of scene.shots) {
      if (shot.status === 'pending') {
        shot.status = 'approved'
        count++
      }
    }
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json({ approved: count, shots: scene.shots })
  } catch (err) { next(err) }
})

export default router
