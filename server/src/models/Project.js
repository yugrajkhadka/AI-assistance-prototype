import mongoose from 'mongoose'

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  version: { type: String, default: 'v1.0' },
  status: { type: String, enum: ['draft', 'active', 'in_review', 'completed'], default: 'draft' },
  syncStatus: { type: String, enum: ['synced', 'syncing', 'offline'], default: 'synced' },
  director: String,
  dp: String,
  runtime: String,
  scriptFile: {
    originalName: String,
    storedName: String,
    url: String,
    format: String,
    size: Number,
  },
  scriptText: String,
  parseResult: {
    scenes: Number,
    pages: Number,
    runtime: String,
    characters: Number,
    locations: Number,
    format: String,
  },
  cameraPackage: {
    id: String,
    brand: String,
    model: String,
    tier: String,
    budget: String,
    priceUSD: Number,
    sensor: String,
    resolution: String,
    codec: String,
    dynamicRange: String,
    mount: String,
    notes: String,
    color: String,
  },
  team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  privacy: { type: String, enum: ['private', 'team', 'shared'], default: 'private' },
  language: { type: String, default: 'English' },
}, { timestamps: true })

export default mongoose.model('Project', projectSchema)
