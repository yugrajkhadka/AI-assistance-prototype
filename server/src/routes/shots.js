import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { getStore } from '../store/index.js'

const router = Router()

// Update shot status (approve, revision, etc.)
router.patch('/:projectId/scene/:sceneIndex/shot/:shotId', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const shot = scene.shots?.id ? scene.shots.id(req.params.shotId) : scene.shots?.find(s => String(s._id) === req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    const { status, notes, completedOnSet, takes } = req.body
    if (status) shot.status = status
    if (notes) (shot.notes || (shot.notes = [])).push({ text: notes, author: req.user?.name || 'Anonymous' })
    if (completedOnSet !== undefined) shot.completedOnSet = completedOnSet
    if (takes !== undefined) shot.takes = takes

    if (analysis.save) await analysis.save()
    res.json(shot)
  } catch (err) { next(err) }
})

// Reorder shots in a scene
router.put('/:projectId/scene/:sceneIndex/reorder', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const { order } = req.body
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array of shot IDs' })

    const shotMap = new Map(scene.shots.map(s => [String(s._id), s]))
    scene.shots = order.map(id => shotMap.get(String(id))).filter(Boolean)
    if (analysis.save) await analysis.save()

    res.json(scene.shots)
  } catch (err) { next(err) }
})

// Add approval log entry
router.post('/:projectId/approve', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const { action, target, note } = req.body
    if (!analysis.approvalLog) analysis.approvalLog = []
    analysis.approvalLog.push({
      user: req.user?.name || req.body.user || 'Anonymous',
      role: req.user?.role || req.body.role || 'crew',
      action,
      target,
      note: note || '',
      createdAt: new Date(),
    })
    if (analysis.save) await analysis.save()

    res.json(analysis.approvalLog)
  } catch (err) { next(err) }
})

// Batch approve all pending shots in a scene
router.post('/:projectId/scene/:sceneIndex/batch-approve', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
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
    if (analysis.save) await analysis.save()

    res.json({ approved: count, shots: scene.shots })
  } catch (err) { next(err) }
})

export default router
