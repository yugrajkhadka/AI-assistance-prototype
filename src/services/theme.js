// Appearance: dark / light / system theme and high-contrast mode.
// The choice is stored in localStorage and applied as attributes on <html>
// (data-theme="dark|light", data-contrast="high"), which index.css maps onto the
// colour palette — so every screen follows without per-component changes.

const KEY = 'cineassist_appearance'
const listeners = new Set()
let systemQuery = null

export function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      theme: ['dark', 'light', 'auto'].includes(saved.theme) ? saved.theme : 'dark',
      highContrast: Boolean(saved.highContrast),
    }
  } catch {
    return { theme: 'dark', highContrast: false }
  }
}

export function resolveTheme(theme) {
  if (theme !== 'auto') return theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// Apply without saving (used by the PDF renderer to force a theme for one page).
export function applyAppearance({ theme, highContrast }) {
  const root = document.documentElement
  const resolved = resolveTheme(theme)
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  if (highContrast) root.dataset.contrast = 'high'
  else delete root.dataset.contrast
  listeners.forEach((fn) => fn({ theme, resolved, highContrast }))
}

export function saveAppearance(next) {
  const merged = { ...loadAppearance(), ...next }
  try { localStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* private mode */ }
  applyAppearance(merged)
  return merged
}

export function onAppearanceChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Call once at start-up: applies the saved choice and follows the OS in "System" mode.
export function initAppearance() {
  applyAppearance(loadAppearance())
  if (!systemQuery && window.matchMedia) {
    systemQuery = window.matchMedia('(prefers-color-scheme: light)')
    systemQuery.addEventListener?.('change', () => {
      const current = loadAppearance()
      if (current.theme === 'auto') applyAppearance(current)
    })
  }
}
