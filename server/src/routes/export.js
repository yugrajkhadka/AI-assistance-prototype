import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import { generateShotListPDF, generateCSV } from '../services/exportService.js'

const router = Router()

router.get('/:projectId/pdf', optionalAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId).lean()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = await Analysis.findOne({ project: project._id }).lean()
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const pdfBuffer = await generateShotListPDF(project, analysis)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shot-list.pdf"`)
    res.send(pdfBuffer)
  } catch (err) { next(err) }
})

router.get('/:projectId/csv', optionalAuth, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId).lean()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = await Analysis.findOne({ project: project._id }).lean()
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const csv = generateCSV(analysis)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shots.csv"`)
    res.send(csv)
  } catch (err) { next(err) }
})

export default router
