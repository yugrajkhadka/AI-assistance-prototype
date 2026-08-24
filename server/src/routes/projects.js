import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import {
  deleteProject,
  findAnalysisByProject,
  findProjectById,
  isDatabaseReady,
  listProjects,
  updateProject,
} from '../store/localStore.js'

const router = Router()

// List all projects
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const projects = isDatabaseReady()
      ? await Project.find(req.user?.id ? { owner: req.user.id } : {}).sort({ updatedAt: -1 }).lean()
      : await listProjects(req.user?.id)
    res.json(projects)
  } catch (err) { next(err) }
})

// Get single project with analysis
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const project = isDatabaseReady()
      ? await Project.findById(req.params.id).lean()
      : await findProjectById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: project._id }).lean()
      : await findAnalysisByProject(project._id)
    res.json({ project, analysis })
  } catch (err) { next(err) }
})

// Update project
router.patch('/:id', optionalAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'version', 'status', 'director', 'dp', 'privacy', 'language', 'cameraPackage']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const project = isDatabaseReady()
      ? await Project.findByIdAndUpdate(req.params.id, updates, { new: true })
      : await updateProject(req.params.id, updates)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json(project)
  } catch (err) { next(err) }
})

// Delete project
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    const project = isDatabaseReady()
      ? await Project.findByIdAndDelete(req.params.id)
      : await deleteProject(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (isDatabaseReady()) {
      await Analysis.deleteMany({ project: project._id })
    }
    res.json({ deleted: true })
  } catch (err) { next(err) }
})

export default router
