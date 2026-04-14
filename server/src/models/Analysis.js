import mongoose from 'mongoose'

const lightSchema = new mongoose.Schema({
  type: String,
  position: String,
  intensity: Number,
  color: String,
}, { _id: false })

const shotSchema = new mongoose.Schema({
  type: String,
  description: String,
  lens: String,
  movement: String,
  angle: String,
  lighting: String,
  duration: String,
  status: { type: String, enum: ['approved', 'pending', 'revision'], default: 'pending' },
  confidence: Number,
  intent: { type: String, enum: ['establish', 'detail', 'character', 'emotion', 'dialogue', 'thematic'] },
  completedOnSet: { type: Boolean, default: false },
  takes: { type: Number, default: 0 },
  notes: [{ text: String, author: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true })

const storyboardFrameSchema = new mongoose.Schema({
  shotIndex: Number,
  caption: String,
  style: { type: String, default: 'cinematic' },
  imagePrompt: String,
}, { _id: false })

const sceneSchema = new mongoose.Schema({
  number: Number,
  title: String,
  description: String,
  mood: String,
  style: String,
  duration: String,
  characters: [String],
  locations: [String],
  props: [String],
  shots: [shotSchema],
  storyboard: [storyboardFrameSchema],
  lightingPlan: {
    keyLight: lightSchema,
    fillLight: lightSchema,
    backLight: lightSchema,
    practicals: [String],
    ratio: String,
    notes: String,
  },
})

const analysisSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  themes: [String],
  overallMood: String,
  suggestedStyle: String,
  confidenceScore: Number,
  sceneBreakdown: {
    total: Number,
    analyzed: Number,
    flagged: Number,
  },
  characterArcs: [{
    name: String,
    archetype: String,
    screenTime: String,
  }],
  ambiguities: [{
    scene: Number,
    note: String,
  }],
  scenes: [sceneSchema],
  cameraSettings: {
    exposure: { value: String, min: String, max: String },
    iso: { value: Number, min: Number, max: Number },
    shutter: { value: String, angle: String },
    whiteBalance: { value: String, mode: String },
    nd: { value: String, stops: Number },
    lens: { focal: String, type: String, mount: String, tStop: String },
    resolution: String,
    frameRate: String,
    codec: String,
  },
  approvalLog: [{
    user: String,
    role: String,
    action: { type: String, enum: ['Approved', 'Revision Requested', 'Flagged'] },
    target: String,
    note: String,
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true })

export default mongoose.model('Analysis', analysisSchema)
