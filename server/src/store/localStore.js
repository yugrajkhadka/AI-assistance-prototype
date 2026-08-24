import fs from 'fs/promises'
import path from 'path'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const dataDir = path.resolve(process.cwd(), 'data')
const dataFile = path.join(dataDir, 'local-store.json')

let writeQueue = Promise.resolve()

const initialData = {
  users: [],
  projects: [],
  analyses: [],
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function withId(record) {
  if (!record) return null
  const id = record._id || record.id || randomUUID()
  return { ...record, _id: id, id }
}

function normalizeNote(note = {}) {
  return {
    text: note.text || '',
    author: note.author || 'Anonymous',
    createdAt: note.createdAt || new Date().toISOString(),
  }
}

function normalizeShot(shot = {}) {
  const id = shot._id || shot.id || randomUUID()
  return {
    _id: id,
    id,
    type: shot.type || 'Shot',
    description: shot.description || '',
    lens: shot.lens || '',
    movement: shot.movement || '',
    angle: shot.angle || '',
    lighting: shot.lighting || '',
    duration: shot.duration || '',
    status: shot.status || 'pending',
    locked: Boolean(shot.locked),
    confidence: shot.confidence ?? 0,
    intent: shot.intent || 'establish',
    completedOnSet: Boolean(shot.completedOnSet),
    takes: shot.takes ?? 0,
    notes: Array.isArray(shot.notes) ? shot.notes.map(normalizeNote) : [],
  }
}

function normalizeScene(scene = {}, index = 0) {
  const id = scene._id || scene.id || randomUUID()
  return {
    _id: id,
    id,
    number: scene.number ?? index + 1,
    title: scene.title || `Scene ${index + 1}`,
    description: scene.description || '',
    mood: scene.mood || '',
    style: scene.style || '',
    duration: scene.duration || '',
    characters: Array.isArray(scene.characters) ? scene.characters : [],
    locations: Array.isArray(scene.locations) ? scene.locations : [],
    props: Array.isArray(scene.props) ? scene.props : [],
    shots: Array.isArray(scene.shots) ? scene.shots.map(normalizeShot) : [],
    storyboard: Array.isArray(scene.storyboard)
      ? scene.storyboard.map((frame, frameIndex) => {
          const frameId = frame._id || frame.id || randomUUID()
          return {
            _id: frameId,
            id: frameId,
          shotIndex: frame.shotIndex ?? frameIndex,
          caption: frame.caption || '',
          style: frame.style || 'cinematic',
          imagePrompt: frame.imagePrompt || '',
          }
        })
      : [],
    lightingPlan: {
      keyLight: scene.lightingPlan?.keyLight || {},
      fillLight: scene.lightingPlan?.fillLight || {},
      backLight: scene.lightingPlan?.backLight || {},
      practicals: Array.isArray(scene.lightingPlan?.practicals) ? scene.lightingPlan.practicals : [],
      ratio: scene.lightingPlan?.ratio || '',
      notes: scene.lightingPlan?.notes || '',
    },
  }
}

function normalizeProject(project = {}) {
  const id = project._id || project.id || randomUUID()
  const now = new Date().toISOString()
  return {
    _id: id,
    id,
    name: project.name || 'Untitled Project',
    owner: project.owner || null,
    version: project.version || 'v1.0',
    status: project.status || 'draft',
    syncStatus: project.syncStatus || 'synced',
    director: project.director || '',
    dp: project.dp || '',
    runtime: project.runtime || '',
    sceneCount: project.sceneCount ?? 0,
    scriptFile: project.scriptFile || null,
    scriptText: project.scriptText || '',
    parseResult: project.parseResult || {},
    cameraPackage: project.cameraPackage || null,
    team: Array.isArray(project.team) ? project.team : [],
    privacy: project.privacy || 'private',
    language: project.language || 'English',
    createdAt: project.createdAt || now,
    updatedAt: now,
  }
}

function normalizeAnalysis(analysis = {}) {
  const id = analysis._id || analysis.id || randomUUID()
  const now = new Date().toISOString()
  return {
    _id: id,
    id,
    project: analysis.project,
    themes: Array.isArray(analysis.themes) ? analysis.themes : [],
    overallMood: analysis.overallMood || '',
    suggestedStyle: analysis.suggestedStyle || '',
    confidenceScore: analysis.confidenceScore ?? 0,
    sceneBreakdown: analysis.sceneBreakdown || { total: 0, analyzed: 0, flagged: 0 },
    characterArcs: Array.isArray(analysis.characterArcs) ? analysis.characterArcs : [],
    ambiguities: Array.isArray(analysis.ambiguities) ? analysis.ambiguities : [],
    scenes: Array.isArray(analysis.scenes) ? analysis.scenes.map(normalizeScene) : [],
    cameraSettings: analysis.cameraSettings || {},
    approvalLog: Array.isArray(analysis.approvalLog)
      ? analysis.approvalLog.map((entry) => {
          const entryId = entry._id || entry.id || randomUUID()
          return {
            _id: entryId,
            id: entryId,
          user: entry.user || 'Anonymous',
          role: entry.role || 'crew',
          action: entry.action || 'Approved',
          target: entry.target || '',
          note: entry.note || '',
          createdAt: entry.createdAt || now,
          }
        })
      : [],
    createdAt: analysis.createdAt || now,
    updatedAt: now,
  }
}

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.access(dataFile)
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(initialData, null, 2))
  }
}

