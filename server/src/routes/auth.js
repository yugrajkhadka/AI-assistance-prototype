import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcryptjs from 'bcryptjs'
import { getStore } from '../store/index.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
const secret = () => process.env.JWT_SECRET || 'dev-secret'
const signToken = (user) => jwt.sign(
  { id: user._id, email: user.email, name: user.name, role: user.role },
  secret(),
  { expiresIn: '7d' }
)

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' })

    const User = getStore('users')
    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ error: 'Email already registered' })

    // Hash password for in-memory store (Mongoose model does it via pre-save hook)
    const hashed = await bcryptjs.hash(password, 10)
    const user = await User.create({ name, email, password: hashed, role: role || 'crew' })

    res.status(201).json({ token: signToken(user), user: { _id: user._id, name, email, role: user.role } })
  } catch (err) { next(err) }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const User = getStore('users')
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    // Support both Mongoose model comparePassword and plain bcrypt
    const valid = user.comparePassword
      ? await user.comparePassword(password)
      : await bcryptjs.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    res.json({ token: signToken(user), user: { _id: user._id, name: user.name, email: user.email, role: user.role } })
  } catch (err) { next(err) }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const User = getStore('users')
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role } })
  } catch (err) { next(err) }
})

export default router
