import { useState } from 'react'
import { Palette, Shield, Bell, Download } from 'lucide-react'
import CameraPackageSelector from '../components/camera/CameraPackageSelector'
import { useProject } from '../context/ProjectContext'
import { loadCameraPrefs, saveCameraPrefs } from '../services/cameraPrefs'

export default function SettingsPage() {
  const { currentProject, selectedCamera, updateProject } = useProject()
  const [theme, setTheme] = useState('dark')
  const [highContrast, setHighContrast] = useState(false)
  const [_haptics, _setHaptics] = useState(true)
  const [notifications, setNotifications] = useState(true)
  const [privacy, setPrivacy] = useState('private')
  const [savingCamera, setSavingCamera] = useState(false)

  async function selectCamera(camera) {
    saveCameraPrefs({ ...loadCameraPrefs(), camera, budget: camera?.budget || '' })
    if (!currentProject?._id) return
    setSavingCamera(true)
    try {
      await updateProject({ cameraPackage: camera })
    } finally {
      setSavingCamera(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-slate-400 text-sm">Configure your CineAssist AI experience</p>
      </div>

      <div className="space-y-4">

        <div>
          <CameraPackageSelector
            value={selectedCamera}
            onChange={selectCamera}
            title="Camera Package"
            subtitle={currentProject?._id
              ? 'This updates the active project and future analysis runs. You can change it anytime after script analysis.'
              : 'Pick the package you want future uploads and analysis runs to use.'}
          />
          {savingCamera && <div className="text-xs text-slate-500 mt-2">Saving camera package to current project…</div>}
        </div>

        {/* ── Appearance ─────────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Appearance</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Theme</span>
              <select value={theme} onChange={e => setTheme(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="auto">System</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">High Contrast Mode</span>
              <button onClick={() => setHighContrast(!highContrast)} className={`w-10 h-5 rounded-full transition ${highContrast ? 'bg-cinema-500' : 'bg-slate-700'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition transform ${highContrast ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Privacy ───────────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Privacy & Data</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Default Project Privacy</span>
            <select value={privacy} onChange={e => setPrivacy(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
              <option value="private">Private</option>
              <option value="team">Team Only</option>
              <option value="shared">Shared</option>
            </select>
          </div>
        </div>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Notifications</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Push Notifications</span>
            <button onClick={() => setNotifications(!notifications)} className={`w-10 h-5 rounded-full transition ${notifications ? 'bg-cinema-500' : 'bg-slate-700'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition transform ${notifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* ── Export ────────────────────────────────────────────────────── */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-4 h-4 text-cinema-400" />
            <span className="text-sm font-medium text-white">Export Formats</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['PDF', 'CSV', 'EDL', 'ARRI Metadata', 'RED Metadata'].map(fmt => (
              <span key={fmt} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300">{fmt}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
