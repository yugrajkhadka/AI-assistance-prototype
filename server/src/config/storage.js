import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

const uploadsDir = path.resolve('uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.fdx', '.txt', '.fountain']
  const ext = path.extname(file.originalname).toLowerCase()
  if (allowed.includes(ext)) cb(null, true)
  else cb(new Error(`Unsupported file type: ${ext}`), false)
}

export const upload = multer({
  storage: localStorage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
})

export function getFileUrl(filename) {
  if (process.env.STORAGE_MODE === 's3') {
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`
  }
  return `/uploads/${filename}`
}
