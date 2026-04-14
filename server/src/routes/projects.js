import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'

const router = Router()

// List all projects
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const query = req.user?.id ? { owner: req.user.id } : {}
    const projects = await Project.find(query).sort({ updatedAt: -1 }).lean()
    res.json(projects)
  } catch (err) { next(err) }
})

// Get single project with analysis
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).lean()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = await Analysis.findOne({ project: project._id }).lean()
    res.json({ project, analysis })
  } catch (err) { next(err) }
})

// Update project
router.patch('/:id', optionalAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'version', 'status', 'director', 'dp', 'privacy', 'language']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json(project)
  } catch (err) { next(err) }
})

// Delete project
router.delete('/:id', optionalAuth, async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    await Analysis.deleteMany({ project: project._id })
    res.json({ deleted: true })
  } catch (err) { next(err) }
})

export default router
