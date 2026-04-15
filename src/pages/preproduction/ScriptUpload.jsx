import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, Cloud, Type, Shield, Globe, CheckCircle2,
  AlertCircle, Loader2, Film, Clock, Hash, X, RefreshCw, HardDrive
} from 'lucide-react'
import { upload as uploadApi } from '../../services/api'
import { useProject } from '../../context/ProjectContext'

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ScriptUpload() {
  const navigate = useNavigate()
  const { setProjectFromUpload } = useProject()
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState('idle') // idle | preview | uploading | parsing | complete
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null) // file object for preview
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [settings, setSettings] = useState({
    language: 'English',
    privacy: 'private',
    format: 'auto-detect',
  })

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const validateFile = (file) => {
    const maxSize = 50 * 1024 * 1024 // 50MB
    const allowedExts = ['.pdf', '.fdx', '.fountain', '.txt']
    const ext = '.' + file.name.split('.').pop().toLowerCase()

    if (!allowedExts.includes(ext)) {
      return `Unsupported file type: ${ext}. Accepted: PDF, FDX, Fountain, TXT`
    }
    if (file.size > maxSize) {
      return `File too large (${formatFileSize(file.size)}). Maximum: 50MB`
    }
    return null
  }

  const selectFile = (file) => {
    const err = validateFile(file)
    if (err) {
      setUploadError(err)
      return
    }
    setUploadError(null)
    setSelectedFile(file)
    setUploadState('preview')
  }

  const doUpload = async () => {
    if (!selectedFile) return
    setUploadState('uploading')
    setUploadError(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('script', selectedFile)
      formData.append('language', settings.language)
      formData.append('privacy', settings.privacy)

      // Simulate progress since fetch doesn't support upload progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) { clearInterval(progressInterval); return 90 }
          return prev + Math.random() * 15
        })
      }, 300)

      setUploadState('parsing')
      const result = await uploadApi.file(formData)

      clearInterval(progressInterval)
      setUploadProgress(100)

      setProjectFromUpload({ _id: result.projectId, name: result.file.name, ...result.parseResult })
      setUploadedFile({
        name: result.file.name,
        size: result.file.size,
        ...result.parseResult,
        projectId: result.projectId,
      })
      setUploadState('complete')
    } catch (err) {
      setUploadError(err.message)
      setUploadState('preview') // Go back to preview so user can retry
      setUploadProgress(0)
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) selectFile(file)
  }, [settings])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return
    setUploadState('uploading')
    setUploadError(null)
    setUploadProgress(0)

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90 }
        return prev + Math.random() * 15
      })
    }, 300)

    try {
      setUploadState('parsing')
      const result = await uploadApi.text({
        text: pasteText,
        name: 'Pasted Script',
        language: settings.language,
        privacy: settings.privacy,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      setProjectFromUpload({ _id: result.projectId, name: result.file.name, ...result.parseResult })
      setUploadedFile({
        name: result.file.name,
        ...result.parseResult,
        projectId: result.projectId,
      })
      setUploadState('complete')
    } catch (err) {
      clearInterval(progressInterval)
      setUploadError(err.message)
      setUploadState('idle')
      setUploadProgress(0)
      setPasteMode(true)
    }
  }

  const resetUpload = () => {
    setUploadState('idle')
    setUploadedFile(null)
    setSelectedFile(null)
    setUploadError(null)
    setUploadProgress(0)
    setPasteMode(false)
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Script Upload</h1>
        <p className="text-slate-400">Upload your screenplay to begin AI-powered cinematography planning.</p>
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 animate-fadeIn">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-300 mb-1">Upload Failed</div>
              <div className="text-sm text-red-400/80">{uploadError}</div>
            </div>
            <button onClick={() => setUploadError(null)} className="text-red-400/50 hover:text-red-400 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          {uploadError.includes('backend') || uploadError.includes('server') || uploadError.includes('Cannot reach') ? (
            <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="text-xs text-slate-400 space-y-1">
                <div className="font-medium text-slate-300">To fix this:</div>
                <div>1. Start the backend: <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cinema-400">cd server && npm install && npm start</code></div>
                <div>2. Make sure MongoDB is running locally, or set <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cinema-400">MONGODB_URI</code> in <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cinema-400">server/.env</code></div>
                <div>3. The frontend dev server proxies <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cinema-400">/api</code> to <code className="px-1.5 py-0.5 rounded bg-slate-900 text-cinema-400">localhost:3001</code> automatically</div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* File Drop Zone — idle state */}
      {uploadState === 'idle' && !pasteMode && (
        <>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all ${
              dragActive
                ? 'border-cinema-400 bg-cinema-500/10 scale-[1.01]'
                : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
            }`}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 transition ${dragActive ? 'text-cinema-400 scale-110' : 'text-slate-600'}`} />
            <div className="text-lg font-medium text-white mb-2">
              {dragActive ? 'Drop your script here' : 'Drag & drop your screenplay'}
            </div>
            <p className="text-sm text-slate-400 mb-4">Supports PDF, FDX, Fountain, and plain text formats (max 50MB)</p>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg cursor-pointer transition font-medium text-sm active:scale-95">
              <FileText className="w-4 h-4" />
              Browse Files
              <input ref={fileInputRef} type="file" accept=".pdf,.fdx,.fountain,.txt" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={() => setPasteMode(true)}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 transition active:scale-[0.99]"
            >
              <Type className="w-5 h-5 text-cinema-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-white">Paste Text</div>
                <div className="text-xs text-slate-500">Paste screenplay content directly</div>
              </div>
            </button>
            <button className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 transition opacity-50 cursor-not-allowed">
              <Cloud className="w-5 h-5 text-cinema-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-white">Import from Cloud</div>
                <div className="text-xs text-slate-500">Google Drive, Dropbox, iCloud (coming soon)</div>
              </div>
            </button>
          </div>

          <div className="mt-6 p-4 rounded-lg border border-slate-800 bg-slate-900/30">
            <div className="text-sm font-medium text-white mb-3">Upload Settings</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Language</label>
                <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Japanese</option><option>Korean</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Privacy</label>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-onset-400" />
                  <select value={settings.privacy} onChange={(e) => setSettings({ ...settings, privacy: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                    <option value="private">Private</option><option value="team">Team Only</option><option value="shared">Shared</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Format</label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-500" />
                  <select value={settings.format} onChange={(e) => setSettings({ ...settings, format: e.target.value })} className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                    <option value="auto-detect">Auto-Detect</option><option value="fdx">Final Draft (FDX)</option><option value="fountain">Fountain</option><option value="pdf">PDF</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* File Preview — confirm before upload */}
      {uploadState === 'preview' && selectedFile && (
        <div className="animate-fadeIn">
          <div className="p-6 rounded-xl border border-slate-700 bg-slate-900/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cinema-500/15 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-cinema-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium truncate">{selectedFile.name}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {formatFileSize(selectedFile.size)}</span>
                  <span className="uppercase">{selectedFile.name.split('.').pop()}</span>
                </div>
              </div>
              <button onClick={resetUpload} className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={doUpload}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition active:scale-[0.98]"
              >
                <Upload className="w-4 h-4" />
                Upload & Analyze
              </button>
              <button
                onClick={resetUpload}
                className="px-4 py-2.5 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition"
              >
                Choose Different File
              </button>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-lg border border-slate-800 bg-slate-900/30">
            <div className="text-sm font-medium text-white mb-3">Upload Settings</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Language</label>
                <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Japanese</option><option>Korean</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Privacy</label>
                <select value={settings.privacy} onChange={(e) => setSettings({ ...settings, privacy: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option value="private">Private</option><option value="team">Team Only</option><option value="shared">Shared</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Format</label>
                <select value={settings.format} onChange={(e) => setSettings({ ...settings, format: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white">
                  <option value="auto-detect">Auto-Detect</option><option value="fdx">Final Draft (FDX)</option><option value="fountain">Fountain</option><option value="pdf">PDF</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paste Mode */}
      {pasteMode && (uploadState === 'idle' || uploadState === 'preview') && (
        <div className="animate-fadeIn">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your screenplay text here...

INT. APARTMENT - MORNING

Elena wakes to the sound of rain. She reaches for the photo on her nightstand.

                    ELENA
          Another grey morning..."
            className="w-full h-64 bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-cinema-500 transition"
          />
          {pasteText.trim() && (
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
              <span>{pasteText.split(/\s+/).filter(Boolean).length} words</span>
              <span>{pasteText.split('\n').length} lines</span>
            </div>
          )}
          <div className="flex gap-3 mt-3">
            <button onClick={resetUpload} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Back</button>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-5 py-2 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition active:scale-[0.98]"
            >
              Analyze Script
            </button>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {(uploadState === 'uploading' || uploadState === 'parsing') && (
        <div className="text-center py-12 sm:py-16 animate-fadeIn">
          <Loader2 className="w-12 h-12 text-cinema-400 mx-auto mb-4 animate-spin" />
          <div className="text-lg font-medium text-white mb-2">
            {uploadState === 'uploading' ? 'Uploading script...' : 'Parsing & extracting data...'}
          </div>
          <div className="w-64 mx-auto bg-slate-800 rounded-full h-2 mt-4 overflow-hidden">
            <div
              className="bg-cinema-500 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(uploadProgress, 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-500 mt-3">
            {uploadState === 'uploading'
              ? 'Validating format and encoding...'
              : 'Extracting scenes, characters, and metadata...'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {selectedFile ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})` : 'Processing pasted text...'}
          </p>
        </div>
      )}

      {/* Upload Complete */}
      {uploadState === 'complete' && uploadedFile && (
        <div className="animate-fadeIn">
          <div className="p-6 rounded-xl border border-onset-500/30 bg-onset-500/5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-onset-400" />
              <div>
                <div className="text-white font-medium">{uploadedFile.name}</div>
                <div className="text-sm text-onset-400">Successfully parsed</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-4">
              {[
                { icon: Film, label: 'Scenes', value: uploadedFile.scenes },
                { icon: Clock, label: 'Runtime', value: uploadedFile.runtime },
                { icon: Hash, label: 'Pages', value: uploadedFile.pages },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                  <Icon className="w-5 h-5 text-cinema-400 mx-auto mb-1" />
                  <div className="text-lg font-bold text-white">{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-4 text-xs text-slate-400">
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.characters} characters</span>
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.locations} locations</span>
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.format} format</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={resetUpload} className="px-4 py-2.5 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition">
              Upload Different Script
            </button>
            <button onClick={() => navigate('/pre-production/analysis')} className="flex-1 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 active:scale-[0.98]">
              <Film className="w-4 h-4" />
              Run AI Analysis
            </button>
          </div>
        </div>
      )}

      {uploadState === 'idle' && !pasteMode && (
        <div className="mt-6 flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-800">
          <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500">
            The format validator automatically detects and processes Final Draft (.fdx), Fountain (.fountain),
            PDF, and plain text. Scene headings, character names, dialogue, and action lines are extracted for analysis.
          </p>
        </div>
      )}
    </div>
  )
}
