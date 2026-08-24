import { Router } from 'express'
import { upload, getFileUrl } from '../config/storage.js'
import { extractText, quickParse } from '../services/scriptParser.js'
import Project from '../models/Project.js'
import { optionalAuth } from '../middleware/auth.js'
import path from 'path'
import { createProject, isDatabaseReady } from '../store/localStore.js'

const router = Router()

function parseCameraPackage(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

router.post('/', optionalAuth, upload.single('script'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const filePath = req.file.path
    const ext = path.extname(req.file.originalname).toLowerCase()

    // Extract text from the uploaded file
    const scriptText = await extractText(filePath)

    // Quick heuristic parse for immediate feedback
    const parseResult = quickParse(scriptText)
    parseResult.format = ext.replace('.', '').toUpperCase()

    // Create or update project
    const projectPayload = {
      name: req.body.name || req.file.originalname.replace(/\.[^.]+$/, ''),
      owner: req.user?.id,
      scriptFile: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        url: getFileUrl(req.file.filename),
        format: ext,
        size: req.file.size,
      },
      scriptText,
      parseResult,
      cameraPackage: parseCameraPackage(req.body.cameraPackage),
      language: req.body.language || 'English',
      privacy: req.body.privacy || 'private',
    }

    const project = isDatabaseReady()
      ? await Project.create(projectPayload)
      : await createProject(projectPayload)

    res.status(201).json({
      projectId: project._id,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        url: getFileUrl(req.file.filename),
      },
      parseResult,
    })
  } catch (err) { next(err) }
})

// Upload via paste text
router.post('/text', optionalAuth, async (req, res, next) => {
  try {
    const { text, name, language, privacy, cameraPackage } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'No text provided' })

    const parseResult = quickParse(text)
    parseResult.format = 'TXT'

    const projectPayload = {
      name: name || 'Untitled Script',
      owner: req.user?.id,
      scriptText: text,
      parseResult,
      cameraPackage: parseCameraPackage(cameraPackage),
      language: language || 'English',
      privacy: privacy || 'private',
    }

    const project = isDatabaseReady()
      ? await Project.create(projectPayload)
      : await createProject(projectPayload)

    res.status(201).json({
      projectId: project._id,
      file: { name: name || 'Pasted Script.txt' },
      parseResult,
    })
  } catch (err) { next(err) }
})

export default router
