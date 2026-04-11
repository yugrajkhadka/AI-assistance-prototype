import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, Cloud, Type, Shield, Globe, CheckCircle2,
  AlertCircle, Loader2, Film, Clock, Hash
} from 'lucide-react'

export default function ScriptUpload() {
  const navigate = useNavigate()
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState('idle') // idle | uploading | parsing | complete
  const [uploadedFile, setUploadedFile] = useState(null)
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

  const simulateUpload = (fileName) => {
    setUploadState('uploading')
    setTimeout(() => {
      setUploadState('parsing')
      setTimeout(() => {
        setUploadedFile({
          name: fileName,
          scenes: 42,
          pages: 118,
          runtime: '1h 47m',
          characters: 12,
          locations: 18,
          format: 'FDX',
        })
        setUploadState('complete')
      }, 1500)
    }, 1200)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) simulateUpload(file.name)
  }, [])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) simulateUpload(file.name)
  }

  const handlePasteSubmit = () => {
    if (pasteText.trim()) simulateUpload('Pasted Script.txt')
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Script Upload</h1>
        <p className="text-slate-400">Upload your screenplay to begin AI-powered cinematography planning.</p>
      </div>

      {/* Upload Methods */}
      {uploadState === 'idle' && !pasteMode && (
        <>
          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
              dragActive
                ? 'border-cinema-400 bg-cinema-500/10'
                : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
            }`}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-cinema-400' : 'text-slate-600'}`} />
            <div className="text-lg font-medium text-white mb-2">
              {dragActive ? 'Drop your script here' : 'Drag & drop your screenplay'}
            </div>
            <p className="text-sm text-slate-400 mb-4">Supports PDF, FDX, Fountain, and plain text formats</p>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg cursor-pointer transition font-medium text-sm">
              <FileText className="w-4 h-4" />
              Browse Files
              <input type="file" accept=".pdf,.fdx,.fountain,.txt" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>

          {/* Alternative Methods */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setPasteMode(true)}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 transition"
            >
              <Type className="w-5 h-5 text-cinema-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-white">Paste Text</div>
                <div className="text-xs text-slate-500">Paste screenplay content directly</div>
              </div>
            </button>
            <button className="flex-1 flex items-center gap-3 p-4 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 transition">
              <Cloud className="w-5 h-5 text-cinema-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-white">Import from Cloud</div>
                <div className="text-xs text-slate-500">Google Drive, Dropbox, iCloud</div>
              </div>
            </button>
          </div>

          {/* Settings */}
          <div className="mt-6 p-4 rounded-lg border border-slate-800 bg-slate-900/30">
            <div className="text-sm font-medium text-white mb-3">Upload Settings</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                  <option>Japanese</option>
                  <option>Korean</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Privacy</label>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-onset-400" />
                  <select
                    value={settings.privacy}
                    onChange={(e) => setSettings({ ...settings, privacy: e.target.value })}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
                  >
                    <option value="private">Private</option>
                    <option value="team">Team Only</option>
                    <option value="shared">Shared</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Format</label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-500" />
                  <select
                    value={settings.format}
                    onChange={(e) => setSettings({ ...settings, format: e.target.value })}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
                  >
                    <option value="auto-detect">Auto-Detect</option>
                    <option value="fdx">Final Draft (FDX)</option>
                    <option value="fountain">Fountain</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Paste Mode */}
      {pasteMode && uploadState === 'idle' && (
        <div className="animate-fadeIn">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your screenplay text here..."
            className="w-full h-64 bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-cinema-500 transition"
          />
          <div className="flex gap-3 mt-3">
            <button onClick={() => setPasteMode(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">
              Back
            </button>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-5 py-2 bg-cinema-500 hover:bg-cinema-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition"
            >
              Analyze Script
            </button>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {(uploadState === 'uploading' || uploadState === 'parsing') && (
        <div className="text-center py-16 animate-fadeIn">
          <Loader2 className="w-12 h-12 text-cinema-400 mx-auto mb-4 animate-spin" />
          <div className="text-lg font-medium text-white mb-2">
            {uploadState === 'uploading' ? 'Uploading script...' : 'Parsing & validating...'}
          </div>
          <div className="w-64 mx-auto bg-slate-800 rounded-full h-2 mt-4">
            <div
              className="bg-cinema-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: uploadState === 'uploading' ? '45%' : '80%' }}
            />
          </div>
          <p className="text-sm text-slate-500 mt-3">
            {uploadState === 'uploading'
              ? 'Validating format and encoding...'
              : 'Extracting scenes, characters, and metadata...'}
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
            <div className="grid grid-cols-3 gap-4 mt-4">
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
            <div className="flex gap-2 mt-4 text-xs text-slate-400">
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.characters} characters</span>
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.locations} locations</span>
              <span className="px-2 py-1 rounded bg-slate-800">{uploadedFile.format} format</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setUploadState('idle')
                setUploadedFile(null)
              }}
              className="px-4 py-2.5 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition"
            >
              Upload Different Script
            </button>
            <button
              onClick={() => navigate('/pre-production/analysis')}
              className="flex-1 px-5 py-2.5 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4" />
              Run AI Analysis
            </button>
          </div>
        </div>
      )}

      {/* Format Validator Info */}
      {uploadState === 'idle' && (
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
