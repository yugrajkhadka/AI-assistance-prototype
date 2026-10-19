import { SCRIPT_BREAKDOWN_PROMPT, CAMERA_SETTINGS_PROMPT } from '../prompts/scriptBreakdown.js'
import { SHOT_LIST_PROMPT, STORYBOARD_PROMPT } from '../prompts/shotList.js'
import { LIGHTING_PLAN_PROMPT } from '../prompts/lightingPlan.js'
import { BLOCKING_PROMPT } from '../prompts/blocking.js'
import { ON_SET_GUIDANCE_PROMPT, DEVIATION_CHECK_PROMPT } from '../prompts/cameraDirection.js'
import { quickParse } from './scriptParser.js'
import Anthropic from '@anthropic-ai/sdk'

const OLLAMA_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/api/generate'
const MODEL = process.env.LOCAL_LLM_MODEL || 'llama3'
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS || 4000)

const TOKENROUTER_API_KEY = process.env.TOKENROUTER_API_KEY || ''
const TOKENROUTER_BASE_URL = process.env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.com/v1'
const TOKENROUTER_MODEL = process.env.TOKENROUTER_MODEL || 'qwen/qwen3.8-max-free'
// Qwen is a reasoning model — full script analysis can take 30-50s, so give it real headroom
// before falling back to Ollama.
const TOKENROUTER_TIMEOUT_MS = Number(process.env.TOKENROUTER_REQUEST_TIMEOUT_MS || 60000)

function getResponseText(payload) {
  if (typeof payload?.response === 'string') return payload.response
  if (Array.isArray(payload?.response)) {
    return payload.response
      .map((item) => typeof item === 'string' ? item : item?.text || '')
      .join('\n')
  }
  return ''
}

// ─── Core LLM caller ─────────────────────────────────────────────────────────
async function callLocalLLMText(prompt, maxTokens = 4096, { expectJson = true } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        ...(expectJson ? { format: 'json' } : {}),
        options: { num_predict: maxTokens },
      }),
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(
        `Ollama timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s while running model "${MODEL}". ` +
        'Try a smaller script, use a faster local model, or increase OLLAMA_REQUEST_TIMEOUT_MS.'
      )
    }
    throw new Error(
      `Could not reach Ollama at ${OLLAMA_URL}. Start Ollama locally and run "ollama pull ${MODEL}" if needed. ${error.message}`
    )
  }
  clearTimeout(timeoutId)

  const rawBody = await response.text()
  let payload = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    throw new Error(`Ollama returned invalid JSON from ${OLLAMA_URL}: ${rawBody.slice(0, 200)}`)
  }

  if (!response.ok) {
    const errorMessage = payload?.error || payload?.message || `HTTP ${response.status}`
    throw new Error(`Local LLM request failed (${response.status}): ${errorMessage}`)
  }

  const text = getResponseText(payload)

  if (!text) throw new Error(`Local LLM returned no text output from model "${MODEL}"`)
  return text
}

// ─── TokenRouter (cloud) caller — tried first when configured ────────────────
async function callTokenRouterText(prompt, maxTokens = 4096, { expectJson = true } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TOKENROUTER_TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${TOKENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKENROUTER_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TOKENROUTER_MODEL,
        messages: [
          { role: 'system', content: 'You are a cinematography assistant. Respond concisely.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        stream: false,
        ...(expectJson ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`TokenRouter timed out after ${Math.round(TOKENROUTER_TIMEOUT_MS / 1000)}s`)
    }
    throw new Error(`Could not reach TokenRouter: ${error.message}`)
  }
  clearTimeout(timeoutId)

  const rawBody = await response.text()
  let payload = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    throw new Error(`TokenRouter returned invalid JSON: ${rawBody.slice(0, 200)}`)
  }

  if (!response.ok) {
    const errorMessage = payload?.error?.message || payload?.error || `HTTP ${response.status}`
    throw new Error(`TokenRouter request failed (${response.status}): ${errorMessage}`)
  }

  const text = payload?.choices?.[0]?.message?.content
  if (!text) throw new Error('TokenRouter returned no text output')
  return text
}

// ─── Claude (Anthropic) caller — primary provider when ANTHROPIC_API_KEY is set ──
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
// Claude Opus 5.5 defaults to "medium"; script breakdown benefits from deeper reasoning.
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || 'high'
const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

const CLAUDE_SYSTEM = 'You are CineAssist, an experienced director of photography and script supervisor ' +
  'helping a film crew plan and shoot. Be specific and production-practical.'
const CLAUDE_JSON_RULE = ' Respond with only the JSON the user asks for: no markdown fences, no prose before or after it.'

export function isClaudeConfigured() {
  return Boolean(claude)
}

async function callClaudeText(prompt, maxTokens = 4096, { expectJson = true } = {}) {
  // Thinking is always on for Claude Opus 5.5 and counts against max_tokens, so the
  // caller's small budgets (sized for local models) are raised; streaming avoids HTTP timeouts.
  const stream = claude.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: Math.max(maxTokens * 4, 32000),
    output_config: { effort: CLAUDE_EFFORT },
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: CLAUDE_SYSTEM + (expectJson ? CLAUDE_JSON_RULE : ''),
    messages: [{ role: 'user', content: prompt }],
  })
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${message.stop_details?.category || 'policy'})`)
  }
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Claude response was cut off at max_tokens')
  }
  if (!text) throw new Error('Claude returned no text output')
  return text
}

function describeClaudeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'invalid ANTHROPIC_API_KEY'
  if (error instanceof Anthropic.PermissionDeniedError) return `no access to ${CLAUDE_MODEL}`
  if (error instanceof Anthropic.RateLimitError) return 'rate limited'
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ''}: ${error.message}`
  return error.message
}

// ─── Combined caller — Claude first, Ollama as its fallback ───────────────────
// TokenRouter (Qwen) is only used when Claude isn't configured.
async function callLLMText(prompt, maxTokens = 4096, opts = {}) {
  if (claude) {
    try {
      return await callClaudeText(prompt, maxTokens, opts)
    } catch (error) {
      console.warn('[AI] Claude failed, falling back to Ollama:', describeClaudeError(error))
      return await callLocalLLMText(prompt, maxTokens, opts)
    }
  }
  if (TOKENROUTER_API_KEY) {
    try {
      return await callTokenRouterText(prompt, maxTokens, opts)
    } catch (error) {
      console.warn('[AI] TokenRouter (Qwen) failed, falling back to Ollama:', error.message)
    }
  }
  return await callLocalLLMText(prompt, maxTokens, opts)
}

// ─── JSON parser — handles prose preamble and markdown fences ─────────────────
function parseJSON(text) {
  // Strip markdown code fences
  const cleaned = text
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    // fall through to tolerant extraction
  }

  // Try array first (shot list / storyboard prompts return arrays)
  const arrStart = cleaned.indexOf('[')
  const arrEnd = cleaned.lastIndexOf(']')
  const objStart = cleaned.indexOf('{')
  const objEnd = cleaned.lastIndexOf('}')

  // Pick whichever valid structure appears first
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    if (arrEnd === -1) throw new Error(`LLM returned no JSON array. Got: ${cleaned.substring(0, 120)}`)
    return JSON.parse(cleaned.slice(arrStart, arrEnd + 1))
  }

  if (objStart === -1 || objEnd === -1) {
    throw new Error(`LLM returned no JSON. Got: ${cleaned.substring(0, 120)}`)
  }
  return JSON.parse(cleaned.slice(objStart, objEnd + 1))
}

