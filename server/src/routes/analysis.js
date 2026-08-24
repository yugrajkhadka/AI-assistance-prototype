import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import * as ai from '../services/aiService.js'
import {
  findAnalysisByProject,
  findProjectById,
  isDatabaseReady,
  saveAnalysis,
  saveProject,
  upsertAnalysis,
} from '../store/localStore.js'

const router = Router()

// Run full AI analysis on a project's script
router.post('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const project = isDatabaseReady()
      ? await Project.findById(req.params.projectId)
      : await findProjectById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (!project.scriptText) return res.status(400).json({ error: 'No script text available. Upload a script first.' })

    // Run AI script breakdown
    const breakdown = await ai.analyzeScript(project.scriptText)

    // Generate camera settings based on style
    // Get camera preference from request body (sent by frontend from localStorage)
    const cameraPrefs = req.body.cameraPrefs || project.cameraPackage || null

    const cameraSettings = await ai.generateCameraSettings(
      breakdown.suggestedStyle || 'Naturalistic',
      breakdown.overallMood || 'Neutral',
      cameraPrefs
    )

    // Generate shot lists, storyboards, and lighting for each scene
    const scenesWithDetails = []
    for (const scene of breakdown.scenes.slice(0, 10)) {
      // Shot list
      const shots = await ai.generateShotList(scene)

      // Storyboard captions
      const storyboard = await ai.generateStoryboard(shots)

      // Lighting plan
      const lightingPlan = await ai.generateLightingPlan(scene)

      scenesWithDetails.push({
        ...scene,
        shots,
        storyboard,
        lightingPlan,
      })
    }

    // Save analysis
    const analysisPayload = {
      project: project._id,
      themes: breakdown.themes,
      overallMood: breakdown.overallMood,
      suggestedStyle: breakdown.suggestedStyle,
      confidenceScore: breakdown.confidenceScore,
      sceneBreakdown: breakdown.sceneBreakdown,
      characterArcs: breakdown.characterArcs,
      ambiguities: breakdown.ambiguities,
      scenes: scenesWithDetails,
      cameraSettings,
    }

    const analysis = isDatabaseReady()
      ? await Analysis.findOneAndUpdate(
          { project: project._id },
          analysisPayload,
          { upsert: true, new: true }
        )
      : await upsertAnalysis(project._id, analysisPayload)

    project.status = 'active'
    project.sceneCount = scenesWithDetails.length
    if (isDatabaseReady()) await project.save()
    else await saveProject(project)

    res.json(analysis)
  } catch (err) { next(err) }
})

// Get analysis for a project
router.get('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'No analysis found. Run analysis first.' })
    res.json(analysis)
  } catch (err) { next(err) }
})

// Run analysis on a single scene (partial)
router.post('/:projectId/scene/:sceneIndex', optionalAuth, async (req, res, next) => {
  try {
    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'No analysis found' })

    const idx = parseInt(req.params.sceneIndex)
    const scene = analysis.scenes[idx]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    // Regenerate shots, storyboard, and lighting for this scene
    const shots = await ai.generateShotList(scene)
    const storyboard = await ai.generateStoryboard(shots)
    const lightingPlan = await ai.generateLightingPlan(scene)

    analysis.scenes[idx].shots = shots
    analysis.scenes[idx].storyboard = storyboard
    analysis.scenes[idx].lightingPlan = lightingPlan
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json(analysis.scenes[idx])
  } catch (err) { next(err) }
})

router.post('/:projectId/scene/:sceneIndex/refine', optionalAuth, async (req, res, next) => {
  try {
    const { instruction } = req.body
    if (!instruction?.trim()) return res.status(400).json({ error: 'Instruction is required' })

    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: req.params.projectId })
      : await findAnalysisByProject(req.params.projectId)
    if (!analysis) return res.status(404).json({ error: 'No analysis found' })

    const idx = parseInt(req.params.sceneIndex)
    const scene = analysis.scenes[idx]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const refinedShots = await ai.refineShotPlan(scene, instruction)
    analysis.scenes[idx].shots = refinedShots
    analysis.scenes[idx].storyboard = await ai.generateStoryboard(refinedShots)
    analysis.scenes[idx].lightingPlan = await ai.generateLightingPlan(scene)

    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)

    res.json(analysis.scenes[idx])
  } catch (err) { next(err) }
})

export default router
