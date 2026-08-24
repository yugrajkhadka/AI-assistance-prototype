const OLLAMA_URL = 'http://localhost:11434/api/generate'
const MODEL = 'llama3'

// Core helper — enforces JSON output, fixes "Unexpected token H" error
async function ollamaJSON(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      format: 'json', // key fix — forces llama3 to output pure JSON
    }),
  })
  if (!response.ok) throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
  const data = await response.json()
  const raw = data.response
  const jsonStart = raw.indexOf('{')
  const jsonEnd = raw.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) throw new Error(`LLM returned no JSON. Got: ${raw.substring(0, 120)}`)
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
}

async function analyzeScript(scriptText) {
  return ollamaJSON(`You are an expert film director, cinematographer, and script analyst.
Analyze the following script and extract scenes, characters, locations, props, themes, and estimated runtime. Highlight ambiguities and provide confidence scores.
Script:\n${scriptText}
Respond with ONLY a JSON object, no explanation:
{"themes":[],"overallMood":"","suggestedStyle":"","confidenceScore":85,"sceneBreakdown":{"total":0,"analyzed":0,"flagged":0},"characterArcs":[{"name":"","archetype":"","screenTime":""}],"ambiguities":[{"scene":1,"note":""}],"scenes":[{"number":1,"title":"","description":"","mood":"","style":"","duration":"","characters":[],"locations":[],"props":[]}]}`)
}

async function generateShotList(scenes) {
  return ollamaJSON(`You are an expert cinematographer. Create a detailed shot list for each scene including shot type, camera angle, movement, lens suggestion, and intent. Optimize for cinematic storytelling.
Scenes:\n${JSON.stringify(scenes, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"scenes":[{"number":1,"shots":[{"type":"Wide Shot","description":"","lens":"35mm","movement":"Static","angle":"Eye Level","lighting":"Natural","duration":"5 sec","intent":"establish","confidence":90}]}]}`)
}

async function generateStoryboard(shotList) {
  return ollamaJSON(`You are a cinematic storyboard artist. Generate storyboard descriptions for each shot with visual composition, lighting mood, character blocking, and camera perspective.
Shot List:\n${JSON.stringify(shotList, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"scenes":[{"number":1,"storyboard":[{"shotIndex":0,"caption":"","style":"cinematic","imagePrompt":""}]}]}`)
}

async function generateLightingPlan(scenes) {
  return ollamaJSON(`You are an expert gaffer and cinematographer. Create a lighting plan for each scene including key light, fill light, backlight, practicals, and ratios. Adapt based on mood, time of day, and genre.
Scene Details:\n${JSON.stringify(scenes, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"scenes":[{"number":1,"lightingPlan":{"keyLight":{"type":"","position":"","intensity":80,"color":""},"fillLight":{"type":"","position":"","intensity":40,"color":""},"backLight":{"type":"","position":"","intensity":60,"color":""},"practicals":[],"ratio":"3:1","notes":""}}]}`)
}

async function generateCameraSettings(shotDetails) {
  return ollamaJSON(`You are an expert director of photography. Recommend camera settings, lens choices, focal lengths, and movements. Optimize for cinematic quality and storytelling impact.
Shot Details:\n${JSON.stringify(shotDetails, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"cameraSettings":{"exposure":{"value":"f/2.8","min":"f/1.8","max":"f/5.6"},"iso":{"value":800,"min":100,"max":3200},"shutter":{"value":"1/50","angle":"180°"},"whiteBalance":{"value":"5600K","mode":"Manual"},"nd":{"value":"ND0.6","stops":2},"lens":{"focal":"35mm","type":"Prime","mount":"PL","tStop":"T1.5"},"resolution":"4K","frameRate":"24fps","codec":"ProRes 422"}}`)
}

async function refineShotList(currentShots, userInstruction) {
  return ollamaJSON(`You are a cinematography expert. Refine the shot list based on this instruction: "${userInstruction}". Maintain cinematic consistency while applying changes.
Current Shots:\n${JSON.stringify(currentShots, null, 2)}
Respond with ONLY a JSON object using the same shot list structure as the input, no explanation.`)
}

async function getLiveCameraGuidance(liveCameraData) {
  return ollamaJSON(`You are an AI cinematography assistant helping filmmakers on set. Based on current scene conditions, provide real-time recommendations. Keep it concise and actionable.
Live Data:\n${JSON.stringify(liveCameraData, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"recommendations":{"camera":"","lighting":"","composition":"","urgency":"low"}}`)
}

async function compareShotToLive(plannedShot, liveData) {
  return ollamaJSON(`You are an AI cinematography assistant on set. Compare the planned shot with the current live scene and identify deviations. Suggest quick fixes.
Planned:\n${JSON.stringify(plannedShot, null, 2)}\nLive:\n${JSON.stringify(liveData, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"deviations":[{"aspect":"","planned":"","actual":"","fix":""}],"overallMatch":85,"quickFixes":[]}`)
}

async function onSetChat(userQuery, context = {}) {
  return ollamaJSON(`You are an AI cinematography assistant helping filmmakers on set. Answer concisely and practically.
Context: ${JSON.stringify(context)}\nQuestion: ${userQuery}
Respond with ONLY a JSON object, no explanation:
{"answer":"","tips":[],"relatedSettings":{}}`)
}

async function analyzeShotCoverage(shotLogs) {
  return ollamaJSON(`You are an expert script supervisor. Analyze captured shots and determine coverage completeness. Identify missing angles, continuity errors, and improvement suggestions.
Captured Data:\n${JSON.stringify(shotLogs, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"coverageComplete":false,"missingAngles":[],"continuityErrors":[{"shot":1,"issue":""}],"suggestions":[],"completionPercentage":75}`)
}

async function formatForExport(shotList) {
  return ollamaJSON(`Convert the following shot list into structured export-ready formats.
Shot List:\n${JSON.stringify(shotList, null, 2)}
Respond with ONLY a JSON object, no explanation:
{"pdf":{"title":"","sections":[]},"csv":{"headers":[],"rows":[]},"edl":{"events":[]}}`)
}

async function runFullPipeline(scriptText) {
  const analysis = await analyzeScript(scriptText)
  const shotData = await generateShotList(analysis.scenes)
  const scenesWithShots = analysis.scenes.map((scene, i) => ({
    ...scene,
    shots: shotData.scenes?.[i]?.shots || [],
  }))
  const [storyboardData, lightingData, cameraData] = await Promise.all([
    generateStoryboard(scenesWithShots),
    generateLightingPlan(scenesWithShots),
    generateCameraSettings(scenesWithShots),
  ])
  const finalScenes = scenesWithShots.map((scene, i) => ({
    ...scene,
    storyboard: storyboardData.scenes?.[i]?.storyboard || [],
    lightingPlan: lightingData.scenes?.[i]?.lightingPlan || {},
  }))
  return { ...analysis, scenes: finalScenes, cameraSettings: cameraData.cameraSettings }
}

module.exports = {
  analyzeScript,
  generateShotList,
  generateStoryboard,
  generateLightingPlan,
  generateCameraSettings,
  refineShotList,
  getLiveCameraGuidance,
  compareShotToLive,
  onSetChat,
  analyzeShotCoverage,
  formatForExport,
  runFullPipeline,
}