function normalizeShots(shots) {
  if (!Array.isArray(shots)) throw new Error('Shot list response was not an array')
  return shots.map((shot, index) => ({
    type: shot.type || 'Medium',
    description: shot.description || `Shot ${index + 1}`,
    lens: shot.lens || '35mm',
    movement: shot.movement || 'Static',
    angle: shot.angle || 'Eye Level',
    lighting: shot.lighting || 'Motivated practical lighting',
    duration: shot.duration || '5s',
    status: ['approved', 'pending', 'revision'].includes(shot.status) ? shot.status : 'pending',
    confidence: Number.isFinite(Number(shot.confidence)) ? Number(shot.confidence) : 80,
    intent: ['establish', 'detail', 'character', 'emotion', 'dialogue', 'thematic'].includes(shot.intent)
      ? shot.intent
      : 'character',
  }))
}

function normalizeStoryboard(storyboard, shots) {
  const frames = Array.isArray(storyboard) ? storyboard : []
  return frames.map((frame, index) => ({
    shotIndex: Number.isInteger(frame.shotIndex) ? frame.shotIndex : index,
    caption: frame.caption || shots[index]?.description || `Storyboard frame ${index + 1}`,
    style: frame.style || 'cinematic',
    imagePrompt: frame.imagePrompt || '',
  }))
}

// ─── Lighting plan normalization ─────────────────────────────────────────────
const num = (value, fallback = null) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))
const firstSentence = (text = '', max = 90) => {
  const t = String(text).split(/(?<=[.;])\s|\s—\s|\n/)[0].trim()
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t
}

