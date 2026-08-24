import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, Circle, Square, Tag, Sliders, Grid3x3, Crosshair,
  Eye, EyeOff, Thermometer, Sun, Aperture, Clock, Film, Layers,
  Wifi, WifiOff, Battery, HardDrive, Monitor, CheckCircle2, Loader2
} from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { onset as onsetApi } from '../../services/api'

const framingGuides = [
  { id: 'thirds', label: 'Rule of Thirds', icon: Grid3x3 },
  { id: 'center', label: 'Center Cross', icon: Crosshair },
  { id: 'safe', label: 'Safe Zones', icon: Monitor },
  { id: 'aspect', label: 'Aspect Ratio', icon: Layers },
]

const settingOptions = {
  iso: [400, 800, 1250, 1600, 2000, 2500, 3200],
  whiteBalance: ['3200K', '4300K', '5600K', '6500K'],
  nd: ['Clear', 'ND 0.3', 'ND 0.6', 'ND 0.9', 'ND 1.2'],
  lens: ['24mm', '35mm', '40mm', '50mm', '65mm', '85mm', '100mm'],
  frameRate: ['23.98fps', '24fps', '25fps', '29.97fps', '30fps', '48fps', '50fps', '60fps'],
  shutterAngles: ['45°', '90°', '144°', '172.8°', '180°', '216°', '270°'],
  shutterSpeeds: ['1/24', '1/25', '1/48', '1/50', '1/60', '1/96', '1/100', '1/120', '1/125', '1/250'],
  tStops: ['T1.5', 'T2', 'T2.8', 'T4', 'T5.6', 'T8'],
  fStops: ['f/1.4', 'f/1.8', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8'],
}

const T_TO_F_MAP = {
  'T1.5': 'f/1.4',
  'T2': 'f/1.8',
  'T2.8': 'f/2.5',
  'T4': 'f/3.5',
  'T5.6': 'f/5',
  'T8': 'f/7.1',
}

const F_TO_T_MAP = Object.fromEntries(Object.entries(T_TO_F_MAP).map(([tStop, fStop]) => [fStop, tStop]))

const defaultCam = {
  exposure: { value: 'T2.8', tStop: 'T2.8', fStop: 'f/2.5' },
  iso: { value: 800 },
  shutter: { value: '1/48', angle: '180°', mode: 'angle' },
  whiteBalance: { value: '5600K', mode: 'Manual' },
  nd: { value: 'ND 0.6', stops: 2 },
  lens: { focal: '50mm', tStop: 'T2.8', fStop: 'f/2.5', type: 'Prime', mount: 'PL' },
  resolution: '4K DCI',
  frameRate: '24fps',
  codec: 'ProRes 422 HQ',
}

function parseFrameRate(frameRate = '24fps') {
  const numeric = Number.parseFloat(String(frameRate).replace('fps', ''))
  return Number.isFinite(numeric) ? numeric : 24
}

function formatShutterSpeed(frameRate, angle) {
  const fps = parseFrameRate(frameRate)
  const angleValue = Number.parseFloat(String(angle).replace('°', '')) || 180
  const denominator = Math.max(1, Math.round((360 * fps) / angleValue))
  return `1/${denominator}`
}

function formatShutterAngle(frameRate, speed) {
  const fps = parseFrameRate(frameRate)
  const parts = String(speed).split('/')
  const denominator = Number(parts[1] || parts[0])
  if (!denominator) return '180°'
  const angle = (360 * fps) / denominator
  return `${Math.round(angle * 10) / 10}°`
}

function normalizeCameraSettings(cameraSettings) {
  const settings = cameraSettings || defaultCam
  const frameRate = settings.frameRate || defaultCam.frameRate
  const shutterValue = settings.shutter?.value || defaultCam.shutter.value
  const shutterAngle = settings.shutter?.angle || formatShutterAngle(frameRate, shutterValue)
  const tStop = settings.exposure?.tStop || settings.lens?.tStop || settings.exposure?.value || defaultCam.exposure.tStop
  const fStop = settings.exposure?.fStop || settings.lens?.fStop || T_TO_F_MAP[tStop] || defaultCam.exposure.fStop

  return {
    ...defaultCam,
    ...settings,
    frameRate,
    exposure: {
      ...defaultCam.exposure,
      ...settings.exposure,
      value: settings.exposure?.value || tStop,
      tStop,
      fStop,
    },
    shutter: {
      ...defaultCam.shutter,
      ...settings.shutter,
      value: shutterValue,
      angle: shutterAngle,
    },
    lens: {
      ...defaultCam.lens,
      ...settings.lens,
      tStop: settings.lens?.tStop || tStop,
      fStop: settings.lens?.fStop || fStop,
    },
  }
}

export default function LiveCamera() {
  const { currentProject, analysisData, setAnalysisData } = useProject()
  const [onsetData, setOnsetData] = useState(null)
  const [selectedScene, setSelectedScene] = useState(0)
  const [selectedShot, setSelectedShot] = useState(0)
  const [recording, setRecording] = useState(false)
  const [overlays, setOverlays] = useState({ thirds: true, center: false, safe: true, aspect: false })
  const [showHUD, setShowHUD] = useState(true)
  const [currentTake, setCurrentTake] = useState(1)
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    if (currentProject?._id) onsetApi.getData(currentProject._id).then(setOnsetData).catch(() => {})
  }, [currentProject?._id])

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices?.enumerateDevices?.()
      ?.then((entries) => {
        if (cancelled) return
        const cameras = entries.filter((entry) => entry.kind === 'videoinput')
        setDevices(cameras)
        if (!selectedDeviceId && cameras[0]) setSelectedDeviceId(cameras[0].deviceId)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedDeviceId])

  useEffect(() => () => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
  }, [])

  const scenes = onsetData?.scenes || analysisData?.scenes || []
  const scene = scenes[selectedScene] || { title: 'No Scene', shots: [], mood: '', style: '', characters: [], locations: [] }
  const shot = scene.shots?.[selectedShot] || { type: 'N/A', lens: '', movement: '', description: '', _id: null }
  const cam = useMemo(() => normalizeCameraSettings(onsetData?.cameraSettings || analysisData?.cameraSettings || defaultCam), [analysisData?.cameraSettings, onsetData?.cameraSettings])

  const connectedLabel = useMemo(() => {
    const device = devices.find((entry) => entry.deviceId === selectedDeviceId)
    return device?.label || (selectedDeviceId ? 'Connected Camera' : 'No Camera Selected')
  }, [devices, selectedDeviceId])

  const toggleOverlay = (id) => setOverlays((current) => ({ ...current, [id]: !current[id] }))

  const persistCamera = async (payload) => {
    if (!currentProject?._id) return
    setSavingSettings(true)
    try {
      const result = await onsetApi.updateCameraSettings(currentProject._id, payload)
      const updatedCameraSettings = normalizeCameraSettings(result.cameraSettings)
      setOnsetData((current) => current ? { ...current, cameraSettings: updatedCameraSettings } : current)
      if (analysisData) setAnalysisData({ ...analysisData, cameraSettings: updatedCameraSettings })
    } finally {
      setSavingSettings(false)
    }
  }

  const startCamera = async () => {
    try {
      setStreamError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        audio: false,
      })
      streamRef.current?.getTracks?.().forEach((track) => track.stop())
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStreaming(true)
    } catch (error) {
      setStreamError(error.message || 'Could not access the connected camera.')
      setStreaming(false)
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStreaming(false)
  }

  const updateSimpleSetting = async (key, value) => {
    if (key === 'iso') return persistCamera({ iso: { ...cam.iso, value } })
    if (key === 'whiteBalance') return persistCamera({ whiteBalance: { ...cam.whiteBalance, value } })
    if (key === 'nd') return persistCamera({ nd: { ...cam.nd, value } })
    if (key === 'lens') return persistCamera({ lens: { ...cam.lens, focal: value } })
    if (key === 'frameRate') {
      const shutter = {
        ...cam.shutter,
        value: formatShutterSpeed(value, cam.shutter.angle),
        angle: formatShutterAngle(value, cam.shutter.value),
      }
      return persistCamera({ frameRate: value, shutter })
    }
  }

  const updateShutterFromAngle = async (angle) => {
    const value = formatShutterSpeed(cam.frameRate, angle)
    await persistCamera({ shutter: { ...cam.shutter, angle, value, mode: 'angle' } })
  }

  const updateShutterFromSpeed = async (value) => {
    const angle = formatShutterAngle(cam.frameRate, value)
    await persistCamera({ shutter: { ...cam.shutter, value, angle, mode: 'speed' } })
  }

  const updateExposureFromTStop = async (tStop) => {
    const fStop = T_TO_F_MAP[tStop] || cam.exposure.fStop
    await persistCamera({
      exposure: { ...cam.exposure, value: tStop, tStop, fStop },
      lens: { ...cam.lens, tStop, fStop },
    })
  }

  const updateExposureFromFStop = async (fStop) => {
    const tStop = F_TO_T_MAP[fStop] || cam.exposure.tStop
    await persistCamera({
      exposure: { ...cam.exposure, value: tStop, tStop, fStop },
      lens: { ...cam.lens, tStop, fStop },
    })
  }

  const completeShot = async () => {
    if (!currentProject?._id || !shot._id) return
    const result = await onsetApi.completeShot(currentProject._id, selectedScene, shot._id, { notes: `Completed take ${currentTake} on live camera.` })
    const updatedShot = result.shot
    const updatedScenes = scenes.map((item, sceneIndex) => sceneIndex !== selectedScene
      ? item
      : { ...item, shots: item.shots.map((entry) => ((entry._id || entry.id) === (updatedShot._id || updatedShot.id) ? updatedShot : entry)) })
    setOnsetData((current) => current ? { ...current, scenes: updatedScenes } : current)
    if (analysisData) setAnalysisData({ ...analysisData, scenes: updatedScenes })
    setCurrentTake((take) => take + 1)
  }

  return (
    <div className="animate-fadeIn -m-6">
      <div className="flex flex-col xl:flex-row h-auto xl:h-[calc(100vh-3rem)]">
        <div className="flex-1 flex flex-col bg-black relative min-h-[55vh]">
          <div className="flex-1 relative overflow-hidden">
            {streaming ? (
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black flex items-center justify-center">
                <div className="text-center max-w-sm px-6">
                  <Camera className="w-16 h-16 text-slate-700 mx-auto mb-3" />
                  <div className="text-slate-300 text-sm">Connect a browser-visible camera to preview live video.</div>
                  <div className="text-slate-500 text-xs mt-2">This supports webcams and capture devices exposed through the browser. Camera-body control is mirrored in-app through realistic settings logic.</div>
                  {streamError && <div className="text-red-400 text-xs mt-3">{streamError}</div>}
                </div>
              </div>
            )}

            {overlays.thirds && (
              <div className="absolute inset-4 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/15" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/15" />
                <div className="absolute top-1/3 left-0 right-0 border-t border-white/15" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-white/15" />
              </div>
            )}
            {overlays.center && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <Crosshair className="w-12 h-12 text-white/20" />
              </div>
            )}
            {overlays.safe && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-[5%] border border-dashed border-red-500/20 rounded" />
                <div className="absolute inset-[10%] border border-dashed border-yellow-500/15 rounded" />
              </div>
            )}

            {recording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded bg-red-600/90">
                <Circle className="w-3 h-3 fill-white text-white animate-pulse" />
                <span className="text-white text-xs font-medium">REC</span>
                <span className="text-white/70 text-xs">TAKE {currentTake}</span>
              </div>
            )}

            {showHUD && (
              <>
                <div className="absolute top-3 right-4 flex flex-wrap justify-end gap-3 text-[11px]">
                  <div className={`flex items-center gap-1 ${streaming ? 'text-white/50' : 'text-red-300/70'}`}>
                    {streaming ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    <span>{connectedLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/50">
                    <Battery className="w-3 h-3" />
                    <span>87%</span>
                  </div>
                  <div className="flex items-center gap-1 text-white/50">
                    <HardDrive className="w-3 h-3" />
                    <span>{cam.codec}</span>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-12 pb-3 px-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-wrap gap-4 text-[11px] text-white/70">
                      <div><div className="text-white/40">T-STOP</div><div className="text-white font-mono">{cam.exposure.tStop}</div></div>
                      <div><div className="text-white/40">F-STOP</div><div className="text-white font-mono">{cam.exposure.fStop}</div></div>
                      <div><div className="text-white/40">ISO</div><div className="text-white font-mono">{cam.iso?.value}</div></div>
                      <div><div className="text-white/40">SHUTTER</div><div className="text-white font-mono">{cam.shutter?.angle} / {cam.shutter?.value}</div></div>
                      <div><div className="text-white/40">WB</div><div className="text-white font-mono">{cam.whiteBalance?.value}</div></div>
                      <div><div className="text-white/40">LENS</div><div className="text-white font-mono">{cam.lens?.focal}</div></div>
                    </div>
                    <div className="text-right text-[11px]">
                      <div className="text-white/40">SCENE {scene.number} / SHOT {selectedShot + 1} / TAKE {currentTake}</div>
                      <div className="text-white font-medium">{shot.type} — {shot.lens}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="bg-slate-950 border-t border-slate-800 flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {framingGuides.map((guide) => (
                <button
                  key={guide.id}
                  onClick={() => toggleOverlay(guide.id)}
                  className={`p-2 rounded-lg transition ${overlays[guide.id] ? 'bg-cinema-500/20 text-cinema-400' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                  title={guide.label}
                >
                  <guide.icon className="w-4 h-4" />
                </button>
              ))}
              <div className="w-px h-6 bg-slate-800 mx-1 hidden lg:block" />
              <button onClick={() => setShowHUD((current) => !current)} className={`p-2 rounded-lg transition ${showHUD ? 'text-white' : 'text-slate-600'}`} title="Toggle HUD">
                {showHUD ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={completeShot} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition">
                <Tag className="w-3.5 h-3.5" /> Complete Shot
              </button>
              <button
                onClick={() => {
                  if (recording) setCurrentTake((take) => take + 1)
                  setRecording((current) => !current)
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  recording ? 'bg-red-600 hover:bg-red-700' : 'bg-red-600/20 hover:bg-red-600/40 border-2 border-red-500'
                }`}
              >
                {recording ? <Square className="w-5 h-5 text-white fill-white" /> : <Circle className="w-5 h-5 text-red-400 fill-red-500" />}
              </button>
              <button onClick={streaming ? stopCamera : startCamera} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition">
                {streaming ? 'Disconnect Feed' : 'Start Feed'}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Take {currentTake}</span>
              <Sliders className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        <div className="w-full xl:w-[26rem] bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800 space-y-3">
            <div>
              <div className="text-sm font-medium text-white mb-2">Live Camera Feed</div>
              <select
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Default Browser Camera</option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm font-medium text-white mb-2">Scene Selector</div>
              <div className="flex gap-1 flex-wrap">
                {scenes.map((item, index) => (
                  <button
                    key={item._id || item.id || index}
                    onClick={() => { setSelectedScene(index); setSelectedShot(0); setCurrentTake(1) }}
                    className={`px-2 py-1 rounded text-xs transition ${
                      selectedScene === index ? 'bg-cinema-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    SC {item.number || index + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 border-b border-slate-800">
            <div className="text-xs text-slate-500 mb-1">{scene.title}</div>
            <div className="text-xs text-slate-600">{scene.mood} · {scene.style}</div>
          </div>

          <div className="max-h-64 overflow-y-auto border-b border-slate-800">
            <div className="p-2 space-y-1">
              {(scene.shots || []).map((item, index) => (
                <button
                  key={item._id || item.id || index}
                  onClick={() => { setSelectedShot(index); setCurrentTake((item.takes || 0) + 1) }}
                  className={`w-full text-left p-2.5 rounded-lg transition ${
                    selectedShot === index ? 'bg-cinema-500/15 border border-cinema-500/30' : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-cinema-400">{index + 1}</span>
                    <span className="text-xs text-white truncate flex-1">{item.type}</span>
                    {item.completedOnSet && <CheckCircle2 className="w-3.5 h-3.5 text-onset-400" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 truncate pl-5">{item.description}</div>
                  <div className="flex gap-2 mt-1 pl-5">
                    <span className="text-[10px] text-slate-600">{item.lens}</span>
                    <span className="text-[10px] text-slate-600">{item.movement}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 space-y-3 overflow-y-auto">
            <div className="text-xs font-medium text-white">Realistic Camera Settings</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Thermometer className="w-3 h-3 text-cinema-400" /> ISO</div>
                <select value={cam.iso.value} onChange={(event) => updateSimpleSetting('iso', Number(event.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.iso.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Sun className="w-3 h-3 text-cinema-400" /> White Balance</div>
                <select value={cam.whiteBalance.value} onChange={(event) => updateSimpleSetting('whiteBalance', event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.whiteBalance.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Film className="w-3 h-3 text-cinema-400" /> Frame Rate</div>
                <select value={cam.frameRate} onChange={(event) => updateSimpleSetting('frameRate', event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.frameRate.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Layers className="w-3 h-3 text-cinema-400" /> ND</div>
                <select value={cam.nd.value} onChange={(event) => updateSimpleSetting('nd', event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.nd.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Clock className="w-3 h-3 text-cinema-400" /> Shutter Angle</div>
                <select value={cam.shutter.angle} onChange={(event) => updateShutterFromAngle(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.shutterAngles.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Clock className="w-3 h-3 text-cinema-400" /> Shutter Speed</div>
                <select value={cam.shutter.value} onChange={(event) => updateShutterFromSpeed(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.shutterSpeeds.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Aperture className="w-3 h-3 text-cinema-400" /> T-Stop</div>
                <select value={cam.exposure.tStop} onChange={(event) => updateExposureFromTStop(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.tStops.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Aperture className="w-3 h-3 text-cinema-400" /> F-Stop</div>
                <select value={cam.exposure.fStop} onChange={(event) => updateExposureFromFStop(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.fStops.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="p-2 rounded-lg bg-slate-800/60 col-span-2">
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-400"><Camera className="w-3 h-3 text-cinema-400" /> Lens Focal Length</div>
                <select value={cam.lens.focal} onChange={(event) => updateSimpleSetting('lens', event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {settingOptions.lens.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs text-slate-400 leading-5">
              Shutter angle and speed auto-convert from the active frame rate. T-stop and F-stop also stay synchronized so the operator sees both transmission and geometric aperture values.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
