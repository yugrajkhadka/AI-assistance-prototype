import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const secret = () => process.env.JWT_SECRET || 'dev-secret'
const signToken = (user) => jwt.sign({ id: user._id, email: user.email, name: user.name, role: user.role }, secret(), { expiresIn: '7d' })

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' })

    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ error: 'Email already registered' })

    const user = await User.create({ name, email, password, role })
    res.status(201).json({ token: signToken(user), user })
  } catch (err) { next(err) }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const user = await User.findOne({ email })
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    res.json({ token: signToken(user), user })
  } catch (err) { next(err) }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) { next(err) }
})

export default router
