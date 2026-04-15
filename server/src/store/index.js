import { isDBConnected } from '../config/db.js'
import { getModel as getMemoryModel } from './memoryStore.js'

// Import real Mongoose models
import ProjectModel from '../models/Project.js'
import AnalysisModel from '../models/Analysis.js'
import UserModel from '../models/User.js'

const mongooseModels = {
  projects: ProjectModel,
  analyses: AnalysisModel,
  users: UserModel,
}

// Returns the real Mongoose model if DB is connected, otherwise the in-memory fallback
export function getStore(name) {
  if (isDBConnected()) return mongooseModels[name]
  return getMemoryModel(name)
}

export const Project = new Proxy({}, {
  get: (_, prop) => getStore('projects')[prop]?.bind?.(getStore('projects')) || getStore('projects')[prop],
})

export const Analysis = new Proxy({}, {
  get: (_, prop) => getStore('analyses')[prop]?.bind?.(getStore('analyses')) || getStore('analyses')[prop],
})

export const User = new Proxy({}, {
  get: (_, prop) => getStore('users')[prop]?.bind?.(getStore('users')) || getStore('users')[prop],
})
