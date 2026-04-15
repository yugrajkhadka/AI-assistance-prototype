import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { errorHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import uploadRoutes from './routes/upload.js'
import analysisRoutes from './routes/analysis.js'
import shotsRoutes from './routes/shots.js'
import projectRoutes from './routes/projects.js'
import exportRoutes from './routes/export.js'
import onsetRoutes from './routes/onset.js'

const app = express()
const PORT = process.env.PORT || 3001

// Allow multiple origins: local dev + GitHub Pages + any custom CORS_ORIGIN
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://yugrajkhadka.github.io',
]
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').forEach(o => allowedOrigins.push(o.trim()))
}
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true)
    cb(null, true) // In development, allow all; tighten in production if needed
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static('uploads'))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/shots', shotsRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/onset', onsetRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use(errorHandler)

connectDB().then(() => {
  app.listen(PORT, () => console.log(`CineAssist API running on port ${PORT}`))
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err.message)
  console.log('Starting server without database (limited functionality)...')
  app.listen(PORT, () => console.log(`CineAssist API running on port ${PORT} (no DB)`))
})
