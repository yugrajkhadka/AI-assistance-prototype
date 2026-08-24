import { SCRIPT_BREAKDOWN_PROMPT, CAMERA_SETTINGS_PROMPT } from '../prompts/scriptBreakdown.js'
import { SHOT_LIST_PROMPT, STORYBOARD_PROMPT } from '../prompts/shotList.js'
import { LIGHTING_PLAN_PROMPT } from '../prompts/lightingPlan.js'
import { ON_SET_GUIDANCE_PROMPT, DEVIATION_CHECK_PROMPT } from '../prompts/cameraDirection.js'
import { quickParse } from './scriptParser.js'

const OLLAMA_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/api/generate'
const MODEL = process.env.LOCAL_LLM_MODEL || 'llama3'
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS || 4000)

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

function normalizeLightingPlan(plan) {
  return {
    keyLight: plan?.keyLight || {},
    fillLight: plan?.fillLight || {},
    backLight: plan?.backLight || {},
    practicals: Array.isArray(plan?.practicals) ? plan.practicals : [],
    ratio: plan?.ratio || '2:1',
    notes: plan?.notes || '',
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
  const isNight = scene.title?.toUpperCase().includes('NIGHT')
  return {
    keyLight: {
      type: isNight ? 'Directional practical key' : 'Soft bounced daylight key',
      position: '45 degrees from camera side',
      intensity: isNight ? 65 : 75,
      color: isNight ? '3200K' : '5600K',
    },
    fillLight: {
      type: 'Bounce fill',
      position: 'Opposite key side',
      intensity: isNight ? 25 : 35,
      color: isNight ? '3200K' : '5600K',
    },
    backLight: {
      type: 'Edge light',
      position: 'Behind subject',
      intensity: 45,
      color: isNight ? '4300K' : '5600K',
    },
    practicals: scene.props?.slice(0, 2) || [],
    ratio: isNight ? '4:1' : '2:1',
    notes: `Fallback lighting plan derived from scene mood: ${scene.mood || 'neutral'}.`,
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

// ─── Exported functions ───────────────────────────────────────────────────────

export async function analyzeScript(scriptText) {
  const prompt = SCRIPT_BREAKDOWN_PROMPT + scriptText.substring(0, 12000)
  try {
    const result = await callLocalLLMText(prompt, 2048)
    return parseJSON(result)
  } catch (error) {
    console.warn('[AI] Falling back to local script analysis:', error.message)
    return buildFallbackAnalysis(scriptText)
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
    const result = await callLocalLLMText(prompt, 1024)
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
  try {
    const result = await callLocalLLMText(prompt, 1200)
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
  return buildFallbackLightingPlan(scene)
}

export async function getOnSetGuidance(sceneContext, shotPlan, cameraSettings, question) {
  const prompt = ON_SET_GUIDANCE_PROMPT
    .replace('{sceneContext}', JSON.stringify(sceneContext))
    .replace('{shotPlan}', JSON.stringify(shotPlan))
    .replace('{cameraSettings}', JSON.stringify(cameraSettings))
    .replace('{question}', question)
  return await callLocalLLMText(prompt, 500, { expectJson: false })
}

export async function checkDeviations(planned, current) {
  const prompt = DEVIATION_CHECK_PROMPT
    .replace('{planned}', JSON.stringify(planned))
    .replace('{current}', JSON.stringify(current))
  const result = await callLocalLLMText(prompt, 500)
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
