import fs from 'fs'
import path from 'path'

export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.txt' || ext === '.fountain') {
    return fs.readFileSync(filePath, 'utf-8')
  }

  if (ext === '.pdf') {
    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParse = (await import('pdf-parse')).default
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    return data.text
  }

  if (ext === '.fdx') {
    // Final Draft XML — extract dialogue and action text
    const xml = fs.readFileSync(filePath, 'utf-8')
    return parseFDX(xml)
  }

  throw new Error(`Unsupported format: ${ext}`)
}

function parseFDX(xml) {
  const lines = []
  // Extract text content from FDX XML tags
  const textRegex = /<Text>(.*?)<\/Text>/gs
  let match
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim()
    if (text) lines.push(text)
  }

  if (lines.length === 0) {
    // Fallback: strip all XML tags
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return lines.join('\n')
}

export function quickParse(text) {
  // Quick heuristic parse for immediate feedback (before AI analysis)
  const sceneHeadingRegex = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.).+$/gmi
  const sceneHeadings = text.match(sceneHeadingRegex) || []

  const characterRegex = /^[A-Z][A-Z\s.'-]{1,30}$/gm
  const rawCharacters = text.match(characterRegex) || []
  const characterCounts = {}
  const excludeWords = new Set(['THE', 'AND', 'BUT', 'FOR', 'WITH', 'FROM', 'FADE IN', 'FADE OUT', 'CUT TO', 'DISSOLVE TO', 'CONTINUED', 'CONT', 'MORE', 'END'])
  for (const name of rawCharacters) {
    const clean = name.trim()
    if (clean.length > 1 && !excludeWords.has(clean) && !clean.startsWith('INT') && !clean.startsWith('EXT')) {
      characterCounts[clean] = (characterCounts[clean] || 0) + 1
    }
  }
  // Characters appear multiple times (dialogue)
  const characters = Object.entries(characterCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 20)

  const locationRegex = /(?:INT\.|EXT\.|INT\/EXT\.)\s*(.+?)(?:\s*-\s*.+)?$/gmi
  const locations = new Set()
  let m
  while ((m = locationRegex.exec(text)) !== null) {
    locations.add(m[1].trim())
  }

  const wordCount = text.split(/\s+/).length
  const estimatedPages = Math.ceil(wordCount / 250)
  const estimatedMinutes = Math.round(estimatedPages * 1)
  const hours = Math.floor(estimatedMinutes / 60)
  const mins = estimatedMinutes % 60

  return {
    scenes: sceneHeadings.length || 1,
    pages: estimatedPages,
    runtime: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    characters: characters.length,
    locations: locations.size,
    format: 'Detected',
  }
}
