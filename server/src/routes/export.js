import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import { generateShotListPDF, generateCSV } from '../services/exportService.js'
import { findAnalysisByProject, findProjectById, isDatabaseReady } from '../store/localStore.js'

const router = Router()

router.get('/:projectId/pdf', optionalAuth, async (req, res, next) => {
  try {
    const project = isDatabaseReady()
      ? await Project.findById(req.params.projectId).lean()
      : await findProjectById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: project._id }).lean()
      : await findAnalysisByProject(project._id)
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const pdfBuffer = await generateShotListPDF(project, analysis)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shot-list.pdf"`)
    res.send(pdfBuffer)
  } catch (err) { next(err) }
})

router.get('/:projectId/csv', optionalAuth, async (req, res, next) => {
  try {
    const project = isDatabaseReady()
      ? await Project.findById(req.params.projectId).lean()
      : await findProjectById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = isDatabaseReady()
      ? await Analysis.findOne({ project: project._id }).lean()
      : await findAnalysisByProject(project._id)
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const csv = generateCSV(analysis)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shots.csv"`)
    res.send(csv)
  } catch (err) { next(err) }
})

export default router
