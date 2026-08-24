const STORAGE_KEY = 'cineassist_camera_prefs'

export function loadCameraPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveCameraPrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  window.dispatchEvent(new CustomEvent('cineassist:camera-changed', { detail: prefs.camera || null }))
}

export function getSelectedCamera() {
  return loadCameraPrefs().camera || null
}
