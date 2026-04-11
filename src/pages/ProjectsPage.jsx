import { FolderOpen, Clock, Users, Film, Plus, Search, Filter } from 'lucide-react'

const projects = [
  { id: 1, name: 'The Last Frame', version: 'v2.4', status: 'Active', scenes: 42, lastEdit: '2 hours ago', team: 4 },
  { id: 2, name: 'Echoes of Tomorrow', version: 'v1.2', status: 'In Review', scenes: 28, lastEdit: '1 day ago', team: 3 },
  { id: 3, name: 'Silent Meridian', version: 'v3.0', status: 'Completed', scenes: 55, lastEdit: '1 week ago', team: 6 },
  { id: 4, name: 'Neon Reverie', version: 'v0.8', status: 'Draft', scenes: 15, lastEdit: '3 days ago', team: 2 },
]

const statusColors = {
  Active: 'bg-onset-500/20 text-onset-400',
  'In Review': 'bg-amber-500/20 text-amber-400',
  Completed: 'bg-cinema-500/20 text-cinema-400',
  Draft: 'bg-slate-700/50 text-slate-400',
}

export default function ProjectsPage() {
  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-slate-400 text-sm">Manage your cinematography projects</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-cinema-500 hover:bg-cinema-600 text-white rounded-lg text-sm font-medium transition">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cinema-500 transition"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-400 rounded-lg text-sm hover:text-white transition">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      <div className="space-y-2">
        {projects.map((proj) => (
          <div key={proj.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-5 h-5 text-cinema-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{proj.name}</span>
                    <span className="text-xs text-slate-500">{proj.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[proj.status]}`}>{proj.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Film className="w-3 h-3" /> {proj.scenes} scenes</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {proj.team} members</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {proj.lastEdit}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
