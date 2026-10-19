export const BLOCKING_PROMPT = `You are a director staging blocking for this scene — where actors start, how they move, and where they end up, so it reads clearly in coverage and matches the emotional beats.

SCENE:
Title: {title}
Description: {description}
Mood: {mood}
Characters: {characters}
Location: {location}

INSTRUCTIONS:
- Positions are percentages on a top-down floor plan: x=0 is screen-left, x=100 is screen-right, y=0 is upstage (furthest from camera), y=100 is downstage (closest to camera).
- Give every named character a start and end position, and a short line describing the movement/motivation between them.
- Camera position follows the same coordinate system — where the operator is standing to cover this blocking.
- Keep moves motivated by the scene's actual action, not decorative.

You MUST respond with ONLY this JSON object, no other text:
{
  "characters": [
    {
      "name": "MAYA",
      "start": { "x": 20, "y": 70 },
      "end": { "x": 55, "y": 40 },
      "movement": "Enters from screen left, moves upstage toward the crates as she searches"
    }
  ],
  "camera": { "x": 50, "y": 95 },
  "notes": "Staging logic — why the moves are blocked this way, any continuity or eyeline concerns"
}`
