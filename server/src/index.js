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

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
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