// Best-effort geometry from older free-text positions ("Behind Lexi, camera right,
// 15–20° above her head"). Heights/tilts are not mistaken for horizontal angles.
function geometryFromText(position = '', role = 'key') {
  const t = String(position).toLowerCase()
  const left = /camera[ -]left|frame left|\bleft\b/.test(t)
  const right = /camera[ -]right|frame right|\bright\b/.test(t)
  const sign = left && !right ? -1 : right && !left ? 1 : role === 'fill' ? 1 : -1
  // "Behind" only when the LIGHT is behind the subject — not "tuck it behind the door jamb".
  const behind = /^\s*(?:\w+\s+){0,2}behind\b|behind (?:the )?(?:subject|talent|actor|him|her|them|\w+['’]s (?:head|shoulders?))|back ?light|\brim\b|3\/4[- ]back|three-quarter back|upstage/.test(t)
  // "Overhead" only as a rig position — not "reads as overhead office light".
  const overhead = /^\s*(?:top|overhead|directly (?:above|overhead))|top[- ](?:centre|center)|straight down|directly (?:above|overhead)/.test(t)
  const offAxis = t.match(/(\d{1,3})(?:\s*[–-]\s*\d{1,3})?\s*(?:°|deg|degrees?)\s*(?:off|from)/)
  let azimuth = offAxis ? clamp(Number(offAxis[1]), 0, 180) : behind ? 150 : role === 'back' ? 150 : 45
  if (behind && azimuth < 100) azimuth = 150
  const elevation = overhead ? 80 : /\bhigh\b|above|down-?angle/.test(t) ? 35 : 10
  return { azimuthDeg: overhead && !left && !right ? 0 : sign * azimuth, elevationDeg: elevation }
}

function normalizeLight(light, role) {
  if (!light || typeof light !== 'object') return {}
  if (!light.fixture && !light.type && !light.position) return {}
  const fromText = geometryFromText(light.position, role)
  const colorTempK = num(light.colorTempK) ?? num(String(light.color || '').match(/(\d{4,5})\s*K/i)?.[1])
  const fixture = light.fixture || firstSentence(light.type, 60)
  return {
    ...(light.role ? { role: light.role } : {}),
    fixture,
    modifier: light.modifier || '',
    motivation: light.motivation || '',
    type: [fixture, light.modifier].filter(Boolean).join(' — ') || light.type || '',
    position: firstSentence(light.position, 90),
    azimuthDeg: clamp(num(light.azimuthDeg, fromText.azimuthDeg), -180, 180),
    elevationDeg: clamp(num(light.elevationDeg, fromText.elevationDeg), -30, 90),
    distanceM: clamp(num(light.distanceM, role === 'back' ? 3 : 2), 0.3, 30),
    intensity: clamp(Math.round(num(light.intensity, 50)), 0, 100),
    colorTempK,
    gel: light.gel || '',
    color: colorTempK ? `${colorTempK}K${light.gel ? `, ${light.gel}` : ''}` : firstSentence(light.color, 40),
    notes: light.notes || (String(light.position || '').length > 90 ? light.position : ''),
  }
}

function normalizePractical(p) {
  if (typeof p === 'string') {
    const k = p.match(/(\d{4})\s*K/i)
    const dim = p.match(/(\d{1,3})\s*%/)
    return { name: firstSentence(p.split(/[:,—–(]/)[0], 48), colorTempK: k ? Number(k[1]) : null, dimmerPct: dim ? Number(dim[1]) : null, note: p }
  }
  return {
    name: p?.name || 'Practical',
    colorTempK: num(p?.colorTempK),
    dimmerPct: num(p?.dimmerPct),
    azimuthDeg: num(p?.azimuthDeg),
    distanceM: num(p?.distanceM),
    note: p?.note || '',
  }
}

function normalizeLightingPlan(plan) {
  const applicable = plan?.applicable !== false
  return {
    applicable,
    reason: plan?.reason || '',
    cameraWhiteBalanceK: num(plan?.cameraWhiteBalanceK),
    keyLight: applicable ? normalizeLight(plan?.keyLight, 'key') : {},
    fillLight: applicable ? normalizeLight(plan?.fillLight, 'fill') : {},
    backLight: applicable ? normalizeLight(plan?.backLight, 'back') : {},
    additionalLights: applicable && Array.isArray(plan?.additionalLights)
      ? plan.additionalLights.slice(0, 3).map((l) => normalizeLight(l, 'extra')).filter((l) => l.fixture)
      : [],
    practicals: applicable && Array.isArray(plan?.practicals) ? plan.practicals.slice(0, 6).map(normalizePractical) : [],
    ratio: String(plan?.ratio || (applicable ? '2:1' : '')).split(/[ (—–-]{1,3}(?=[A-Za-z])/)[0].trim().slice(0, 24),
    ratioNote: plan?.ratioNote || (String(plan?.ratio || '').length > 24 ? plan.ratio : ''),
    notes: plan?.notes || '',
  }
}

// One-line summary the shot-list prompt uses so every shot is lit by the plan's rig.
function summarizeLighting(plan) {
  if (!plan || plan.applicable === false) return 'Not a photographed scene (graphics / title card) — no lighting.'
  const side = (az) => (az == null ? '' : az === 0 ? 'on the lens axis' : `${Math.abs(az)}° camera ${az < 0 ? 'left' : 'right'}`)
  const line = (label, l) => (l?.fixture ? `${label}: ${l.fixture} (${l.motivation || 'motivated source'}), ${side(l.azimuthDeg)}, ${l.elevationDeg ?? 0}° up, ${l.color}, ${l.intensity}%` : '')
  return [
    line('Key', plan.keyLight), line('Fill', plan.fillLight), line('Back', plan.backLight),
    ...(plan.additionalLights || []).map((l) => line(l.role || 'Extra', l)),
    plan.practicals?.length ? `Practicals: ${plan.practicals.map((p) => p.name).join(', ')}` : '',
    plan.ratio ? `Ratio ${plan.ratio}` : '',
  ].filter(Boolean).join('\n')
}

function clampPercent(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : fallback
}

function normalizeBlocking(blocking) {
  const characters = Array.isArray(blocking?.characters) ? blocking.characters : []
  return {
    characters: characters.map((c, i) => ({
      name: c?.name || `Character ${i + 1}`,
      start: {
        x: clampPercent(c?.start?.x, 20 + i * 15),
        y: clampPercent(c?.start?.y, 70),
      },
      end: {
        x: clampPercent(c?.end?.x, 40 + i * 15),
        y: clampPercent(c?.end?.y, 40),
      },
      movement: c?.movement || '',
    })),
    camera: {
      x: clampPercent(blocking?.camera?.x, 50),
      y: clampPercent(blocking?.camera?.y, 95),
    },
    notes: blocking?.notes || '',
  }
}

function buildFallbackShotList(scene) {
  const title = scene.title || 'Scene'
  const description = scene.description || ''
  const location = scene.locations?.[0] || 'location'
  const leadCharacter = scene.characters?.[0] || 'the lead'
  const supportCharacter = scene.characters?.[1] || 'the counterpart'
  return [
    {
      type: 'Wide',
      description: `Open on a lived-in wide that maps ${location} before ${leadCharacter} crosses into frame, so the audience feels where the exits, obstacles, and emotional pressure points are before dialogue starts.`,
      lens: '24mm',
      movement: 'Static',
      angle: 'Eye Level',
      lighting: `Motivated ambient light shaping the ${scene.mood || 'scene'} mood, with practical spill left in frame to make the space feel inhabited`,
      duration: '5s',
      status: 'pending',
      confidence: 72,
      intent: 'establish',
    },
    {
      type: 'Medium',
      description: description
        ? `Cover the playable action in a medium that lets ${leadCharacter} work through the beat in real time: ${description.slice(0, 140)}`
        : `Use a medium to hold ${leadCharacter} in the decision-making beat before the scene breaks open.`,
      lens: '40mm',
      movement: 'Slow Push-In',
      angle: 'Eye Level',
      lighting: 'Soft key on the working side of the face with enough falloff to keep the background emotionally distant',
      duration: '6s',
      status: 'pending',
      confidence: 74,
      intent: 'dialogue',
    },
    {
      type: 'Close-Up',
      description: `Take a close reaction on ${leadCharacter} the moment the scene turns, the kind of coverage you would actually want in the edit when the subtext lands harder than the line reading.`,
      lens: '85mm',
      movement: 'Static',
      angle: 'Slightly High',
      lighting: 'Selective key with the far eye just dropping into shadow so the face carries conflict without flattening',
      duration: '4s',
      status: 'pending',
      confidence: 70,
      intent: 'emotion',
    },
    {
      type: scene.characters?.length > 1 ? 'Over-Shoulder' : 'Insert',
      description: scene.characters?.length > 1
        ? `Add an over-shoulder favoring ${supportCharacter} so the conversation has a usable editorial pivot and the power dynamic can shift shot to shot without inventing coverage later.`
        : `Grab a practical insert${scene.props?.[0] ? ` on the ${scene.props[0]}` : ''} so the cut has a real-world bridge for pacing, continuity, or compression.`,
      lens: scene.characters?.length > 1 ? '65mm' : '100mm macro',
      movement: 'Static',
      angle: scene.characters?.length > 1 ? 'Slightly Low' : 'High',
      lighting: scene.characters?.length > 1
        ? 'Edge the foreground shoulder softly and keep the subject side clean for separation'
        : 'Focused accent light for texture and emphasis',
      duration: '3s',
      status: 'pending',
      confidence: 68,
      intent: scene.characters?.length > 1 ? 'dialogue' : 'detail',
    },
  ]
}

function buildFallbackStoryboard(shots) {
  return shots.map((shot, index) => ({
    shotIndex: index,
    caption: `${shot.type} on ${shot.description}. Camera is ${shot.angle.toLowerCase()} with ${shot.movement.toLowerCase()} energy.`,
    style: 'cinematic',
    imagePrompt: `${shot.type} cinematic frame, ${shot.lens}, ${shot.angle}, ${shot.lighting}, dramatic blocking, film still`,
  }))
}

function buildFallbackLightingPlan(scene) {
  const title = scene.title?.toUpperCase() || ''
  if (/^(END ?CARD|TITLE|SUPER|CARD|GRAPHIC)|\bEND ?CARD\b|\bTITLE CARD\b/.test(title)) {
    return normalizeLightingPlan({ applicable: false, reason: 'Graphics / title card — not photographed.' })
  }
  const isNight = title.includes('NIGHT')
  const isExt = /^EXT/.test(title)
  return normalizeLightingPlan({
    cameraWhiteBalanceK: isNight ? 3200 : 5600,
    keyLight: {
      fixture: isNight ? (isExt ? 'ARRI SkyPanel S60-C' : 'Aputure 300d II') : 'ARRI SkyPanel S60-C',
      modifier: isNight ? 'Fresnel spot, barn doors' : 'Large silk, 1/2 grid cloth',
      motivation: isNight ? (isExt ? 'Moon / street light' : 'Practical lamp') : 'Window daylight',
      position: 'Camera left, three-quarter, slightly high',
      azimuthDeg: -45, elevationDeg: 30, distanceM: 2.5,
      intensity: isNight ? 65 : 75, colorTempK: isNight ? (isExt ? 4300 : 3200) : 5600,
    },
    fillLight: {
      fixture: '4x4 UltraBounce', modifier: 'Passive bounce', motivation: 'Ambient room spill',
      position: 'Camera right, eye level', azimuthDeg: 40, elevationDeg: 0, distanceM: 1.8,
      intensity: isNight ? 20 : 35, colorTempK: isNight ? 3200 : 5600,
    },
    backLight: {
      fixture: 'Aputure 60x', modifier: 'Snoot', motivation: isNight ? 'Background practical' : 'Sky / window behind',
      position: 'Behind subject, camera right, high', azimuthDeg: 150, elevationDeg: 35, distanceM: 3,
      intensity: 45, colorTempK: isNight ? 4300 : 5600,
    },
    practicals: (scene.props || []).filter((p) => /lamp|light|candle|neon|tv|screen|monitor|fire/i.test(p)).slice(0, 3)
      .map((name) => ({ name, colorTempK: /neon|tv|screen|monitor/i.test(name) ? 6500 : 2700, dimmerPct: 40 })),
    ratio: isNight ? '4:1' : '2:1',
    ratioNote: `Estimated from the scene mood: ${scene.mood || 'neutral'}.`,
    notes: 'Fallback plan generated without the AI model — confirm positions on the tech scout.',
  })
}

function buildFallbackBlocking(scene) {
  const characters = (scene.characters || []).slice(0, 4)
  const spread = characters.length > 1 ? 60 / (characters.length - 1) : 0
  return {
    characters: characters.map((name, i) => {
      const startX = characters.length > 1 ? 20 + i * spread : 50
      return {
        name,
        start: { x: startX, y: 70 },
        end: { x: Math.min(90, startX + 15), y: 40 },
        movement: `Moves upstage through the scene's action`,
      }
    }),
    camera: { x: 50, y: 95 },
    notes: `Fallback blocking derived from character list — positions are illustrative, not scene-specific staging.`,
  }
}

function buildFallbackAnalysis(scriptText) {
  const parsed = quickParse(scriptText)
  const chunks = scriptText
    .split(/(?=^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.).+$)/gmi)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 8)

  const scenes = chunks.length
    ? chunks.map((chunk, index) => {
        const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean)
        const title = lines[0] || `Scene ${index + 1}`
        const body = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim()
        return {
          number: index + 1,
          title,
          description: body.slice(0, 220) || 'Scene extracted from script.',
          mood: title.includes('NIGHT') ? 'Tense' : 'Naturalistic',
          style: 'Grounded cinematic coverage',
          duration: `${Math.max(1, Math.round((body.split(/\s+/).length || 120) / 80))}m`,
          characters: Array.from(new Set((body.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/g) || []).slice(0, 4))),
          locations: [title.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, '').split('-')[0].trim()].filter(Boolean),
          props: [],
        }
      })
    : [{
        number: 1,
        title: 'Scene 1',
        description: scriptText.slice(0, 220),
        mood: 'Naturalistic',
        style: 'Grounded cinematic coverage',
        duration: parsed.runtime || '1m',
        characters: [],
        locations: [],
        props: [],
      }]

  return {
    themes: ['Character tension', 'Visual storytelling'],
    overallMood: 'Grounded dramatic tension',
    suggestedStyle: 'Naturalistic cinematic coverage',
    confidenceScore: 55,
    sceneBreakdown: {
      total: scenes.length,
      analyzed: scenes.length,
      flagged: 0,
    },
    characterArcs: [],
    ambiguities: [],
    scenes,
  }
}

