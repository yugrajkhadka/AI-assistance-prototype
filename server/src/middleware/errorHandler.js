export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.message })
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload error: ${err.message}` })
  }
  if (err.message?.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message })
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
}
