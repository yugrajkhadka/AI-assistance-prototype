import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { getStore } from '../store/index.js'

const router = Router()

// Lazy-load AI service only when needed (may not have API key)
async function getAI() {
  try {
    return await import('../services/aiService.js')
  } catch (err) {
    return null
  }
}

// Run full AI analysis on a project's script
router.post('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const Project = getStore('projects')
    const Analysis = getStore('analyses')

    const project = await Project.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (!project.scriptText) return res.status(400).json({ error: 'No script text available. Upload a script first.' })

    const ai = await getAI()

    let analysisData

    if (ai && process.env.ANTHROPIC_API_KEY) {
      // Run real AI analysis
      const breakdown = await ai.analyzeScript(project.scriptText)
      const cameraSettings = await ai.generateCameraSettings(
        breakdown.suggestedStyle || 'Naturalistic',
        breakdown.overallMood || 'Neutral'
      )

      const scenesWithDetails = []
      for (const scene of breakdown.scenes.slice(0, 10)) {
        const shots = await ai.generateShotList(scene)
        const storyboard = await ai.generateStoryboard(shots)
        const lightingPlan = await ai.generateLightingPlan(scene)
        scenesWithDetails.push({ ...scene, shots, storyboard, lightingPlan })
      }

      analysisData = {
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
    } else {
      // No API key — generate demo analysis from parsed script text
      console.log('No ANTHROPIC_API_KEY — generating demo analysis from script parsing')
      analysisData = generateDemoAnalysis(project)
    }

    const analysis = await Analysis.findOneAndUpdate(
      { project: project._id },
      analysisData,
      { upsert: true, new: true }
    )

    // Update project status
    if (project.save) {
      project.status = 'active'
      await project.save()
    }

    res.json(analysis)
  } catch (err) { next(err) }
})

// Get analysis for a project
router.get('/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'No analysis found. Run analysis first.' })
    res.json(analysis)
  } catch (err) { next(err) }
})

// Run analysis on a single scene (partial)
router.post('/:projectId/scene/:sceneIndex', optionalAuth, async (req, res, next) => {
  try {
    const Analysis = getStore('analyses')
    const analysis = await Analysis.findOne({ project: req.params.projectId })
    if (!analysis) return res.status(404).json({ error: 'No analysis found' })

    const idx = parseInt(req.params.sceneIndex)
    const scene = analysis.scenes[idx]
    if (!scene) return res.status(404).json({ error: 'Scene not found' })

    const ai = await getAI()
    if (ai && process.env.ANTHROPIC_API_KEY) {
      const shots = await ai.generateShotList(scene)
      const storyboard = await ai.generateStoryboard(shots)
      const lightingPlan = await ai.generateLightingPlan(scene)
      analysis.scenes[idx].shots = shots
      analysis.scenes[idx].storyboard = storyboard
      analysis.scenes[idx].lightingPlan = lightingPlan
    }

    if (analysis.save) await analysis.save()
    res.json(analysis.scenes[idx])
  } catch (err) { next(err) }
})

