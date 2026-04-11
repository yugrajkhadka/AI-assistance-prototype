export const sampleProject = {
  id: 'proj-001',
  name: 'The Last Frame',
  version: 'v2.4',
  syncStatus: 'synced',
  lastModified: '2026-04-10T14:30:00Z',
  director: 'Sarah Chen',
  dp: 'Marcus Rivera',
  runtime: '1h 47m',
  sceneCount: 42,
  shotCount: 187,
};

export const sampleScenes = [
  {
    id: 'sc-001', number: 1, title: 'INT. APARTMENT - MORNING',
    description: 'Elena wakes to the sound of rain. She reaches for the photo on her nightstand.',
    mood: 'Melancholy', style: 'Naturalistic', duration: '2:30',
    characters: ['Elena'], locations: ['Elena\'s Apartment'],
    props: ['Photo frame', 'Alarm clock', 'Rain-streaked window'],
    shots: [
      { id: 'sh-001', type: 'Wide', description: 'Establishing — bedroom in grey morning light', lens: '24mm', movement: 'Static', angle: 'Eye Level', lighting: 'Soft diffused window light, practicals off', duration: '8s', status: 'approved', confidence: 94, intent: 'establish' },
      { id: 'sh-002', type: 'Close-Up', description: 'Elena\'s hand reaching for the photo frame', lens: '85mm', movement: 'Slight push-in', angle: 'High', lighting: 'Key from window, fill bounce', duration: '4s', status: 'pending', confidence: 88, intent: 'detail' },
      { id: 'sh-003', type: 'Medium', description: 'Elena sits up, looks out the window', lens: '50mm', movement: 'Pan with subject', angle: 'Eye Level', lighting: 'Window backlight, soft fill', duration: '6s', status: 'approved', confidence: 91, intent: 'character' },
      { id: 'sh-004', type: 'Insert', description: 'Photo frame — young couple at the beach', lens: '100mm Macro', movement: 'Static', angle: 'Top Down', lighting: 'Practical lamp, warm tone', duration: '3s', status: 'revision', confidence: 76, intent: 'detail' },
    ],
    storyboard: [
      { id: 'sb-001', shotId: 'sh-001', caption: 'Wide establishing — grey morning atmosphere', style: 'cinematic' },
      { id: 'sb-002', shotId: 'sh-002', caption: 'Detail — hand reaching toward memory', style: 'cinematic' },
      { id: 'sb-003', shotId: 'sh-003', caption: 'Medium — Elena awakens to reality', style: 'cinematic' },
      { id: 'sb-004', shotId: 'sh-004', caption: 'Insert — the photograph anchors the past', style: 'cinematic' },
    ],
    lightingPlan: {
      keyLight: { type: 'Window (natural)', position: 'Camera Left', intensity: 70, color: '5600K' },
      fillLight: { type: 'Bounce board', position: 'Camera Right', intensity: 30, color: '5600K' },
      backLight: { type: 'None', position: '-', intensity: 0, color: '-' },
      practicals: ['Bedside lamp (warm, 2700K, dimmed)'],
      ratio: '3:1 key-to-fill',
      notes: 'Allow natural variation. No hard shadows on face.',
    },
  },
  {
    id: 'sc-002', number: 2, title: 'EXT. CITY STREET - DAY',
    description: 'Elena walks through the bustling city, lost in thought. The crowd flows around her.',
    mood: 'Isolation in crowd', style: 'Handheld realism', duration: '3:15',
    characters: ['Elena', 'Extras'], locations: ['Downtown Street'],
    props: ['Coffee cup', 'Headphones'],
    shots: [
      { id: 'sh-005', type: 'Wide', description: 'Tracking — Elena moves through the crowd', lens: '35mm', movement: 'Steadicam follow', angle: 'Eye Level', lighting: 'Natural daylight, overcast', duration: '12s', status: 'approved', confidence: 92, intent: 'establish' },
      { id: 'sh-006', type: 'Medium Close-Up', description: 'Elena\'s face — distant expression', lens: '85mm', movement: 'Handheld subtle', angle: 'Slightly Low', lighting: 'Overcast ambient', duration: '5s', status: 'approved', confidence: 89, intent: 'emotion' },
      { id: 'sh-007', type: 'Wide', description: 'High angle — Elena small among the crowd', lens: '16mm', movement: 'Static crane', angle: 'High', lighting: 'Natural top light', duration: '6s', status: 'pending', confidence: 85, intent: 'thematic' },
    ],
    storyboard: [
      { id: 'sb-005', shotId: 'sh-005', caption: 'Tracking wide — isolation in motion', style: 'cinematic' },
      { id: 'sb-006', shotId: 'sh-006', caption: 'MCU — internal world on her face', style: 'cinematic' },
      { id: 'sb-007', shotId: 'sh-007', caption: 'High wide — lost in the urban flow', style: 'cinematic' },
    ],
    lightingPlan: {
      keyLight: { type: 'Natural sun (overcast)', position: 'Top', intensity: 85, color: '6500K' },
      fillLight: { type: 'Ambient bounce', position: 'Omni', intensity: 60, color: '6500K' },
      backLight: { type: 'None', position: '-', intensity: 0, color: '-' },
      practicals: [],
      ratio: '2:1 natural',
      notes: 'Overcast preferred. If sun breaks through, use 12x12 silk overhead.',
    },
  },
  {
    id: 'sc-003', number: 3, title: 'INT. COFFEE SHOP - DAY',
    description: 'Elena meets her old friend David. Tension beneath casual conversation.',
    mood: 'Warm but uneasy', style: 'Classic coverage', duration: '4:45',
    characters: ['Elena', 'David'], locations: ['Corner Coffee Shop'],
    props: ['Coffee cups', 'Newspaper', 'Phone'],
    shots: [
      { id: 'sh-008', type: 'Wide', description: 'Establishing — coffee shop interior, Elena enters', lens: '24mm', movement: 'Static', angle: 'Eye Level', lighting: 'Warm interior practicals + window', duration: '6s', status: 'approved', confidence: 93, intent: 'establish' },
      { id: 'sh-009', type: 'Two-Shot', description: 'Elena and David at the table', lens: '40mm', movement: 'Slow dolly in', angle: 'Eye Level', lighting: 'Key from window, warm practicals fill', duration: '15s', status: 'approved', confidence: 90, intent: 'dialogue' },
      { id: 'sh-010', type: 'Over-Shoulder', description: 'Favoring Elena — listening to David', lens: '75mm', movement: 'Static', angle: 'Eye Level', lighting: 'Consistent with master', duration: '10s', status: 'pending', confidence: 87, intent: 'dialogue' },
      { id: 'sh-011', type: 'Over-Shoulder', description: 'Favoring David — revealing news', lens: '75mm', movement: 'Static', angle: 'Eye Level', lighting: 'Consistent with master', duration: '10s', status: 'approved', confidence: 87, intent: 'dialogue' },
      { id: 'sh-012', type: 'Close-Up', description: 'Elena\'s reaction — eyes shift', lens: '100mm', movement: 'Static', angle: 'Eye Level', lighting: 'Window key, warm tone', duration: '4s', status: 'revision', confidence: 82, intent: 'emotion' },
    ],
    storyboard: [
      { id: 'sb-008', shotId: 'sh-008', caption: 'Wide — warm haven from the street', style: 'cinematic' },
      { id: 'sb-009', shotId: 'sh-009', caption: 'Two-shot — surface comfort, hidden stakes', style: 'cinematic' },
      { id: 'sb-010', shotId: 'sh-010', caption: 'OTS Elena — guarded attention', style: 'cinematic' },
      { id: 'sb-011', shotId: 'sh-011', caption: 'OTS David — dropping the facade', style: 'cinematic' },
      { id: 'sb-012', shotId: 'sh-012', caption: 'CU Elena — the truth lands', style: 'cinematic' },
    ],
    lightingPlan: {
      keyLight: { type: 'Window (natural) + HMI augment', position: 'Camera Left', intensity: 65, color: '5200K' },
      fillLight: { type: 'Practicals (Edison bulbs)', position: 'Overhead + table', intensity: 40, color: '2700K' },
      backLight: { type: 'Kicker', position: 'Camera Right Rear', intensity: 25, color: '3200K' },
      practicals: ['Pendant lamps (2700K)', 'Wall sconces', 'Neon sign in bg (red/blue)'],
      ratio: '2.5:1 key-to-fill',
      notes: 'Motivated mixed lighting. Let practicals breathe. Eye lights via bounce.',
    },
  },
];

