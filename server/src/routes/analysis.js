import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import * as ai from '../services/aiService.js'
import { drawPanel, getSketchStatus, startSketchJob } from '../services/storyboardJobs.js'
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
      // Lighting first: the shot list is built on the rig, so the two never disagree.
      const lightingPlan = await ai.generateLightingPlan(scene)

      // Shot list
      const shots = await ai.generateShotList({ ...scene, lightingPlan })

      // Storyboard captions
      const storyboard = await ai.generateStoryboard(shots)

      // Scene blocking — character positions and movement
      const blocking = await ai.generateBlocking(scene)

      scenesWithDetails.push({
        ...scene,
        shots,
        storyboard,
        lightingPlan,
        blocking,
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
      creativeTargets: breakdown.creativeTargets,
      productionConstraints: breakdown.productionConstraints,
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

    // Draw every storyboard panel in the background; the UI shows progress.
    startSketchJob(project._id)

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

    // Regenerate lighting, then shots built on it, storyboard, and blocking for this scene
    const lightingPlan = await ai.generateLightingPlan(scene)
    const shots = await ai.generateShotList({ ...(scene.toObject?.() || scene), lightingPlan })
    const storyboard = await ai.generateStoryboard(shots)
    const blocking = await ai.generateBlocking(scene)

    analysis.scenes[idx].shots = shots
    analysis.scenes[idx].storyboard = storyboard
    analysis.scenes[idx].lightingPlan = lightingPlan
    analysis.scenes[idx].blocking = blocking
    if (isDatabaseReady()) await analysis.save()
    else await saveAnalysis(analysis)
    startSketchJob(req.params.projectId)

    res.json(analysis.scenes[idx])
  } catch (err) { next(err) }
})

// Draw (or redraw with { force: true }) the storyboard sketch for one shot.
router.post('/:projectId/scene/:sceneIndex/storyboard/:shotIndex/sketch', optionalAuth, async (req, res, next) => {
  try {
    const shotIdx = parseInt(req.params.shotIndex)
    const frame = await drawPanel(req.params.projectId, parseInt(req.params.sceneIndex), shotIdx, { force: Boolean(req.body?.force) })
    res.json({ shotIndex: shotIdx, frame })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Background drawing of every missing panel (also started automatically after analysis).
router.post('/:projectId/storyboard/draw-all', optionalAuth, async (req, res, next) => {
  try {
    startSketchJob(req.params.projectId)
    res.json(await getSketchStatus(req.params.projectId))
  } catch (err) { next(err) }
})

router.get('/:projectId/storyboard/status', optionalAuth, async (req, res, next) => {
  try {
    res.json(await getSketchStatus(req.params.projectId))
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
    startSketchJob(req.params.projectId)

    res.json(analysis.scenes[idx])
  } catch (err) { next(err) }
})

export default router
