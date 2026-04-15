import mongoose from 'mongoose'

let connected = false

export function isDBConnected() {
  return connected
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cineassist'
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000, // Fail fast if no MongoDB
      connectTimeoutMS: 3000,
    })
    connected = true
    console.log('MongoDB connected:', mongoose.connection.host)
  } catch (err) {
    connected = false
    throw err
  }
}