function buildFallbackCameraSettings(style, mood, cameraOverride = null) {
  const selectedCamera = cameraOverride
    ? `${cameraOverride.brand} ${cameraOverride.model}`
    : 'Blackmagic Pocket Cinema Camera 6K Pro'

  return {
    camera: selectedCamera,
    sensor: cameraOverride?.sensor || 'Super 35',
    resolution: '4K UHD 24fps',
    codec: cameraOverride?.codec || 'ProRes 422',
    colorScience: cameraOverride?.color || 'Log',
    exposure: { value: 'T2.8', min: 'T2', max: 'T5.6' },
    iso: { value: 800, min: 200, max: 3200, nativeISOs: '800 / 3200' },
    shutter: { value: '1/48', angle: '180°' },
    whiteBalance: { value: mood?.toLowerCase().includes('night') ? '4300K' : '5600K', mode: 'Manual' },
    nd: { value: 'ND 0.6', stops: 2 },
    lens: { focal: style?.toLowerCase().includes('wide') ? '35mm' : '50mm', type: 'Prime', mount: cameraOverride?.mount || 'PL', tStop: 'T2.0' },
    filterPackage: '1/8 Black Pro-Mist',
    depthOfField: 'Moderate subject separation',
    notes: 'Fallback camera package generated locally.',
  }
}

// ─── Creative targets & production constraints ───────────────────────────────
const MOOD_DEFAULTS = ['Contemplative', 'Tense', 'Joyful', 'Melancholy', 'Mysterious']
const STYLE_DEFAULTS = ['Naturalistic', 'Stylized', 'Documentary', 'Expressionist', 'Classical']
const BUDGET_TIERS = ['Low', 'Medium', 'High', 'Unlimited']
const TIMELINES = ['Tight', 'Standard', 'Relaxed']

const uniqueStrings = (list) => [...new Set((list || []).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))]

function pickTier(value, allowed, fallback) {
  const found = allowed.find((tier) => tier.toLowerCase() === String(value || '').toLowerCase())
  return found || fallback
}

// Read cost/schedule drivers straight from the scene list when the model doesn't supply them.
function deriveProductionConstraints(scenes, scriptText = '') {
  const text = `${scriptText} ${scenes.map((sc) => `${sc.title} ${sc.description}`).join(' ')}`.toLowerCase()
  const nightExt = scenes.filter((sc) => /ext/i.test(sc.title || '') && /night/i.test(sc.title || '')).length
  const locations = new Set(scenes.flatMap((sc) => sc.locations || []).map((l) => l.toLowerCase())).size
  const drivers = []
  if (nightExt) drivers.push(`${nightExt} night exterior${nightExt > 1 ? 's' : ''}`)
  if (/\brain|storm|snow|fog\b/.test(text)) drivers.push('Weather / rain FX')
  if (/crowd|extras|party|stadium|market/.test(text)) drivers.push('Crowd / background extras')
  if (/\bcar\b|drive|driving|vehicle|chase/.test(text)) drivers.push('Vehicles / driving shots')
  if (/explosion|fight|stunt|gun|crash/.test(text)) drivers.push('Stunts or action')
  if (locations > 3) drivers.push(`${locations} distinct locations`)
  const minutes = scenes.reduce((sum, sc) => {
    const m = String(sc.duration || '').match(/(\d+)(?::(\d+))?/)
    return sum + (m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) : 1)
  }, 0)
  // ~3–4 script minutes per shooting day on an indie schedule, plus a day per extra location.
  const estimatedShootDays = Math.max(1, Math.ceil(minutes / 3.5 + Math.max(0, locations - 2) * 0.5))
  const score = drivers.length + (estimatedShootDays > 10 ? 2 : estimatedShootDays > 4 ? 1 : 0)
  return {
    budget: score >= 5 ? 'High' : score >= 2 ? 'Medium' : 'Low',
    timeline: drivers.length >= 3 || nightExt > 1 ? 'Tight' : estimatedShootDays > 8 ? 'Standard' : 'Relaxed',
    estimatedShootDays,
    drivers,
    rationale: drivers.length
      ? `Estimated from the script: ${drivers.join(', ')}.`
      : 'Contained script with few practical complications.',
  }
}

