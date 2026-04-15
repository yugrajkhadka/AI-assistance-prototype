import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { getStore } from '../store/index.js'

const router = Router()

// Get on-set data for a project (scenes, shots, camera settings)
router.get('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
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
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const shot = scene.shots?.id ? scene.shots.id(req.params.shotId) : scene.shots?.find(s => String(s._id) === req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    shot.completedOnSet = true
    shot.takes = (shot.takes || 0) + 1
    shot.status = 'approved'
    if (req.body.notes) (shot.notes || (shot.notes = [])).push({ text: req.body.notes, author: req.user?.name || 'On-Set' })
    if (analysis.save) await analysis.save()

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

    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })

    const scene = analysis?.scenes?.[sceneIndex || 0]

    // Try AI if available
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const ai = await import('../services/aiService.js')
        const response = await ai.getOnSetGuidance(
          { title: scene?.title, mood: scene?.mood, style: scene?.style, description: scene?.description },
          scene?.shots || [],
          analysis?.cameraSettings || {},
          question
        )
        return res.json({ response })
      } catch { /* fall through to demo response */ }
    }

    // Demo response when no AI
    res.json({
      response: `Based on the current scene setup${scene ? ` (${scene.title})` : ''}, here's my recommendation for "${question}":\n\n` +
        `1. Check your current framing and lens choice against the shot plan\n` +
        `2. Consider the scene mood (${scene?.mood || 'neutral'}) when making adjustments\n` +
        `3. Maintain consistent lighting ratios throughout coverage\n\n` +
        `Note: Connect an Anthropic API key for full AI-powered guidance.`
    })
  } catch (err) { next(err) }
})

// Add note to a shot
router.post('/:projectId/scene/:sceneIndex/shot/:shotId/note', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

    const scene = analysis.scenes[parseInt(req.params.sceneIndex)]
    const shot = scene?.shots?.id ? scene.shots.id(req.params.shotId) : scene?.shots?.find(s => String(s._id) === req.params.shotId)
    if (!shot) return res.status(404).json({ error: 'Shot not found' })

    if (!shot.notes) shot.notes = []
    shot.notes.push({ text: req.body.text, author: req.user?.name || 'Anonymous' })
    if (analysis.save) await analysis.save()

    res.json(shot.notes)
  } catch (err) { next(err) }
})

export default router
