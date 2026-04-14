import { getAIClient } from '../config/ai.js'
import { SCRIPT_BREAKDOWN_PROMPT, CAMERA_SETTINGS_PROMPT } from '../prompts/scriptBreakdown.js'
import { SHOT_LIST_PROMPT, STORYBOARD_PROMPT } from '../prompts/shotList.js'
import { LIGHTING_PLAN_PROMPT } from '../prompts/lightingPlan.js'
import { ON_SET_GUIDANCE_PROMPT, DEVIATION_CHECK_PROMPT } from '../prompts/cameraDirection.js'

async function callClaude(prompt, maxTokens = 4096) {
  const client = getAIClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  return response.content[0].text
}

function parseJSON(text) {
  // Extract JSON from the response, handling markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim()
  return JSON.parse(raw)
}

export async function analyzeScript(scriptText) {
  const prompt = SCRIPT_BREAKDOWN_PROMPT + scriptText.substring(0, 30000)
  const result = await callClaude(prompt, 8192)
  return parseJSON(result)
}

export async function generateCameraSettings(style, mood) {
  const prompt = CAMERA_SETTINGS_PROMPT + `${style}. Mood: ${mood}`
  const result = await callClaude(prompt, 1024)
  return parseJSON(result)
}

export async function generateShotList(scene) {
  const prompt = SHOT_LIST_PROMPT
    .replace('{title}', scene.title)
    .replace('{description}', scene.description)
    .replace('{mood}', scene.mood)
    .replace('{style}', scene.style)
    .replace('{characters}', scene.characters.join(', '))
    .replace('{location}', scene.locations.join(', '))
    .replace('{props}', scene.props.join(', '))

  const result = await callClaude(prompt, 4096)
  return parseJSON(result)
}

export async function generateStoryboard(shots) {
  const prompt = STORYBOARD_PROMPT.replace('{shots}', JSON.stringify(shots, null, 2))
  const result = await callClaude(prompt, 2048)
  return parseJSON(result)
}

export async function generateLightingPlan(scene) {
  const timeOfDay = scene.title.includes('NIGHT') ? 'Night'
    : scene.title.includes('MORNING') ? 'Morning'
    : scene.title.includes('EVENING') ? 'Evening'
    : 'Day'

  const prompt = LIGHTING_PLAN_PROMPT
    .replace('{title}', scene.title)
    .replace('{mood}', scene.mood)
    .replace('{style}', scene.style)
    .replace('{location}', scene.locations?.[0] || 'Unknown')
    .replace('{timeOfDay}', timeOfDay)

  const result = await callClaude(prompt, 2048)
  return parseJSON(result)
}

export async function getOnSetGuidance(sceneContext, shotPlan, cameraSettings, question) {
  const prompt = ON_SET_GUIDANCE_PROMPT
    .replace('{sceneContext}', JSON.stringify(sceneContext))
    .replace('{shotPlan}', JSON.stringify(shotPlan))
    .replace('{cameraSettings}', JSON.stringify(cameraSettings))
    .replace('{question}', question)

  return await callClaude(prompt, 2048)
}

export async function checkDeviations(planned, current) {
  const prompt = DEVIATION_CHECK_PROMPT
    .replace('{planned}', JSON.stringify(planned))
    .replace('{current}', JSON.stringify(current))

  const result = await callClaude(prompt, 1024)
  return parseJSON(result)
}
