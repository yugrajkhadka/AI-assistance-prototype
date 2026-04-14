export const LIGHTING_PLAN_PROMPT = `You are a master gaffer and lighting designer for cinema. Design a lighting plan for this scene.

SCENE:
Title: {title}
Mood: {mood}
Style: {style}
Location: {location}
Time of Day: {timeOfDay}

INSTRUCTIONS:
- Design key, fill, and back lights
- Consider practical light sources in the scene
- Specify color temperatures in Kelvin
- Define intensity as percentage (0-100)
- Calculate lighting ratio
- Add practical notes for the crew

OUTPUT FORMAT (strict JSON):
{
  "keyLight": {
    "type": "Light type (e.g., HMI, LED panel, Window natural, Tungsten)",
    "position": "Camera Left|Camera Right|Overhead|Behind Subject",
    "intensity": 70,
    "color": "5600K"
  },
  "fillLight": {
    "type": "Light or modifier type",
    "position": "Position description",
    "intensity": 30,
    "color": "5600K"
  },
  "backLight": {
    "type": "Light type or None",
    "position": "Position or -",
    "intensity": 20,
    "color": "5600K"
  },
  "practicals": ["List of practical lights in the scene with color temps"],
  "ratio": "Key-to-fill ratio like 3:1",
  "notes": "Crew notes about the setup, things to watch for"
}

Match lighting to the mood: soft/diffused for intimate scenes, hard/contrasty for drama, natural for documentary style.`
