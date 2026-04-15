import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { getStore } from '../store/index.js'
import { generateShotListPDF, generateCSV } from '../services/exportService.js'

const router = Router()

router.get('/:projectId/pdf', optionalAuth, async (req, res, next) => {
  try {
    const Project = getStore('projects')
    const Analysis = getStore('analyses')
    const project = await Project.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = await Analysis.findOne({ project: project._id })
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const pdfBuffer = await generateShotListPDF(project, analysis)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shot-list.pdf"`)
    res.send(pdfBuffer)
  } catch (err) { next(err) }
})

router.get('/:projectId/csv', optionalAuth, async (req, res, next) => {
  try {
    const Project = getStore('projects')
    const Analysis = getStore('analyses')
    const project = await Project.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const analysis = await Analysis.findOne({ project: project._id })
    if (!analysis) return res.status(404).json({ error: 'No analysis available' })

    const csv = generateCSV(analysis)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shots.csv"`)
    res.send(csv)
  } catch (err) { next(err) }
})

export default router
