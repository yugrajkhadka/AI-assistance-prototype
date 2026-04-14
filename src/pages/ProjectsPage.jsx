import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Clock, Users, Film, Plus, Search, Filter, Loader2, AlertCircle } from 'lucide-react'
import { projects as projectsApi } from '../services/api'
import { useProject } from '../context/ProjectContext'

const statusColors = {
  Active: 'bg-onset-500/20 text-onset-400',
  'In Review': 'bg-amber-500/20 text-amber-400',
  Completed: 'bg-cinema-500/20 text-cinema-400',
  Draft: 'bg-slate-700/50 text-slate-400',
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { loadProject } = useProject()
  const [projectList, setProjectList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    projectsApi.list()
      .then(data => setProjectList(data.projects || data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleOpenProject = async (proj) => {
    try {
      await loadProject(proj._id || proj.id)
      navigate('/pre-production/analysis')
    } catch { /* error handled in context */ }
  }

  const filtered = projectList.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-slate-400 text-sm">Manage your cinematography projects</p>
        </div>
        <button
          onClick={() => navigate('/pre-production/upload')}
          className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-400 rounded-lg text-sm hover:text-white transition">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 text-cinema-400 mx-auto mb-3 animate-spin" />
          <div className="text-sm text-slate-400">Loading projects...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <div className="text-lg text-white mb-2">{search ? 'No matching projects' : 'No projects yet'}</div>
          <p className="text-sm text-slate-400 mb-4">Upload a screenplay to create your first project.</p>
          <button onClick={() => navigate('/pre-production/upload')} className="px-4 py-2 bg-cinema-500 text-white rounded-lg text-sm">
            Upload Script
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((proj) => {
            const status = proj.status || 'Active'
            return (
              <div
                key={proj._id || proj.id}
                onClick={() => handleOpenProject(proj)}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-cinema-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{proj.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[status] || statusColors.Active}`}>{status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {proj.parseResult?.scenes != null && (
                          <span className="flex items-center gap-1"><Film className="w-3 h-3" /> {proj.parseResult.scenes} scenes</span>
                        )}
                        {proj.team?.length > 0 && (
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {proj.team.length} members</span>
                        )}
                        {proj.updatedAt && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(proj.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
