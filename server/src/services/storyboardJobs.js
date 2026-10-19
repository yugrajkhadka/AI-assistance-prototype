// Server-side storyboard drawing. After an analysis finishes, every shot's panel
// is drawn here in the background — three at a time, with retries — so the board
// fills in whether or not anyone has the Storyboard tab open, and the PDF report
// gets real sketches. Progress is derived from what's saved, so it's correct even
// after a server restart (a restarted job simply continues with what's missing).
import Analysis from '../models/Analysis.js'
import * as ai from './aiService.js'
import { findAnalysisByProject, isDatabaseReady, saveAnalysis } from '../store/localStore.js'

const CONCURRENCY = 3
const ATTEMPTS = 2

const jobs = new Map() // projectId -> { running, failed: Set<key>, lastError, startedAt }

// Local JSON store has no atomic updates: serialize its read-modify-write per project.
const storeLocks = new Map()
function withProjectLock(projectId, fn) {
  const key = String(projectId)
  const run = (storeLocks.get(key) || Promise.resolve()).then(fn, fn)
  storeLocks.set(key, run.catch(() => {}))
  return run
}

async function loadAnalysis(projectId) {
  return isDatabaseReady()
    ? Analysis.findOne({ project: projectId }).lean()
    : findAnalysisByProject(projectId)
}

function counts(analysis) {
  let total = 0
  let drawn = 0
  for (const scene of analysis?.scenes || []) {
    for (let i = 0; i < (scene.shots || []).length; i += 1) {
      total += 1
      if (scene.storyboard?.[i]?.sketchSvg) drawn += 1
    }
  }
  return { total, drawn }
}

export async function getSketchStatus(projectId) {
  const analysis = await loadAnalysis(projectId)
  const job = jobs.get(String(projectId))
  return {
    ...counts(analysis),
    running: Boolean(job?.running),
    failed: job ? job.failed.size : 0,
    lastError: job?.lastError || '',
    available: ai.isClaudeConfigured(),
  }
}

// Save one panel. The write only lands if the shot at that index is still the
// shot we drew — a re-analysis in the meantime must not get someone else's panel.
async function saveFrame(projectId, sceneIdx, shotIdx, shot, frame, shotCount, framesIfMissing) {
  if (isDatabaseReady()) {
    const filter = { project: projectId, [`scenes.${sceneIdx}.shots.${shotIdx}.description`]: shot.description }
    const fresh = await Analysis.findOne(filter, { [`scenes`]: { $slice: [sceneIdx, 1] } }).lean()
    if (!fresh) return false
    const board = fresh.scenes?.[0]?.storyboard
    const update = Array.isArray(board) && board.length === shotCount
      ? { $set: { [`scenes.${sceneIdx}.storyboard.${shotIdx}`]: frame } }
      : { $set: { [`scenes.${sceneIdx}.storyboard`]: framesIfMissing.map((f, i) => (i === shotIdx ? frame : f)) } }
    const result = await Analysis.updateOne(filter, update)
    return result.matchedCount > 0
  }
  return withProjectLock(projectId, async () => {
    const fresh = await findAnalysisByProject(projectId)
    const scene = fresh?.scenes?.[sceneIdx]
    if (!scene || scene.shots?.[shotIdx]?.description !== shot.description) return false
    const board = Array.isArray(scene.storyboard) && scene.storyboard.length === shotCount ? scene.storyboard : framesIfMissing
    board[shotIdx] = frame
    scene.storyboard = board
    await saveAnalysis(fresh)
    return true
  })
}

// Draw one panel (used by the per-panel endpoint and by the job).
export async function drawPanel(projectId, sceneIdx, shotIdx, { force = false } = {}) {
  const analysis = await loadAnalysis(projectId)
  if (!analysis) throw Object.assign(new Error('No analysis found'), { status: 404 })
  const scene = analysis.scenes?.[sceneIdx]
  const shot = scene?.shots?.[shotIdx]
  if (!shot) throw Object.assign(new Error('Shot not found'), { status: 404 })
  const frames = Array.isArray(scene.storyboard) && scene.storyboard.length === scene.shots.length
    ? scene.storyboard
    : await ai.generateStoryboard(scene.shots)
  const existing = frames[shotIdx]
  if (existing?.sketchSvg && !force) return existing

  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const { svg, model } = await ai.generateStoryboardSketch(scene, shot, shotIdx)
      const frame = { ...existing, shotIndex: shotIdx, sketchSvg: svg, sketchModel: model, sketchedAt: new Date() }
      const saved = await saveFrame(analysis.project, sceneIdx, shotIdx, shot, frame, scene.shots.length, frames)
      if (!saved) throw Object.assign(new Error('The shot list changed while drawing — panel discarded'), { status: 409 })
      return frame
    } catch (error) {
      lastError = error
      if (error.status) break // config / not-found / conflict: retrying won't help
    }
  }
  throw lastError
}

// Start (or join) the background job that draws every missing panel.
export function startSketchJob(projectId) {
  const key = String(projectId)
  const existing = jobs.get(key)
  if (existing?.running) return existing
  if (!ai.isClaudeConfigured()) return null
  const job = { running: true, failed: new Set(), lastError: '', startedAt: new Date() }
  jobs.set(key, job)
  runJob(projectId, job)
    .catch((error) => { job.lastError = error.message })
    .finally(() => { job.running = false })
  return job
}

async function runJob(projectId, job) {
  const analysis = await loadAnalysis(projectId)
  if (!analysis) return
  const queue = []
  analysis.scenes.forEach((scene, sceneIdx) => {
    (scene.shots || []).forEach((_, shotIdx) => {
      if (!scene.storyboard?.[shotIdx]?.sketchSvg) queue.push([sceneIdx, shotIdx])
    })
  })
  console.log(`[Storyboard] Drawing ${queue.length} panel(s) for project ${projectId}`)
  const worker = async () => {
    while (queue.length) {
      const [sceneIdx, shotIdx] = queue.shift()
      try {
        await drawPanel(projectId, sceneIdx, shotIdx)
      } catch (error) {
        job.failed.add(`${sceneIdx}:${shotIdx}`)
        job.lastError = error.message
        console.warn(`[Storyboard] SC${sceneIdx + 1} shot ${shotIdx + 1} failed: ${error.message}`)
        if (error.status === 503) queue.length = 0 // Claude not configured: stop
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`[Storyboard] Finished project ${projectId} (${job.failed.size} failed)`)
}
