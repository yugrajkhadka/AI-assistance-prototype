import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import Project from '../models/Project.js'
import Analysis from '../models/Analysis.js'
import { generateShotListPDF, generateCSV } from '../services/exportService.js'
import { renderReportPdf } from '../services/reportPdf.js'
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

// Full report (dashboard + every scene's outputs) as a PDF, in the app's own layout.
router.get('/:projectId/report.pdf', optionalAuth, async (req, res, next) => {
  try {
    const { projectId } = req.params
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return res.status(400).json({ error: 'Invalid project id' })
    const project = isDatabaseReady()
      ? await Project.findById(projectId).lean()
      : await findProjectById(projectId)
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const pdf = await renderReportPdf(projectId, { orientation: req.query.orientation, theme: req.query.theme })
    // "My_Script.docx (1)" -> "My_Script"
    const base = String(project.name || 'CineAssist').replace(/\s*\(\d+\)\s*$/, '').replace(/\.(docx?|pdf|txt|fdx|fountain|rtf)$/i, '')
    const layout = req.query.orientation === 'portrait' ? 'Vertical' : 'Horizontal'
    const name = `${base.replace(/[^\w\- ]+/g, '').trim() || 'CineAssist'} - Cinematography Report (${layout}).pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.send(Buffer.from(pdf))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
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
