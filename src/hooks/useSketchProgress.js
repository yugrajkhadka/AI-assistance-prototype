// Tracks the server's background storyboard-drawing job for a project and pulls
// fresh analysis data whenever more panels have been saved.
import { useEffect, useRef, useState } from 'react'
import { analysis as analysisApi } from '../services/api'

const POLL_MS = 6000

export default function useSketchProgress(projectId, { autoStart = true, onUpdate } = {}) {
  const [status, setStatus] = useState(null)
  const lastDrawn = useRef(-1)
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])

  useEffect(() => {
    if (!projectId) return undefined
    let cancelled = false
    let timer

    const tick = async (first) => {
      try {
        const next = first && autoStart
          ? await analysisApi.drawAllSketches(projectId)
          : await analysisApi.sketchStatus(projectId)
        if (cancelled) return
        setStatus(next)
        if (lastDrawn.current >= 0 && next.drawn !== lastDrawn.current && onUpdateRef.current) {
          onUpdateRef.current(await analysisApi.get(projectId))
        }
        lastDrawn.current = next.drawn
        if (next.running) timer = setTimeout(() => tick(false), POLL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(() => tick(false), POLL_MS * 2)
      }
    }
    lastDrawn.current = -1
    tick(true)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [projectId, autoStart])

  const start = async () => {
    const next = await analysisApi.drawAllSketches(projectId)
    setStatus(next)
    // Kick polling again by re-reading status until the job stops.
    const poll = async () => {
      const s = await analysisApi.sketchStatus(projectId)
      setStatus(s)
      if (s.drawn !== lastDrawn.current && onUpdateRef.current) onUpdateRef.current(await analysisApi.get(projectId))
      lastDrawn.current = s.drawn
      if (s.running) setTimeout(poll, POLL_MS)
    }
    setTimeout(poll, POLL_MS)
  }

  return { status, start }
}
