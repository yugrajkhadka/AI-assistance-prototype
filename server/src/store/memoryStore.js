import { v4 as uuidv4 } from 'uuid'
import { isDBConnected } from '../config/db.js'

// In-memory storage — used when MongoDB is not available
const collections = {
  projects: new Map(),
  analyses: new Map(),
  users: new Map(),
}

// Create a document-like object with _id and subdoc helpers
function makeDoc(data, collection) {
  const id = uuidv4()
  const now = new Date()
  const doc = {
    _id: id,
    ...data,
    createdAt: now,
    updatedAt: now,
  }

  // Add save method
  doc.save = async () => {
    doc.updatedAt = new Date()
    collection.set(id, doc)
    return doc
  }

  // Add toJSON/lean-like behavior
  doc.toObject = () => ({ ...doc })

  return doc
}

// Add subdoc id() method to shot arrays
function addSubdocMethods(arr) {
  if (!Array.isArray(arr)) return arr
  arr.id = function (id) {
    return this.find(item => item._id === id || String(item._id) === String(id))
  }
  // Give each item an _id if missing
  arr.forEach(item => {
    if (!item._id) item._id = uuidv4()
  })
  return arr
}

function processScenes(scenes) {
  if (!Array.isArray(scenes)) return scenes
  scenes.forEach(scene => {
    if (scene.shots) addSubdocMethods(scene.shots)
  })
  return scenes
}

// Memory-backed model that mimics Mongoose API
function createMemoryModel(name) {
  const col = collections[name] || (collections[name] = new Map())

  return {
    async create(data) {
      const doc = makeDoc(data, col)
      if (doc.scenes) processScenes(doc.scenes)
      col.set(doc._id, doc)
      return doc
    },

    async findById(id) {
      return col.get(id) || null
    },

    async findOne(query) {
      if (query && query.project) {
        for (const doc of col.values()) {
          if (doc.project === query.project || String(doc.project) === String(query.project)) {
            if (doc.scenes) processScenes(doc.scenes)
            return doc
          }
        }
        return null
      }
      if (query && query.email) {
        for (const doc of col.values()) {
          if (doc.email === query.email) return doc
        }
        return null
      }
      // Return first match for empty/simple queries
      for (const doc of col.values()) {
        let match = true
        for (const [k, v] of Object.entries(query || {})) {
          if (doc[k] !== v) { match = false; break }
        }
        if (match) return doc
      }
      return null
    },

    find(query = {}) {
      const results = []
      for (const doc of col.values()) {
        let match = true
        for (const [k, v] of Object.entries(query)) {
          if (doc[k] !== v && String(doc[k]) !== String(v)) { match = false; break }
        }
        if (match) results.push(doc)
      }
      // Return a chainable wrapper that mimics Mongoose query
      const chain = {
        _data: results,
        sort(sortObj) {
          const key = Object.keys(sortObj)[0]
          const dir = sortObj[key]
          this._data.sort((a, b) => dir === -1 ? (b[key] > a[key] ? 1 : -1) : (a[key] > b[key] ? 1 : -1))
          return this
        },
        lean() { return this },
        then(resolve, reject) {
          // Make it thenable so `await` works
          try { resolve(this._data) } catch (e) { if (reject) reject(e); else throw e }
        },
      }
      return chain
    },

    async findByIdAndUpdate(id, updates, options = {}) {
      const doc = col.get(id)
      if (!doc) return null
      Object.assign(doc, updates, { updatedAt: new Date() })
      col.set(id, doc)
      return doc
    },

    async findOneAndUpdate(query, updates, options = {}) {
      let doc = null
      if (query.project) {
        for (const d of col.values()) {
          if (d.project === query.project || String(d.project) === String(query.project)) {
            doc = d
            break
          }
        }
      }
      if (!doc && options.upsert) {
        doc = makeDoc({ ...query, ...updates }, col)
        if (doc.scenes) processScenes(doc.scenes)
        col.set(doc._id, doc)
        return doc
      }
      if (doc) {
        Object.assign(doc, updates, { updatedAt: new Date() })
        if (doc.scenes) processScenes(doc.scenes)
        doc.save = async () => { col.set(doc._id, doc); return doc }
        return doc
      }
      return null
    },

    async findByIdAndDelete(id) {
      const doc = col.get(id)
      if (doc) col.delete(id)
      return doc
    },

    async deleteMany(query = {}) {
      let count = 0
      for (const [id, doc] of col.entries()) {
        let match = true
        for (const [k, v] of Object.entries(query)) {
          if (doc[k] !== v && String(doc[k]) !== String(v)) { match = false; break }
        }
        if (match) { col.delete(id); count++ }
      }
      return { deletedCount: count }
    },
  }
}

// Lazy model cache
const modelCache = {}

export function getModel(name) {
  if (!modelCache[name]) modelCache[name] = createMemoryModel(name)
  return modelCache[name]
}
