// In dev: Vite proxy forwards /api -> localhost:3002, so BASE = '/api'
// In prod: VITE_API_URL must point to the deployed backend (e.g. https://your-backend.onrender.com/api)
const BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('cineassist_token')
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers })
  } catch {
    // Network error — backend unreachable
    throw new Error(
      'Cannot reach the backend server. Make sure the server is running (cd server && npm start) ' +
      'or set VITE_API_URL to your deployed backend URL.'
    )
  }

  if (!res.ok) {
    // 405 on GitHub Pages means no backend is deployed at this origin
    if (res.status === 405 || res.status === 404) {
      const isGitHubPages = window.location.hostname.includes('github.io')
      if (isGitHubPages) {
        throw new Error(
          'No backend server connected. This app requires a running backend. ' +
          'See the README for deployment instructions.'
        )
      }
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  // Handle blob responses (PDF, CSV)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/pdf') || ct.includes('text/csv')) return res.blob()
  return res.json()
}

// Auth
export const auth = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
}

// Upload
export const upload = {
  file: (formData) => request('/upload', { method: 'POST', body: formData }),
  text: (data) => request('/upload/text', { method: 'POST', body: JSON.stringify(data) }),
}

// Analysis
export const analysis = {
  run: (projectId, cameraPrefs) => request(`/analysis/${projectId}`, {
    method: 'POST',
    body: JSON.stringify({ cameraPrefs }),
  }),
  get: (projectId) => request(`/analysis/${projectId}`),
  runScene: (projectId, sceneIndex) => request(`/analysis/${projectId}/scene/${sceneIndex}`, {
    method: 'POST',
  }),
  refineScene: (projectId, sceneIndex, instruction) => request(`/analysis/${projectId}/scene/${sceneIndex}/refine`, {
    method: 'POST',
    body: JSON.stringify({ instruction }),
  }),
}
// Shots
export const shots = {
  updateStatus: (projectId, sceneIndex, shotId, data) =>
    request(`/shots/${projectId}/scene/${sceneIndex}/shot/${shotId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorder: (projectId, sceneIndex, order) =>
    request(`/shots/${projectId}/scene/${sceneIndex}/reorder`, { method: 'PUT', body: JSON.stringify({ order }) }),
  approve: (projectId, data) =>
    request(`/shots/${projectId}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  batchApprove: (projectId, sceneIndex) =>
    request(`/shots/${projectId}/scene/${sceneIndex}/batch-approve`, { method: 'POST' }),
}

// Projects
export const projects = {
  list: () => request('/projects'),
  get: (id) => request(`/projects/${id}`),
  update: (id, data) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
}

// On-Set
export const onset = {
  getData: (projectId) => request(`/onset/${projectId}`),
  completeShot: (projectId, sceneIndex, shotId, data) =>
    request(`/onset/${projectId}/scene/${sceneIndex}/shot/${shotId}/complete`, { method: 'POST', body: JSON.stringify(data || {}) }),
  chat: (projectId, question, sceneIndex) =>
    request(`/onset/${projectId}/chat`, { method: 'POST', body: JSON.stringify({ question, sceneIndex }) }),
  updateCameraSettings: (projectId, data) =>
    request(`/onset/${projectId}/camera-settings`, { method: 'PATCH', body: JSON.stringify(data) }),
  addNote: (projectId, sceneIndex, shotId, text) =>
    request(`/onset/${projectId}/scene/${sceneIndex}/shot/${shotId}/note`, { method: 'POST', body: JSON.stringify({ text }) }),
}

// Export
export const exportApi = {
  pdf: (projectId) => request(`/export/${projectId}/pdf`),
  csv: (projectId) => request(`/export/${projectId}/csv`),
}
