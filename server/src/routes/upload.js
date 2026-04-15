import { Router } from 'express'
import { upload, getFileUrl } from '../config/storage.js'
import { extractText, quickParse } from '../services/scriptParser.js'
import { getStore } from '../store/index.js'
import { optionalAuth } from '../middleware/auth.js'
import path from 'path'

const router = Router()

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

    // Create project (DB or in-memory)
    const Project = getStore('projects')
    const project = await Project.create({
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
      language: req.body.language || 'English',
      privacy: req.body.privacy || 'private',
    })

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
    const { text, name, language, privacy } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'No text provided' })

    const parseResult = quickParse(text)
    parseResult.format = 'TXT'

    const Project = getStore('projects')
    const project = await Project.create({
      name: name || 'Untitled Script',
      owner: req.user?.id,
      scriptText: text,
      parseResult,
      language: language || 'English',
      privacy: privacy || 'private',
    })

    res.status(201).json({
      projectId: project._id,
      file: { name: name || 'Pasted Script.txt' },
      parseResult,
    })
  } catch (err) { next(err) }
})

export default router