export const sampleAnalysis = {
  themes: ['Memory & Loss', 'Urban Isolation', 'Reconnection', 'Truth vs. Comfort'],
  overallMood: 'Contemplative / Bittersweet',
  suggestedStyle: 'Naturalistic with controlled compositions',
  confidenceScore: 91,
  sceneBreakdown: { total: 42, analyzed: 42, flagged: 3 },
  characterArcs: [
    { name: 'Elena', archetype: 'Reluctant Seeker', screenTime: '62%' },
    { name: 'David', archetype: 'Catalyst', screenTime: '18%' },
  ],
  ambiguities: [
    { scene: 7, note: 'Dialogue tone unclear — comedic or bitter?' },
    { scene: 19, note: 'Location described but never established in prior scenes' },
    { scene: 34, note: 'Character motivation shift needs directorial intent' },
  ],
};

export const sampleCameraSettings = {
  exposure: { value: 'f/2.8', min: 'f/1.4', max: 'f/22' },
  iso: { value: 800, min: 100, max: 12800 },
  shutter: { value: '1/48', angle: '180°' },
  whiteBalance: { value: '5600K', mode: 'Daylight' },
  nd: { value: 'ND 0.6', stops: 2 },
  lens: { focal: '50mm', type: 'Prime', mount: 'PL', tStop: 'T1.5' },
  resolution: '4K DCI (4096x2160)',
  frameRate: '24fps',
  codec: 'ARRIRAW',
};

export const approvalLog = [
  { id: 'al-001', user: 'Sarah Chen', role: 'Director', action: 'Approved', target: 'Scene 1 Shot List', timestamp: '2026-04-09T10:15:00Z', note: 'Good mood coverage' },
  { id: 'al-002', user: 'Marcus Rivera', role: 'DP', action: 'Revision Requested', target: 'Scene 1 Shot 4', timestamp: '2026-04-09T11:30:00Z', note: 'Macro too tight — try 85mm instead' },
  { id: 'al-003', user: 'Sarah Chen', role: 'Director', action: 'Approved', target: 'Scene 2 Storyboard', timestamp: '2026-04-09T14:00:00Z', note: '' },
  { id: 'al-004', user: 'Lisa Park', role: 'Producer', action: 'Flagged', target: 'Scene 3 Lighting', timestamp: '2026-04-10T09:00:00Z', note: 'HMI budget — can we use reflector instead?' },
];
