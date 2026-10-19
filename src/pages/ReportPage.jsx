// Full cinematography report: the AI Analysis Dashboard followed by every
// scene's Generated Outputs, rendered with the very same components in their
// read-only print mode, so the PDF looks exactly like the app.
//
// Used two ways:
//   * in the app — "Download PDF" asks the server to print this page with Chrome
//     (falls back to the browser's print dialog if that isn't available);
//   * by the server's headless Chrome, which waits for window.__REPORT_READY__.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Printer, Loader2, Clapperboard, Camera, AlertTriangle } from 'lucide-react'
import AnalysisDashboard from './preproduction/AnalysisDashboard'
import GeneratedOutputs from './preproduction/GeneratedOutputs'
import { analysis as analysisApi, projects as projectsApi, exportApi } from '../services/api'
import useSketchProgress from '../hooks/useSketchProgress'
import { applyAppearance, loadAppearance, resolveTheme } from '../services/theme'

const DASHBOARD_VIEWS = ['scenes', 'characters', 'locations', 'props', 'themes']

// Layout widths match the server's PDF pages (A4 proportions): horizontal pages
// use the full desktop layout, vertical ones a narrower desktop layout so text
// stays readable on portrait A4.
const PAGE_WIDTH = { landscape: 1320, portrait: 1040 }

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 hidden md:inline">{label}</span>
      <div className="flex rounded-lg bg-slate-800 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1 rounded-md text-xs transition ${value === option.value ? 'bg-cinema-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
const OUTPUT_TABS = [
  { id: 'shots', label: 'Shot List' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'lighting', label: 'Lighting Plan' },
  { id: 'camera', label: 'Camera & Lens' },
  { id: 'composition', label: 'Composition' },
  { id: 'movement', label: 'Movement' },
]

// Resolve once storyboard sketches have been rasterised (no [data-raster-pending]).
function rastersSettled() {
  return new Promise((resolve) => {
    const started = Date.now()
    const check = () => {
      if (!document.querySelector('[data-raster-pending]') || Date.now() - started > 30000) resolve()
      else setTimeout(check, 100)
    }
    check()
  })
}

// Resolve once every <img> (storyboard sketches) has finished decoding.
function imagesSettled() {
  const pending = [...document.images].filter((img) => !img.complete)
  return Promise.all(pending.map((img) => new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  })))
}

