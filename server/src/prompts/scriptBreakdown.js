export const SCRIPT_BREAKDOWN_PROMPT = `You are an expert script supervisor and cinematography planner. Analyze the following screenplay text and produce a structured JSON breakdown.

INSTRUCTIONS:
1. Identify every scene (look for scene headings like INT./EXT., or logical scene breaks)
2. Extract all named characters and their roles
3. Identify all locations mentioned
4. List all significant props and set dressing
5. Identify themes, mood, and visual style suggestions
6. Flag any ambiguities that need directorial clarification

OUTPUT FORMAT (strict JSON):
{
  "themes": ["theme1", "theme2"],
  "overallMood": "descriptive mood string",
  "suggestedStyle": "visual style recommendation",
  "confidenceScore": 85,
  "sceneBreakdown": {
    "total": number,
    "analyzed": number,
    "flagged": number
  },
  "characterArcs": [
    { "name": "Character Name", "archetype": "archetype", "screenTime": "percentage%" }
  ],
  "ambiguities": [
    { "scene": sceneNumber, "note": "description of ambiguity" }
  ],
  "scenes": [
    {
      "number": 1,
      "title": "INT./EXT. LOCATION - TIME",
      "description": "Brief scene description",
      "mood": "Scene mood",
      "style": "Visual style for this scene",
      "duration": "estimated duration like 2:30",
      "characters": ["Character1", "Character2"],
      "locations": ["Location name"],
      "props": ["Prop1", "Prop2"]
    }
  ]
}

Be precise with scene headings. Estimate durations based on action/dialogue density.
If the script is short or incomplete, still extract what you can and note gaps in ambiguities.

SCRIPT TEXT:
`

export const CAMERA_SETTINGS_PROMPT = `Based on the overall visual style and mood of this film, recommend default camera settings.

OUTPUT FORMAT (strict JSON):
{
  "exposure": { "value": "f/2.8", "min": "f/1.4", "max": "f/22" },
  "iso": { "value": 800, "min": 100, "max": 12800 },
  "shutter": { "value": "1/48", "angle": "180°" },
  "whiteBalance": { "value": "5600K", "mode": "Daylight" },
  "nd": { "value": "ND 0.6", "stops": 2 },
  "lens": { "focal": "50mm", "type": "Prime", "mount": "PL", "tStop": "T1.5" },
  "resolution": "4K DCI (4096x2160)",
  "frameRate": "24fps",
  "codec": "ARRIRAW"
}

Tailor settings to the film's mood and style. For moody/intimate films prefer wider apertures and warmer color temps. For action, prefer faster shutter speeds and higher ISOs.

FILM STYLE: `
