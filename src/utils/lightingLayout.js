// Lighting-plan geometry for the overhead floor plan and storyboard shading.
//
// New plans carry explicit geometry per light (azimuthDeg: 0 = on the lens axis,
// ±90 = side, ±180 = behind the subject, negative = camera left; elevationDeg;
// distanceM). Older plans only have free-text positions, so those are parsed
// with the same rules the server uses — heights ("20° above her head") are never
// mistaken for horizontal angles.

const ROLE_STYLE = {
  key: { label: 'KEY', color: 'cinema' },
  fill: { label: 'FILL', color: 'amber' },
  back: { label: 'BACK', color: 'blue' },
  extra: { label: 'EXTRA', color: 'slate' },
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))
const isNum = (value) => typeof value === 'number' && Number.isFinite(value)

export function geometryFromText(position = '', role = 'key') {
  const t = String(position).toLowerCase()
  const left = /camera[ -]left|frame left|\bleft\b/.test(t)
  const right = /camera[ -]right|frame right|\bright\b/.test(t)
  const sign = left && !right ? -1 : right && !left ? 1 : role === 'fill' ? 1 : -1
  // "Behind" only when the LIGHT is behind the subject — not "tuck it behind the door jamb".
  const behind = /^\s*(?:\w+\s+){0,2}behind\b|behind (?:the )?(?:subject|talent|actor|him|her|them|\w+['’]s (?:head|shoulders?))|back ?light|\brim\b|3\/4[- ]back|three-quarter back|upstage/.test(t)
  // "Overhead" only as a rig position — not "reads as overhead office light".
  const overhead = /^\s*(?:top|overhead|directly (?:above|overhead))|top[- ](?:centre|center)|straight down|directly (?:above|overhead)/.test(t)
  const offAxis = t.match(/(\d{1,3})(?:\s*[–-]\s*\d{1,3})?\s*(?:°|deg|degrees?)\s*(?:off|from)/)
  let azimuth = offAxis ? clamp(Number(offAxis[1]), 0, 180) : behind || role === 'back' ? 150 : 45
  if (behind && azimuth < 100) azimuth = 150
  const elevation = overhead ? 80 : /\bhigh\b|above|down-?angle/.test(t) ? 35 : 10
  return { azimuthDeg: overhead && !left && !right ? 0 : sign * azimuth, elevationDeg: elevation }
}

const firstClause = (text = '', max = 60) => {
  const t = String(text).split(/(?<=[.;])\s|\s—\s|\n/)[0].trim()
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t
}

function colorTempOf(light) {
  if (isNum(light.colorTempK)) return light.colorTempK
  const m = String(light.color || '').match(/(\d{4,5})\s*K/i)
  return m ? Number(m[1]) : null
}

function toLight(data, role, id, label) {
  if (!data || (!data.fixture && !data.type && !data.position)) return null
  const parsed = geometryFromText(data.position, role)
  const colorTempK = colorTempOf(data)
  const style = ROLE_STYLE[role] || ROLE_STYLE.extra
  return {
    id,
    role,
    label: label || style.label,
    // Full role name for cards ("Insert key (hand ECU)"); `label` stays short for the plan.
    title: data.role || null,
    color: style.color,
    data,
    name: data.fixture || firstClause(data.type, 40),
    azimuthDeg: clamp(isNum(data.azimuthDeg) ? data.azimuthDeg : parsed.azimuthDeg, -180, 180),
    elevationDeg: isNum(data.elevationDeg) ? data.elevationDeg : parsed.elevationDeg,
    distanceM: isNum(data.distanceM) ? data.distanceM : role === 'back' ? 3 : 2,
    intensity: isNum(Number(data.intensity)) ? Number(data.intensity) : null,
    colorTempK,
    // Compact colour for tables/cards: "4300K, 1/8 plus green"; older plans stored prose here.
    colorShort: colorTempK ? `${colorTempK}K${data.gel ? `, ${data.gel}` : ''}` : firstClause(data.color, 32),
    // Short line for the plan; everything longer lives in the legend/cards.
    short: [colorTempK ? `${colorTempK}K` : '', isNum(Number(data.intensity)) ? `${data.intensity}%` : ''].filter(Boolean).join(' · '),
  }
}

// Graphics/title cards aren't photographed. New plans say so with applicable:false;
// older plans are recognised from their wording.
export function isUnlitPlan(plan = {}) {
  if (!plan || plan.applicable === false) return true
  const key = `${plan.keyLight?.fixture || ''} ${plan.keyLight?.type || ''}`
  return /no physical (key|light)|graphic composite|not photographed|vector logo/i.test(key)
}

export function getLights(plan = {}) {
  if (isUnlitPlan(plan)) return []
  const lights = [
    toLight(plan.keyLight, 'key', 'key'),
    toLight(plan.fillLight, 'fill', 'fill'),
    toLight(plan.backLight, 'back', 'back'),
    ...(plan.additionalLights || []).map((light, i) => toLight(light, 'extra', `extra-${i}`, (light.role || 'Extra').toUpperCase().slice(0, 12))),
  ]
  return lights.filter(Boolean)
}

export function getPracticals(plan = {}) {
  if (isUnlitPlan(plan)) return []
  return (plan.practicals || []).map((p, i) => {
    if (typeof p === 'string') {
      const k = p.match(/(\d{4})\s*K/i)
      const dim = p.match(/(\d{1,3})\s*%/)
      return { id: `P${i + 1}`, name: firstClause(p.split(/[:,—–(]/)[0], 48), colorTempK: k ? Number(k[1]) : null, dimmerPct: dim ? Number(dim[1]) : null, note: p }
    }
    return { id: `P${i + 1}`, ...p, name: p.name || `Practical ${i + 1}` }
  })
}

// Which side of the frame the key comes from, for storyboard shading.
export function getKeySide(lightingPlan) {
  const key = getLights(lightingPlan).find((light) => light.role === 'key')
  if (!key) return 'left'
  return key.azimuthDeg > 0 ? 'right' : 'left'
}

// Plain-English direction: "45° camera left", "behind, camera right", "overhead".
export function describeDirection(light) {
  const az = light.azimuthDeg
  const side = az < 0 ? 'camera left' : 'camera right'
  if (light.elevationDeg >= 75) return 'overhead'
  if (Math.abs(az) <= 10) return 'on the lens axis'
  if (Math.abs(az) >= 165) return 'directly behind'
  if (Math.abs(az) > 110) return `behind, ${side}`
  return `${Math.round(Math.abs(az))}° ${side}`
}