// Generate demo analysis data from script text when no AI API key available
function generateDemoAnalysis(project) {
  const text = project.scriptText || ''
  const sceneRegex = /^(INT\.|EXT\.|INT\/EXT\.)\s*(.+?)(?:\s*-\s*(.+))?$/gmi
  const scenes = []
  let match

  while ((match = sceneRegex.exec(text)) !== null) {
    scenes.push({
      number: scenes.length + 1,
      title: match[0].trim(),
      description: `Scene at ${match[2]?.trim() || 'location'}`,
      mood: 'Neutral',
      style: 'Naturalistic',
      duration: `${Math.floor(Math.random() * 3) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      characters: extractNearbyCharacters(text, match.index),
      locations: [match[2]?.trim() || 'Unknown'],
      props: [],
      shots: generateDemoShots(match[0], scenes.length),
      storyboard: [],
      lightingPlan: {
        keyLight: { type: match[0].includes('INT') ? 'Window (natural)' : 'Natural sun', position: 'Camera Left', intensity: 70, color: '5600K' },
        fillLight: { type: 'Bounce board', position: 'Camera Right', intensity: 30, color: '5600K' },
        backLight: { type: 'None', position: '-', intensity: 0, color: '-' },
        practicals: [],
        ratio: '3:1 key-to-fill',
        notes: 'Auto-generated lighting plan',
      },
    })
  }

  if (scenes.length === 0) {
    scenes.push({
      number: 1,
      title: project.name || 'Scene 1',
      description: 'Script scene',
      mood: 'Neutral',
      style: 'Naturalistic',
      duration: '2:00',
      characters: [],
      locations: ['Main Location'],
      props: [],
      shots: generateDemoShots('Scene 1', 0),
      storyboard: [],
      lightingPlan: {
        keyLight: { type: 'Key', position: 'Left', intensity: 70, color: '5600K' },
        fillLight: { type: 'Fill', position: 'Right', intensity: 30, color: '5600K' },
        backLight: { type: 'None', position: '-', intensity: 0, color: '-' },
        practicals: [],
        ratio: '3:1',
        notes: 'Default lighting setup',
      },
    })
  }

  return {
    project: project._id,
    themes: ['Drama', 'Character Study'],
    overallMood: 'Contemplative',
    suggestedStyle: 'Naturalistic with controlled compositions',
    confidenceScore: 75,
    sceneBreakdown: { total: scenes.length, analyzed: scenes.length, flagged: 0 },
    characterArcs: [],
    ambiguities: [],
    scenes,
    cameraSettings: {
      exposure: { value: 'f/2.8', min: 'f/1.4', max: 'f/22' },
      iso: { value: 800, min: 100, max: 12800 },
      shutter: { value: '1/48', angle: '180°' },
      whiteBalance: { value: '5600K', mode: 'Daylight' },
      nd: { value: 'ND 0.6', stops: 2 },
      lens: { focal: '50mm', type: 'Prime', mount: 'PL', tStop: 'T1.5' },
      resolution: '4K DCI (4096x2160)',
      frameRate: '24fps',
      codec: 'ARRIRAW',
    },
    approvalLog: [],
  }
}

function generateDemoShots(sceneTitle, sceneIndex) {
  const shotTypes = [
    { type: 'Wide', lens: '24mm', movement: 'Static', angle: 'Eye Level', intent: 'establish', desc: 'Establishing shot' },
    { type: 'Medium', lens: '50mm', movement: 'Pan', angle: 'Eye Level', intent: 'character', desc: 'Character coverage' },
    { type: 'Close-Up', lens: '85mm', movement: 'Static', angle: 'Eye Level', intent: 'emotion', desc: 'Emotional reaction' },
    { type: 'Over-Shoulder', lens: '75mm', movement: 'Static', angle: 'Eye Level', intent: 'dialogue', desc: 'Dialogue coverage' },
  ]

  return shotTypes.map((s, i) => ({
    type: s.type,
    description: `${s.desc} — ${sceneTitle}`,
    lens: s.lens,
    movement: s.movement,
    angle: s.angle,
    lighting: 'Consistent with scene plan',
    duration: `${3 + i * 2}s`,
    status: 'pending',
    confidence: 80 + Math.floor(Math.random() * 15),
    intent: s.intent,
    completedOnSet: false,
    takes: 0,
    notes: [],
  }))
}

function extractNearbyCharacters(text, position) {
  const nearby = text.substring(position, position + 500)
  const charRegex = /^([A-Z][A-Z\s.'-]{1,25})$/gm
  const chars = new Set()
  const exclude = new Set(['THE', 'AND', 'BUT', 'FOR', 'WITH', 'FROM', 'FADE IN', 'FADE OUT', 'CUT TO', 'CONTINUED', 'CONT', 'MORE'])
  let m
  while ((m = charRegex.exec(nearby)) !== null) {
    const name = m[1].trim()
    if (!exclude.has(name) && !name.startsWith('INT') && !name.startsWith('EXT') && name.length > 1) {
      chars.add(name)
    }
  }
  return [...chars].slice(0, 5)
}

export default router
