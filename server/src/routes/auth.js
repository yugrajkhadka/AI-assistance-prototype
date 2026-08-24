import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  isDatabaseReady,
  verifyUser,
} from '../store/localStore.js'

const router = Router()
const secret = () => process.env.JWT_SECRET || 'dev-secret'
const signToken = (user) => jwt.sign({ id: user._id, email: user.email, name: user.name, role: user.role }, secret(), { expiresIn: '7d' })

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' })

    const exists = isDatabaseReady()
      ? await User.findOne({ email })
      : await findUserByEmail(email)
    if (exists) return res.status(409).json({ error: 'Email already registered' })

    const user = isDatabaseReady()
      ? await User.create({ name, email, password, role })
      : await createUser({ name, email, password, role })
    res.status(201).json({ token: signToken(user), user })
  } catch (err) { next(err) }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const user = isDatabaseReady()
      ? await User.findOne({ email })
      : await verifyUser(email, password)
    const valid = isDatabaseReady() ? user && await user.comparePassword(password) : Boolean(user)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    res.json({ token: signToken(user), user })
  } catch (err) { next(err) }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = isDatabaseReady()
      ? await User.findById(req.user.id)
      : await findUserById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) { next(err) }
})

export default router
