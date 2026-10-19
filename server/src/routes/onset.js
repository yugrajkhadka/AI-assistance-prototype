import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Analysis from '../models/Analysis.js'
import * as ai from '../services/aiService.js'
import { findAnalysisByProject, isDatabaseReady, saveAnalysis } from '../store/localStore.js'

const router = Router()

function findShot(scene, shotId) {
  return scene?.shots?.find((shot) => (shot._id || shot.id)?.toString() === shotId)
}

// Get on-set data for a project (scenes, shots, camera settings)
router.get('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'No analysis found' })

    res.json({
      scenes: analysis.scenes,
      cameraSettings: analysis.cameraSettings,
      approvalLog: analysis.approvalLog,
    })
  } catch (err) { next(err) }
})

// Mark a shot as completed on set
router.post('/:projectId/scene/:sceneIndex/shot/:shotId/complete', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const shot = isDatabaseReady() ? scene.shots.id(req.params.shotId) : findShot(scene, req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    shot.completedOnSet = true
    shot.takes = (shot.takes || 0) + 1
    shot.status = 'approved'
    if (req.body.notes) shot.notes.push({ text: req.body.notes, author: req.user?.name || 'On-Set' })
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    // Calculate coverage
    const totalShots = scene.shots.length
    const completedShots = scene.shots.filter(s => s.completedOnSet).length
    const coverage = Math.round((completedShots / totalShots) * 100)

    res.json({ shot, coverage, completedShots, totalShots })
  } catch (err) { next(err) }
})

// AI chat — on-set guidance
router.post('/:projectId/chat', optionalAuth, async (req, res, next) => {
  try {
    const { question, sceneIndex } = req.body
    if (!question) return res.status(400).json({ error: 'Question is required' })

    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'No analysis found' })

    const scene = analysis.scenes[sceneIndex || 0]
    const response = await ai.getOnSetGuidance(
      { title: scene?.title, mood: scene?.mood, style: scene?.style, description: scene?.description },
      scene?.shots || [],
      analysis.cameraSettings || {},
      question
    )

    res.json({ response })
  } catch (err) { next(err) }
})

router.patch('/:projectId/camera-settings', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    analysis.cameraSettings = {
      ...(analysis.cameraSettings?.toObject?.() || analysis.cameraSettings || {}),
      ...req.body,
      exposure: { ...(analysis.cameraSettings?.exposure || {}), ...(req.body.exposure || {}) },
      iso: { ...(analysis.cameraSettings?.iso || {}), ...(req.body.iso || {}) },
      shutter: { ...(analysis.cameraSettings?.shutter || {}), ...(req.body.shutter || {}) },
      whiteBalance: { ...(analysis.cameraSettings?.whiteBalance || {}), ...(req.body.whiteBalance || {}) },
      nd: { ...(analysis.cameraSettings?.nd || {}), ...(req.body.nd || {}) },
      lens: { ...(analysis.cameraSettings?.lens || {}), ...(req.body.lens || {}) },
    }

    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json({ cameraSettings: analysis.cameraSettings })
  } catch (err) { next(err) }
})

// AI visual check — Claude compares a live-view frame with the pre-production plan
router.post('/:projectId/visual-check', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const match = String(req.body.image || '').match(/^(?:data:(image\/(?:jpeg|png|webp));base64,)?([A-Za-z0-9+/=]+)$/)
    if (!match) return res.status(400).json({ error: 'Send the frame as a base64 JPEG, PNG or WebP in "image"' })
    const ref = String(req.body.reference || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
    const toIndex = (v) => (v === undefined || v === null || v === '' ? undefined : Number.parseInt(v, 10))

    const result = await ai.analyzeOnsetFrame(analysis.toObject?.() || analysis, {
      imageBase64: match[2],
      mediaType: match[1] || 'image/jpeg',
      reference: ref ? { mediaType: ref[1], data: ref[2] } : undefined,
      sceneIndex: toIndex(req.body.sceneIndex),
      shotIndex: toIndex(req.body.shotIndex),
      camera: req.body.camera,
      frameStats: req.body.frameStats,
    })
    res.json(result)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Add note to a shot
router.post('/:projectId/scene/:sceneIndex/shot/:shotId/note', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    const shot = isDatabaseReady() ? scene?.shots?.id(req.params.shotId) : findShot(scene, req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    shot.notes.push({ text: req.body.text, author: req.user?.name || 'Anonymous' })
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json(shot.notes)
  } catch (err) { next(err) }
})

export default router