function normalizeTargets(breakdown, scriptText = '') {
  const scenes = breakdown.scenes || []
  const ct = breakdown.creativeTargets || {}
  const mood = ct.mood || scenes[0]?.mood?.split(/[,.;]/)[0] || 'Contemplative'
  const style = ct.style || (breakdown.suggestedStyle || '').split(/[,.;:]/)[0] || 'Naturalistic'
  const derived = deriveProductionConstraints(scenes, scriptText)
  const pc = breakdown.productionConstraints || {}
  return {
    ...breakdown,
    creativeTargets: {
      mood,
      moodOptions: uniqueStrings([mood, ...(ct.moodOptions || []), ...MOOD_DEFAULTS]),
      style,
      styleOptions: uniqueStrings([style, ...(ct.styleOptions || []), ...STYLE_DEFAULTS]),
      rationale: ct.rationale || breakdown.overallMood || '',
    },
    productionConstraints: {
      budget: pickTier(pc.budget, BUDGET_TIERS, derived.budget),
      timeline: pickTier(pc.timeline, TIMELINES, derived.timeline),
      estimatedShootDays: Number(pc.estimatedShootDays) > 0 ? Math.round(Number(pc.estimatedShootDays)) : derived.estimatedShootDays,
      drivers: uniqueStrings(pc.drivers).length ? uniqueStrings(pc.drivers) : derived.drivers,
      rationale: pc.rationale || derived.rationale,
    },
  }
}

// ─── Storyboard sketches (Claude draws SVG) ──────────────────────────────────
const SKETCH_EFFORT = process.env.CLAUDE_SKETCH_EFFORT || 'medium'

const SKETCH_SYSTEM = `You are a professional film storyboard artist. You draw storyboard panels as SVG in a realistic graphite-pencil style, the way panels look in a feature film's storyboard book.

Output rules (strict):
- Output ONE complete <svg> element and nothing else: no prose, no markdown fences.
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">, 16:9, no width/height attributes.
- Paper background: a full-size rect filled #f4f1ea. Draw a thin dark frame line inset 24px — the camera frame.
- Grayscale only (#111 to #e8e4da). Pencil look: varied stroke widths 1–5, stroke-linecap round, loose overlapping construction lines at low opacity, cross-hatching for shadows.
- Allowed elements: g, path, line, polyline, polygon, rect, circle, ellipse, defs, pattern, linearGradient, radialGradient, stop, filter, feTurbulence, feDisplacementMap, feGaussianBlur, clipPath, mask, use. NO text, NO <image>, NO <script>, NO <foreignObject>, NO external references, NO event attributes.
- Aim for a rich, finished panel of roughly 25–60 KB: many short, sketchy, slightly overlapping strokes (never one clean outline per shape), and never more than ~120 KB.

Drawing rules:
- Frame the shot exactly as the shot type demands (extreme wide → figures tiny in a big environment; wide → full bodies with surroundings; medium → waist up; medium close-up → chest up; close-up → face fills most of the frame; extreme close-up → eyes or a detail; insert → the object large and sharp; over-shoulder → blurred foreground shoulder/head on one side, subject facing camera on the other; POV → what the character sees).
- Draw like an experienced illustrator, not a diagram: realistic anatomy and proportions, believable weight and gesture, eyelines that read. At close sizes faces get modelled features (eyelids, brow ridge, nostrils, lips, jaw and cheekbone planes), hair is drawn as strands and clumps, hands have articulated fingers, clothing has folds and seams.
- Build ALL tone from hatching and cross-hatching (denser = darker); do not use large flat grey fills or plain rectangles for walls and shadows. Leave the brightest areas as untouched paper.
- Backgrounds have real objects drawn with perspective (furniture, windows with frames, signage shapes, street elements), simplified and lighter as they recede.
- Camera height and angle: eye level puts the horizon at the eyes; low angle looks up (horizon low, converging verticals); high angle looks down; top-down is overhead; Dutch tilts the horizon.
- Lens: wide lenses (≤28mm) show strong perspective and lots of background; normal (35–50mm) natural; long lenses (85mm+) compress depth, background soft and simplified.
- Depth of field: the focused subject has the darkest, sharpest lines; background lighter with less detail.
- Light must read at a glance — it is the most important thing on the panel. The key comes from the given side; the opposite side of every face, body and object is clearly dark with dense cross-hatching (for hard or high-ratio light, the shadow side is near-black). Cast shadows fall away from the key. Motivated sources (windows, lamps, neon) are drawn as bright shapes with light falling from them.
- Include the scene's real location details and props where the shot would see them.
- Camera movement: draw standard storyboard arrows in mid-gray inside the frame (push-in → arrows converging toward the subject; pull-out → arrows outward; pan/track → horizontal arrow; tilt → vertical arrow; handheld → small zigzag marks in a corner). Static → no arrows.`

function keySideOf(lightingPlan) {
  const az = lightingPlan?.keyLight?.azimuthDeg
  if (typeof az === 'number') return az === 0 ? 'the camera position (front)' : `camera ${az < 0 ? 'left' : 'right'}, ${Math.abs(az)}° off the lens axis`
  const pos = String(lightingPlan?.keyLight?.position || '').toLowerCase()
  if (pos.includes('right')) return 'camera right'
  if (pos.includes('left')) return 'camera left'
  if (pos.includes('top') || pos.includes('overhead')) return 'above'
  return 'camera left'
}

