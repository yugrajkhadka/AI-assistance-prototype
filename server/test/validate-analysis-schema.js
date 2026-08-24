import mongoose from 'mongoose'
import Analysis from '../src/models/Analysis.js'

const doc = {
  project: new mongoose.Types.ObjectId(),
  cameraSettings: {
    exposure: { value: 'f/2.8', min: 'f/1.4', max: 'f/22' },
    iso: { value: 800, min: 100, max: 12800 },
    shutter: { value: '1/48', angle: '180°' },
    whiteBalance: { value: '5600K', mode: 'Daylight' },
    nd: { value: 'ND 0.6', stops: 2 },
    lens: { focal: '35mm', type: 'Prime', mount: 'PL', tStop: 'T2.1' },
    resolution: '4K DCI',
    frameRate: '24fps',
    codec: 'ARRIRAW',
  },
}

const analysis = new Analysis(doc)
const validationError = analysis.validateSync()

if (validationError) {
  console.error('Schema validation failed:', validationError)
  process.exit(1)
}

console.log('Analysis schema validation passed.')