async function readData() {
  await ensureFile()
  const raw = await fs.readFile(dataFile, 'utf8')
  return { ...initialData, ...JSON.parse(raw || '{}') }
}

async function writeData(data) {
  writeQueue = writeQueue.then(async () => {
    await ensureFile()
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2))
  })
  await writeQueue
}

async function updateData(mutator) {
  const data = await readData()
  const result = await mutator(data)
  await writeData(data)
  return result
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1
}

export async function createProject(project) {
  return updateData(async (data) => {
    const record = normalizeProject(project)
    data.projects.unshift(record)
    return clone(record)
  })
}

export async function listProjects(ownerId) {
  const data = await readData()
  const projects = ownerId ? data.projects.filter((project) => project.owner === ownerId) : data.projects
  return clone(projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
}

export async function findProjectById(projectId) {
  const data = await readData()
  return clone(data.projects.find((project) => project._id === projectId) || null)
}

export async function updateProject(projectId, updates) {
  return updateData(async (data) => {
    const project = data.projects.find((entry) => entry._id === projectId)
    if (!project) return null
    Object.assign(project, updates, { updatedAt: new Date().toISOString() })
    return clone(project)
  })
}

export async function saveProject(project) {
  return updateProject(project._id || project.id, project)
}

export async function deleteProject(projectId) {
  return updateData(async (data) => {
    const index = data.projects.findIndex((project) => project._id === projectId)
    if (index === -1) return null
    const [removed] = data.projects.splice(index, 1)
    data.analyses = data.analyses.filter((analysis) => analysis.project !== projectId)
    return clone(removed)
  })
}

export async function findAnalysisByProject(projectId) {
  const data = await readData()
  return clone(data.analyses.find((analysis) => analysis.project === projectId) || null)
}

export async function upsertAnalysis(projectId, analysisInput) {
  return updateData(async (data) => {
    const existingIndex = data.analyses.findIndex((analysis) => analysis.project === projectId)
    const existing = existingIndex >= 0 ? data.analyses[existingIndex] : null
    const record = normalizeAnalysis({
      ...existing,
      ...analysisInput,
      project: projectId,
      createdAt: existing?.createdAt,
    })
    if (existingIndex >= 0) data.analyses[existingIndex] = record
    else data.analyses.unshift(record)
    return clone(record)
  })
}

export async function saveAnalysis(analysis) {
  return upsertAnalysis(analysis.project, analysis)
}

export async function deleteAnalysisByProject(projectId) {
  return updateData(async (data) => {
    const before = data.analyses.length
    data.analyses = data.analyses.filter((analysis) => analysis.project !== projectId)
    return before !== data.analyses.length
  })
}

export async function findUserByEmail(email) {
  const data = await readData()
  return clone(data.users.find((user) => user.email === email.toLowerCase()) || null)
}

export async function findUserById(userId) {
  const data = await readData()
  return clone(data.users.find((user) => user._id === userId) || null)
}

export async function createUser(user) {
  return updateData(async (data) => {
    const id = randomUUID()
    const record = withId({
      _id: id,
      name: user.name,
      email: user.email.toLowerCase(),
      password: await bcrypt.hash(user.password, 12),
      role: user.role || 'crew',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    data.users.push(record)
    const safeUser = clone(record)
    delete safeUser.password
    return safeUser
  })
}

export async function verifyUser(email, password) {
  const data = await readData()
  const user = data.users.find((entry) => entry.email === email.toLowerCase())
  if (!user) return null
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return null
  const safeUser = clone(user)
  delete safeUser.password
  return safeUser
}