function SectionTitle({ kicker, title, sub }) {
  return (
    <div className="report-heading mb-5 pb-3 border-b border-slate-800">
      <div className="text-[11px] uppercase tracking-widest text-cinema-400">{kicker}</div>
      <div className="text-2xl font-bold text-white">{title}</div>
      {sub && <div className="text-sm text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function CameraPackage({ settings }) {
  if (!settings) return null
  const rows = [
    ['Camera', settings.camera],
    ['Resolution / frame rate', settings.resolution],
    ['Codec', settings.codec],
    ['Color science', settings.colorScience],
    ['Exposure', settings.exposure?.value && `${settings.exposure.value}${settings.exposure.min ? ` (range ${settings.exposure.min}–${settings.exposure.max})` : ''}`],
    ['ISO', settings.iso?.value],
    ['Shutter', settings.shutter?.value && `${settings.shutter.value}${settings.shutter.angle ? ` · ${settings.shutter.angle}` : ''}`],
    ['White balance', settings.whiteBalance?.value],
    ['ND', settings.nd?.value],
    ['Lenses', [settings.lens?.type, settings.lens?.mount].filter(Boolean).join(' · ')],
    ['Filtration', settings.filterPackage],
  ].filter(([, value]) => value)
  if (rows.length === 0) return null
  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 break-inside-avoid">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="w-4 h-4 text-cinema-400" />
        <span className="text-sm font-medium text-white">Camera Package</span>
      </div>
      <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="text-slate-500 w-36 shrink-0">{label}</dt>
            <dd className="text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function ReportPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  // PDF options: initialised from the URL (the server's renderer passes them),
  // kept in state, and written back to the URL together so a refresh keeps them.
  const [params, setParams] = useSearchParams()
  const [options, setOptions] = useState(() => ({
    orientation: params.get('orientation') === 'portrait' ? 'portrait' : 'landscape',
    theme: ['dark', 'light'].includes(params.get('theme')) ? params.get('theme') : resolveTheme(loadAppearance().theme),
  }))
  const { orientation, theme: pdfTheme } = options
  const setOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }))
  useEffect(() => {
    setParams({ orientation, theme: pdfTheme }, { replace: true })
  }, [orientation, pdfTheme, setParams])

  // Preview (and print) in the PDF's theme; restore the app's own theme on leave.
  useEffect(() => {
    applyAppearance({ theme: pdfTheme, highContrast: false })
    return () => applyAppearance(loadAppearance())
  }, [pdfTheme])

  // Browser-print fallback uses the chosen orientation too.
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@page { size: A4 ${orientation}; margin: 0; }`
    document.head.appendChild(style)
    return () => style.remove()
  }, [orientation])

  useEffect(() => {
    let cancelled = false
    window.__REPORT_READY__ = false
    Promise.all([projectsApi.get(projectId), analysisApi.get(projectId)])
      .then(([p, a]) => {
        if (cancelled) return
        setProject(p.project || p)
        setAnalysis(a)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [projectId])

  // Tell the PDF renderer when the whole report — including sketches — is painted.
  useEffect(() => {
    if (!analysis && !error) return
    let cancelled = false
    Promise.all([document.fonts?.ready, rastersSettled()])
      .then(() => imagesSettled())
      .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      .then(() => { if (!cancelled) window.__REPORT_READY__ = true })
    return () => { cancelled = true }
  }, [analysis, error])

  // In the app, finish any storyboard panels still missing (and refresh as they land).
  // The server's headless PDF renderer (navigator.webdriver) only reads, never draws.
  const headless = typeof navigator !== 'undefined' && navigator.webdriver
  const { status: sketches } = useSketchProgress(analysis && !headless ? projectId : null, {
    autoStart: true,
    onUpdate: (fresh) => fresh?.scenes && setAnalysis(fresh),
  })

  const scenes = analysis?.scenes || []
  // "My_Script.docx (1)" -> "My_Script" for the title and file name.
  const projectTitle = (project?.name || 'Untitled Project').replace(/\s*\(\d+\)\s*$/, '').replace(/\.(docx?|pdf|txt|fdx|fountain|rtf)$/i, '')
  const fileName = `${projectTitle.replace(/[^\w\- ]+/g, '').trim() || 'CineAssist'} - Cinematography Report (${orientation === 'portrait' ? 'Vertical' : 'Horizontal'}).pdf`

  const download = async () => {
    setDownloading(true)
    try {
      const blob = await exportApi.reportPdf(projectId, { orientation, theme: pdfTheme })
      if (!(blob instanceof Blob)) throw new Error('PDF service unavailable')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      // No server-side Chrome (e.g. hosted backend): the browser prints the same layout.
      window.print()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="report min-h-full bg-[var(--app-bg)] text-slate-200">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-800 bg-[var(--app-bg)]/95 backdrop-blur">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-sm text-slate-400 truncate hidden xl:block">Report preview — exactly what the PDF contains</div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Orientation"
            value={orientation}
            onChange={(v) => setOption('orientation', v)}
            options={[{ value: 'landscape', label: 'Horizontal' }, { value: 'portrait', label: 'Vertical' }]}
          />
          <Segmented
            label="PDF theme"
            value={pdfTheme}
            onChange={(v) => setOption('theme', v)}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
          />
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={download}
            disabled={!analysis || downloading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cinema-500 hover:bg-cinema-600 disabled:opacity-50 text-sm font-medium text-white"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Building PDF… (up to a minute)' : 'Download PDF'}
          </button>
        </div>
      </div>

      {sketches && sketches.total > 0 && sketches.drawn < sketches.total && (
        <div className="print:hidden mx-6 mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200 flex items-center gap-2">
          {sketches.running ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>
            Storyboard sketches: {sketches.drawn} of {sketches.total} drawn.{' '}
            {sketches.running
              ? 'The rest are being drawn now (about 1–2 min each, three at a time) and appear here as they finish. Download once this reaches the total for a fully sketched PDF.'
              : sketches.available
                ? `${sketches.failed ? `${sketches.failed} failed${sketches.lastError ? ` (${sketches.lastError})` : ''}. ` : ''}Undrawn panels appear as quick placeholder sketches.`
                : 'Claude isn\'t configured on the server, so undrawn panels use quick placeholder sketches.'}
          </span>
        </div>
      )}
      {sketches && sketches.total > 0 && sketches.drawn >= sketches.total && (
        <div className="print:hidden mx-6 mt-4 p-3 rounded-lg border border-onset-500/30 bg-onset-500/10 text-sm text-onset-300">
          All {sketches.total} storyboard panels are drawn — the PDF will include every sketch.
        </div>
      )}

      {error && (
        <div className="m-8 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Couldn't load the report: {error}
        </div>
      )}
      {!analysis && !error && (
        <div className="m-8 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading report…</div>
      )}

      {analysis && (
        <div className="report-body px-10 py-8 mx-auto" style={{ maxWidth: PAGE_WIDTH[orientation] }}>
          {/* Cover */}
          <section className="report-cover">
            <div className="flex items-center gap-3 mb-10">
              <Clapperboard className="w-8 h-8 text-cinema-400" />
              <span className="text-lg font-semibold text-white">CineAssist AI</span>
            </div>
            <div className="text-[11px] uppercase tracking-widest text-cinema-400 mb-2">Cinematography Report</div>
            <h1 className="text-4xl font-bold text-white mb-2">{projectTitle.replace(/_/g, ' ')}</h1>
            <div className="text-sm text-slate-400 mb-8">
              Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              {analysis.suggestedStyle ? ` · ${analysis.suggestedStyle.split(/[.;]/)[0]}` : ''}
            </div>
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 mb-6">
              {[
                ['Scenes', scenes.length],
                ['Shots', scenes.reduce((n, sc) => n + (sc.shots?.length || 0), 0)],
                ['Characters', (analysis.characterArcs || []).length],
                ['Confidence', `${analysis.confidenceScore || 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                  <div className="text-2xl font-bold text-white">{value}</div>
                  <div className="text-xs text-slate-400 mt-1">{label}</div>
                </div>
              ))}
            </div>
            <CameraPackage settings={analysis.cameraSettings} />
            <div className="mt-6 p-4 rounded-xl border border-slate-800 bg-slate-900/40 break-inside-avoid">
              <div className="text-sm font-medium text-white mb-2">Contents</div>
              <ol className="text-xs text-slate-300 space-y-1 list-decimal list-inside">
                <li>AI Analysis Dashboard — creative targets, production constraints, scenes, characters, locations, props, themes</li>
                {scenes.map((sc, i) => (
                  <li key={i}>SC {sc.number || i + 1} · {sc.title} — shot list, storyboard, lighting plan, camera & lens, composition, movement</li>
                ))}
              </ol>
            </div>
          </section>

          {/* AI Analysis Dashboard */}
          <section className="report-page">
            <div className="report-heading text-[11px] uppercase tracking-widest text-cinema-400 mb-2">Part 1</div>
            <AnalysisDashboard printMode project={project} analysis={analysis} summary view={null} />
          </section>
          {DASHBOARD_VIEWS.map((view) => (
            <section key={view} className="report-section">
              <AnalysisDashboard printMode project={project} analysis={analysis} summary={false} view={view} />
            </section>
          ))}

          {/* Generated Outputs, scene by scene */}
          {scenes.map((scene, sceneIndex) => (
            <div key={sceneIndex}>
              {OUTPUT_TABS.map((tab, tabIndex) => (
                <section key={tab.id} className={tabIndex === 0 || tab.id === 'storyboard' || tab.id === 'lighting' ? 'report-page' : 'report-section'}>
                  {tabIndex === 0 ? (
                    <>
                      <SectionTitle
                        kicker={`Part 2 · Generated Outputs · Scene ${scene.number || sceneIndex + 1} of ${scenes.length}`}
                        title={scene.title}
                        sub={[scene.mood, scene.style, scene.duration, `${scene.shots?.length || 0} shots`].filter(Boolean).join(' · ')}
                      />
                      {scene.description && <p className="text-sm text-slate-300 leading-6 mb-5">{scene.description}</p>}
                    </>
                  ) : null}
                  <div className="report-heading flex items-center gap-2 mb-3">
                    <span className="text-xs font-mono text-cinema-400 bg-cinema-500/10 px-2 py-0.5 rounded">SC {scene.number || sceneIndex + 1}</span>
                    <span className="text-lg font-semibold text-white">{tab.label}</span>
                  </div>
                  <GeneratedOutputs printMode project={project} analysis={analysis} sceneIndex={sceneIndex} tab={tab.id} />
                </section>
              ))}
            </div>
          ))}

          <div className="mt-10 pt-4 border-t border-slate-800 text-[11px] text-slate-500">
            Generated by CineAssist AI. Lighting positions, lenses and schedules are planning recommendations — confirm on the tech scout.
          </div>
        </div>
      )}
    </div>
  )
}