// Keep only a self-contained SVG; refuse anything that could execute or load remote content.
function sanitizeSvg(raw) {
  const start = raw.indexOf('<svg')
  const end = raw.lastIndexOf('</svg>')
  if (start === -1 || end === -1) throw new Error('model returned no SVG')
  const svg = raw.slice(start, end + 6)
  if (/<script|<foreignObject|<image|<iframe|<object|<embed|javascript:|\son[a-z]+\s*=/i.test(svg)) {
    throw new Error('SVG contained disallowed content')
  }
  // Only same-document references (#id) are allowed for href / url().
  if (/(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg) || /url\(\s*["']?(?!#)/i.test(svg)) {
    throw new Error('SVG contained external references')
  }
  if (svg.length > 200000) throw new Error('SVG too large')
  return svg
}

export async function generateStoryboardSketch(scene, shot, shotIndex) {
  if (!claude) {
    const err = new Error('Storyboard sketches need Claude — set ANTHROPIC_API_KEY in server/.env')
    err.status = 503
    throw err
  }
  const total = scene.shots?.length || 1
  const prompt = `Draw storyboard panel ${shotIndex + 1} of ${total} for this scene.

SCENE ${scene.number || ''}: ${scene.title || ''}
What happens: ${scene.description || ''}
Mood: ${scene.mood || ''}. Visual style: ${scene.style || ''}
Characters: ${(scene.characters || []).join(', ') || 'none named'}
Location: ${(scene.locations || []).join(', ') || 'unspecified'}
Props: ${(scene.props || []).join(', ') || 'none'}
Key light comes from ${keySideOf(scene.lightingPlan)}${scene.lightingPlan?.keyLight?.type ? ` (${scene.lightingPlan.keyLight.type})` : ''}.

THIS SHOT:
Type: ${shot.type}
Lens: ${shot.lens}
Angle: ${shot.angle}
Camera movement: ${shot.movement}
What we see: ${shot.description}
Lighting: ${shot.lighting}`

  const stream = claude.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 48000,
    output_config: { effort: SKETCH_EFFORT },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SKETCH_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to draw this panel')
  if (message.stop_reason === 'max_tokens') throw new Error('Sketch was cut off before it finished')
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return { svg: sanitizeSvg(text), model: message.model }
}

// ─── Exported functions ───────────────────────────────────────────────────────

export async function analyzeScript(scriptText) {
  // Claude's 1M-token context takes the whole screenplay; local models only get the first 12k chars.
  const prompt = SCRIPT_BREAKDOWN_PROMPT + (claude ? scriptText : scriptText.substring(0, 12000))
  try {
    const result = await callLLMText(prompt, 2048)
    return normalizeTargets(parseJSON(result), scriptText)
  } catch (error) {
    console.warn('[AI] Falling back to local script analysis:', error.message)
    return normalizeTargets(buildFallbackAnalysis(scriptText), scriptText)
  }
}

export async function generateCameraSettings(style, mood, cameraOverride = null) {
  // cameraOverride comes from project settings / request body
  const cameraClause = cameraOverride
    ? `The DoP is shooting on a ${cameraOverride.brand} ${cameraOverride.model} (${cameraOverride.sensor}, ${cameraOverride.codec}, ${cameraOverride.color}). All settings MUST be specific to this camera — use its native ISOs, exact codec names, and color science terminology.`
    : `Recommend the most suitable camera and settings for this production style.`

  const prompt = `${CAMERA_SETTINGS_PROMPT}${style}. Mood: ${mood}.

${cameraClause}

You MUST respond with ONLY this JSON object, no other text:
{
  "camera": "Exact camera model",
  "sensor": "Sensor spec",
  "resolution": "Chosen resolution and frame rate",
  "codec": "Exact codec name",
  "colorScience": "Log format and color space",
  "exposure": { "value": "T2.8", "min": "T1.4", "max": "T11" },
  "iso": { "value": 800, "min": 200, "max": 3200, "nativeISOs": "800 / 3200" },
  "shutter": { "value": "1/48", "angle": "180°" },
  "whiteBalance": { "value": "5600K", "mode": "Manual" },
  "nd": { "value": "ND 0.9", "stops": 3 },
  "lens": { "focal": "35mm", "type": "Spherical Prime", "mount": "PL", "tStop": "T1.5" },
  "filterPackage": "1/8 Black Pro-Mist",
  "depthOfField": "Shallow at T1.5 on 85mm",
  "notes": "Specific technical notes for this camera on this production"
}`
  try {
    const result = await callLLMText(prompt, 1024)
    return parseJSON(result)
  } catch (error) {
    console.warn('[AI] Falling back to local camera settings:', error.message)
    return buildFallbackCameraSettings(style, mood, cameraOverride)
  }
}

export async function generateShotList(scene) {
  const prompt = SHOT_LIST_PROMPT
    .replace('{title}', scene.title)
    .replace('{description}', scene.description)
    .replace('{mood}', scene.mood)
    .replace('{style}', scene.style)
    .replace('{characters}', (scene.characters || []).join(', '))
    .replace('{location}', (scene.locations || []).join(', '))
    .replace('{props}', (scene.props || []).join(', '))
    .replace('{lightingPlan}', summarizeLighting(scene.lightingPlan))
  try {
    const result = await callLLMText(prompt, 1200)
    return normalizeShots(parseJSON(result))
  } catch (error) {
    console.warn('[AI] Falling back to local shot list generation:', error.message)
    return buildFallbackShotList(scene)
  }
}

export async function generateStoryboard(shots) {
  return buildFallbackStoryboard(shots)
}

export async function generateLightingPlan(scene) {
  const timeOfDay = /night/i.test(scene.title || '')
    ? 'Night'
    : /dawn|dusk|magic hour/i.test(scene.title || '')
      ? 'Dawn/Dusk'
      : /evening/i.test(scene.title || '') ? 'Evening' : 'Day'
  const prompt = LIGHTING_PLAN_PROMPT
    .replace('{title}', scene.title || 'Scene')
    .replace('{description}', scene.description || 'Not described')
    .replace('{mood}', scene.mood || 'Neutral')
    .replace('{style}', scene.style || 'Naturalistic')
    .replace('{characters}', (scene.characters || []).join(', ') || 'None named')
    .replace('{location}', (scene.locations || []).join(', ') || 'Unspecified')
    .replace('{props}', (scene.props || []).join(', ') || 'None listed')
    .replace('{timeOfDay}', timeOfDay)
  try {
    const result = await callLLMText(prompt, 1600)
    return normalizeLightingPlan(parseJSON(result))
  } catch (error) {
    console.warn('[AI] Falling back to local lighting plan generation:', error.message)
    return buildFallbackLightingPlan(scene)
  }
}

export async function generateBlocking(scene) {
  const prompt = BLOCKING_PROMPT
    .replace('{title}', scene.title || 'Scene')
    .replace('{description}', scene.description || '')
    .replace('{mood}', scene.mood || 'Neutral')
    .replace('{characters}', (scene.characters || []).join(', ') || 'Unspecified')
    .replace('{location}', (scene.locations || []).join(', ') || 'Unspecified')
  try {
    const result = await callLLMText(prompt, 700)
    return normalizeBlocking(parseJSON(result))
  } catch (error) {
    console.warn('[AI] Falling back to local blocking generation:', error.message)
    return buildFallbackBlocking(scene)
  }
}

export async function getOnSetGuidance(sceneContext, shotPlan, cameraSettings, question) {
  const prompt = ON_SET_GUIDANCE_PROMPT
    .replace('{sceneContext}', JSON.stringify(sceneContext))
    .replace('{shotPlan}', JSON.stringify(shotPlan))
    .replace('{cameraSettings}', JSON.stringify(cameraSettings))
    .replace('{question}', question)
  return await callLLMText(prompt, 500, { expectJson: false })
}

export async function checkDeviations(planned, current) {
  const prompt = DEVIATION_CHECK_PROMPT
    .replace('{planned}', JSON.stringify(planned))
    .replace('{current}', JSON.stringify(current))
  const result = await callLLMText(prompt, 500)
  return parseJSON(result)
}

export async function refineShotPlan(scene, instruction) {
  const lowered = instruction.toLowerCase()
  const baseShots = buildFallbackShotList(scene)

  return baseShots.map((shot, index) => {
    const updated = { ...shot }
    if (lowered.includes('wider') && index === 0) updated.lens = '21mm'
    if (lowered.includes('closer') && index >= 1) updated.lens = '100mm'
    if (lowered.includes('handheld')) updated.movement = index === 0 ? 'Static' : 'Handheld'
    if (lowered.includes('dolly') || lowered.includes('push')) updated.movement = index === 1 ? 'Dolly' : updated.movement
    if (lowered.includes('simpler lighting')) updated.lighting = 'Single motivated key and negative fill for a faster company move'
    if (lowered.includes('more dynamic')) updated.angle = index % 2 === 0 ? 'Slightly Low' : updated.angle
    if (lowered.includes('reduce shot count')) return null
    updated.description = `${updated.description} Practical adjustment: ${instruction.trim()}.`
    return updated
  }).filter(Boolean).slice(0, lowered.includes('reduce shot count') ? 3 : 6)
}

// ─── On-set visual check — Claude looks at the live frame against the plan ────
const VISUAL_EFFORT = process.env.ONSET_VISUAL_EFFORT || 'medium'
const VISUAL_CATEGORIES = ['shotList', 'storyboard', 'lighting', 'cameraLens', 'composition', 'movement']

const VISUAL_SYSTEM = 'You are CineAssist, a director of photography and script supervisor standing next to the ' +
  'camera on set. You are given one live-view frame from the camera, the camera\'s current settings, and the ' +
  'pre-production plan (scenes, shot list, storyboard, lighting plan, camera package). Work out which scene and ' +
  'shot the crew is setting up, then compare what the frame actually shows against that plan. Judge only what is ' +
  'visible or reported — say "unknown" when the frame cannot tell you (e.g. movement from a single still). ' +
  'Suggestions must be concrete and doable in under a minute on set: name the light, the direction, the number ' +
  'of stops, the frame edge. Camera-left/right are from the camera\'s point of view.'

const statusEnum = { type: 'string', enum: ['match', 'minor', 'major', 'unknown'] }
const VISUAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['detected', 'overall', 'categories', 'lightingCheck', 'topActions', 'cameraAdjustments'],
  properties: {
    detected: {
      type: 'object',
      additionalProperties: false,
      required: ['sceneIndex', 'shotIndex', 'confidence', 'reasoning'],
      properties: {
        sceneIndex: { type: 'integer', description: '0-based index into the scene list, -1 if no scene fits' },
        shotIndex: { type: 'integer', description: '0-based index into that scene\'s shots, -1 if unclear' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        reasoning: { type: 'string' },
      },
    },
    overall: {
      type: 'object',
      additionalProperties: false,
      required: ['readiness', 'summary'],
      properties: {
        readiness: { type: 'string', enum: ['ready', 'adjust', 'not_ready'] },
        summary: { type: 'string' },
      },
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'status', 'observed', 'planned', 'suggestion'],
        properties: {
          key: { type: 'string', enum: VISUAL_CATEGORIES },
          status: statusEnum,
          observed: { type: 'string' },
          planned: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
    lightingCheck: {
      type: 'object',
      additionalProperties: false,
      required: ['applicable', 'keySideObserved', 'ratioObserved', 'colourObserved', 'lights'],
      properties: {
        applicable: { type: 'boolean', description: 'false when the scene has no lighting plan (graphics) or the frame shows no lit set' },
        keySideObserved: { type: 'string', description: 'Which side the dominant light falls from, camera POV, and how you can tell' },
        ratioObserved: { type: 'string', description: 'Estimated key:fill ratio on the face/subject, e.g. "about 2:1 — flatter than the planned 4:1"' },
        colourObserved: { type: 'string', description: 'Colour of key, fill and background as seen, vs. planned colour temperatures' },
        lights: {
          type: 'array',
          description: 'One entry per light in the plan (key, fill, back, additional, each practical) in plan order',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['role', 'planned', 'observed', 'status', 'fix'],
            properties: {
              role: { type: 'string' },
              planned: { type: 'string' },
              observed: { type: 'string' },
              status: statusEnum,
              fix: { type: 'string' },
            },
          },
        },
      },
    },
    topActions: { type: 'array', items: { type: 'string' } },
    cameraAdjustments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['property', 'value', 'reason'],
        properties: {
          property: { type: 'string', enum: ['fNumber', 'iso', 'shutterAngle', 'whiteBalanceK', 'ndStops'] },
          value: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

function describeShot(shot, i) {
  return `  Shot ${i + 1}: ${shot.type || ''} · ${shot.lens || ''} · ${shot.angle || ''} · movement: ${shot.movement || 'static'}` +
    `${shot.completedOnSet ? ' · [already shot]' : ''}\n    ${shot.description || ''}${shot.lighting ? `\n    Lighting: ${shot.lighting}` : ''}`
}

function describeCameraPackage(cs) {
  if (!cs) return 'Not set'
  const pick = (v) => (v && typeof v === 'object' ? v.value ?? v.recommended ?? JSON.stringify(v) : v)
  return [
    cs.camera?.body || cs.camera?.model || cs.cameraBody,
    cs.lens && `Lens: ${pick(cs.lens.focalLength) || pick(cs.lens)}`,
    cs.exposure && `Aperture: ${pick(cs.exposure.aperture) || pick(cs.exposure)}`,
    cs.iso && `ISO: ${pick(cs.iso)}`,
    cs.shutter && `Shutter: ${pick(cs.shutter)}`,
    cs.whiteBalance && `WB: ${pick(cs.whiteBalance)}`,
    cs.nd && `ND: ${pick(cs.nd)}`,
    cs.frameRate && `Frame rate: ${pick(cs.frameRate)}`,
  ].filter(Boolean).join(' · ')
}

function describeLiveCamera(cam) {
  if (!cam) return 'No camera state reported.'
  const parts = [
    cam.model, cam.lensModel,
    cam.focalLengthMm > 0 && `${Math.round(cam.focalLengthMm)}mm`,
    (cam.tStop || cam.fNumber) > 0 && `${cam.tStop > 0 ? 'T' : 'f/'}${cam.tStop || cam.fNumber}`,
    cam.isoAuto ? 'ISO auto' : cam.iso && `ISO ${cam.iso}`,
    cam.shutterAngle > 0 ? `${cam.shutterAngle}° shutter` : cam.shutter && `shutter ${cam.shutter}`,
    cam.frameRate > 0 && `${cam.frameRate} fps`,
    cam.whiteBalanceAuto ? 'AWB' : cam.whiteBalanceK > 0 && `${cam.whiteBalanceK}K`,
    `ND ${cam.ndStops > 0 ? `${cam.ndStops} stops` : 'clear'}`,
    cam.recording && 'RECORDING',
  ]
  return parts.filter(Boolean).join(' · ')
}

// Every light in the plan with full placement, so each one can be checked against the frame.
function describeLightingPlanFull(plan) {
  if (!plan || plan.applicable === false) return `Not lit (${plan?.reason || 'graphics / title card'}).`
  const side = (az) => (az == null ? 'position n/a' : az === 0 ? 'on the lens axis'
    : `${Math.abs(az)}° camera ${az < 0 ? 'left' : 'right'}${Math.abs(az) > 120 ? ' (behind subject)' : ''}`)
  const light = (label, l) => (l && (l.fixture || l.type) ? `- ${label}: ${l.fixture || l.type}${l.modifier ? ` + ${l.modifier}` : ''}; ` +
    `${side(l.azimuthDeg)}, ${l.elevationDeg ?? 0}° up${l.distanceM ? `, ${l.distanceM} m` : ''}; ` +
    `${l.colorTempK ? `${l.colorTempK}K` : l.color || ''}${l.gel ? `, gel ${l.gel}` : ''}; ${l.intensity ?? '?'}% output` +
    `${l.motivation ? `; motivated by ${l.motivation}` : ''}${l.notes ? `; ${l.notes}` : ''}` : '')
  return [
    light('Key', plan.keyLight), light('Fill', plan.fillLight), light('Back', plan.backLight),
    ...(plan.additionalLights || []).map((l) => light(l.role || 'Additional', l)),
    ...(plan.practicals || []).map((p) => `- Practical: ${p.name || 'practical'}${p.azimuthDeg != null ? `, ${side(p.azimuthDeg)}` : ''}` +
      `${p.colorTempK ? `, ${p.colorTempK}K` : ''}${p.dimmerPct != null ? `, dimmer ${p.dimmerPct}%` : ''}${p.note ? `; ${p.note}` : ''}`),
    `- Ratio: ${plan.ratio || 'n/a'}${plan.ratioNote ? ` (${plan.ratioNote})` : ''}`,
    plan.cameraWhiteBalanceK ? `- Camera WB: ${plan.cameraWhiteBalanceK}K` : '',
    plan.notes ? `- Notes: ${plan.notes}` : '',
  ].filter(Boolean).join('\n')
}

function buildVisualPlan(analysis, sceneIndex, shotIndex, frameStats) {
  const scenes = analysis.scenes || []
  const index = scenes.map((s, i) =>
    `[${i}] Scene ${s.number || i + 1}: ${s.title || ''} — ${(s.locations || []).join(', ') || 'location n/a'}; ` +
    `${(s.characters || []).join(', ') || 'no characters'}; ${String(s.description || '').slice(0, 220)}`).join('\n')

  const focus = Number.isInteger(sceneIndex) && scenes[sceneIndex] ? [sceneIndex] : scenes.map((_, i) => i)
  // Full detail for the selected scene, or for every scene (capped) when detecting from scratch.
  const detail = focus.slice(0, 12).map((i) => {
    const s = scenes[i]
    const boards = (s.storyboard || []).map((f) => `  Panel ${(f.shotIndex ?? 0) + 1}: ${f.caption || f.imagePrompt || ''}`).join('\n')
    return `=== Scene index ${i}: ${s.title || ''} ===
Description: ${s.description || ''}
Mood: ${s.mood || ''} · Style: ${s.style || ''}
Characters: ${(s.characters || []).join(', ') || 'none'} · Props: ${(s.props || []).join(', ') || 'none'}
Locations: ${(s.locations || []).join(', ') || 'n/a'}
SHOT LIST:
${(s.shots || []).map(describeShot).join('\n') || '  (none)'}
STORYBOARD:
${boards || '  (none)'}
LIGHTING PLAN:
${describeLightingPlanFull(s.lightingPlan)}
Movement / blocking: ${s.blocking?.cameraMovement || (s.shots || []).map((sh) => sh.movement).filter(Boolean).join('; ') || 'n/a'}`
  }).join('\n\n')

  return `ALL SCENES (for detection):
${index}

${Number.isInteger(sceneIndex) ? `The operator currently has scene index ${sceneIndex}${Number.isInteger(shotIndex) ? `, shot ${shotIndex + 1}` : ''} selected. Confirm or correct this from the frame.` : 'No scene is selected — detect it from the frame.'}

${detail}

PLANNED CAMERA PACKAGE: ${describeCameraPackage(analysis.cameraSettings)}${frameStats ? `\nMEASURED FROM FRAME (luma 0–255, camera POV): ${frameStats}` : ''}`
}

function normalizeVisualCheck(raw, analysis) {
  const scenes = analysis.scenes || []
  const d = raw?.detected || {}
  const sceneIndex = Number.isInteger(d.sceneIndex) && scenes[d.sceneIndex] ? d.sceneIndex : -1
  const shots = sceneIndex >= 0 ? scenes[sceneIndex].shots || [] : []
  const shotIndex = Number.isInteger(d.shotIndex) && shots[d.shotIndex] ? d.shotIndex : -1
  const byKey = new Map((raw?.categories || []).map((c) => [c.key, c]))
  return {
    detected: { sceneIndex, shotIndex, confidence: d.confidence || 'low', reasoning: d.reasoning || '' },
    overall: { readiness: raw?.overall?.readiness || 'adjust', summary: raw?.overall?.summary || '' },
    categories: VISUAL_CATEGORIES.map((key) => byKey.get(key) || { key, status: 'unknown', observed: '', planned: '', suggestion: '' }),
    lightingCheck: {
      applicable: raw?.lightingCheck?.applicable !== false,
      keySideObserved: raw?.lightingCheck?.keySideObserved || '',
      ratioObserved: raw?.lightingCheck?.ratioObserved || '',
      colourObserved: raw?.lightingCheck?.colourObserved || '',
      lights: (raw?.lightingCheck?.lights || []).slice(0, 12),
    },
    topActions: (raw?.topActions || []).slice(0, 5),
    cameraAdjustments: (raw?.cameraAdjustments || []).filter((a) => Number.isFinite(a.value)).slice(0, 5),
  }
}

export async function analyzeOnsetFrame(analysis, { imageBase64, mediaType = 'image/jpeg', reference, sceneIndex, shotIndex, camera, frameStats } = {}) {
  if (!claude) {
    const err = new Error('Visual on-set analysis needs Claude — set ANTHROPIC_API_KEY in server/.env')
    err.status = 503
    throw err
  }
  const plan = buildVisualPlan(analysis, sceneIndex, shotIndex, frameStats)
  const stream = claude.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: VISUAL_EFFORT, format: { type: 'json_schema', schema: VISUAL_SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: VISUAL_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'IMAGE 1 — live view from the camera right now:' },
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ...(reference ? [
          { type: 'text', text: `IMAGE 2 — the planned storyboard panel for scene index ${sceneIndex}, shot ${(shotIndex ?? 0) + 1} (pencil sketch from Generated Outputs). Compare framing, subject placement, angle and eyeline in IMAGE 1 against it; ignore that it is a drawing.` },
          { type: 'image', source: { type: 'base64', media_type: reference.mediaType, data: reference.data } },
        ] : []),
        {
          type: 'text',
          text: `${plan}

LIVE CAMERA SETTINGS: ${describeLiveCamera(camera)}

Check this frame against the plan. Fill every category: shotList (is this the planned shot / coverage), storyboard (does the framing match the panel), lighting (overall verdict vs. the lighting plan), cameraLens (focal length, stop, ISO, shutter, WB, ND vs. the package and the exposure you see), composition (headroom, lead room, eyeline, horizon, distractions in frame), movement (planned move and whether the setup supports it). Then do the LIGHTING PLAN CHECK in lightingCheck: go through every light in the plan (key, fill, back, each additional light, each practical) and say whether it is visibly doing its job — read the direction from shadow side, nose and cheek shadows, catchlights, rim/edge separation, background falloff and practicals in shot. Use the MEASURED FROM FRAME numbers for left/right balance, clipping and warm/cool cast. If a planned light is missing or on the wrong side, say exactly where to move it (side, height, distance) or what to dim/gel. Estimate the key:fill ratio and compare to the plan. Put the 3 most important fixes in topActions. Only add cameraAdjustments you are confident about from the frame and settings.`,
        },
      ],
    }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to analyse this frame')
  if (message.stop_reason === 'max_tokens') throw new Error('Visual check was cut off before it finished')
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return { ...normalizeVisualCheck(JSON.parse(text), analysis), model: message.model, usage: message.usage, checkedAt: new Date().toISOString() }
}
