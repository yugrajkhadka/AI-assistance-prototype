import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  Film, Video, FolderOpen, Settings, HelpCircle, Search, Undo2, Redo2,
  MessageSquare, Download, Bell, ChevronDown, Menu, X, Clapperboard
} from 'lucide-react'
import { sampleProject } from '../../data/sampleProject'
import ContextPanel from './ContextPanel'

const navItems = [
  {
    label: 'Pre-Production', icon: Film, prefix: '/pre-production',
    children: [
      { label: 'Script Upload', path: '/pre-production/upload' },
      { label: 'AI Analysis', path: '/pre-production/analysis' },
      { label: 'Generated Outputs', path: '/pre-production/outputs' },
      { label: 'Review & Approval', path: '/pre-production/review' },
    ],
  },
  {
    label: 'On-Set', icon: Video, prefix: '/on-set',
    children: [
      { label: 'Live Camera', path: '/on-set/camera' },
      { label: 'Guidance & Chat', path: '/on-set/guidance' },
    ],
  },
  { label: 'Projects', icon: FolderOpen, path: '/projects' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  { label: 'Help', icon: HelpCircle, path: '/help' },
]

export default function AppShell() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [contextOpen, setContextOpen] = useState(false)
  const [notifications] = useState([
    { id: 1, text: 'Scene 1 shots approved by Director', time: '2m ago' },
    { id: 2, text: 'Lighting plan flagged by Producer', time: '1h ago' },
    { id: 3, text: 'New script revision uploaded', time: '3h ago' },
  ])
  const [showNotifications, setShowNotifications] = useState(false)

  const isActive = (prefix) => location.pathname.startsWith(prefix)

  return (
    <div className="flex h-full bg-slate-950">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
          <Clapperboard className="w-7 h-7 text-cinema-400 flex-shrink-0" />
          {sidebarOpen && <span className="font-semibold text-white text-lg tracking-tight">CineAssist AI</span>}
        </div>

        {/* Project Switcher */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-b border-slate-800">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition text-sm">
              <div className="w-2 h-2 rounded-full bg-onset-400 flex-shrink-0" />
              <div className="text-left flex-1 min-w-0">
                <div className="text-white font-medium truncate">{sampleProject.name}</div>
                <div className="text-slate-400 text-xs">{sampleProject.version} &middot; {sampleProject.syncStatus}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => (
            <div key={item.label}>
              {item.children ? (
                <>
                  <div className={`flex items-center gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider ${isActive(item.prefix) ? 'text-cinema-400' : 'text-slate-500'}`}>
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {sidebarOpen && item.label}
                  </div>
                  {sidebarOpen && item.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={({ isActive: active }) =>
                        `block mx-3 px-3 py-1.5 rounded-md text-sm transition ${active
                          ? 'bg-cinema-500/15 text-cinema-300 font-medium'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </>
              ) : (
                <NavLink
                  to={item.path}
                  className={({ isActive: active }) =>
                    `flex items-center gap-3 px-4 py-2 text-sm transition ${active
                      ? 'text-cinema-300 font-medium'
                      : 'text-slate-400 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && item.label}
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-3 border-t border-slate-800 text-slate-500 hover:text-white transition"
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Toolbar */}
        <header className="h-12 flex items-center justify-between px-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Search">
              <Search className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Undo">
              <Undo2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Redo">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className={`p-1.5 rounded transition ${contextOpen ? 'bg-cinema-500/20 text-cinema-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
              title="AI Suggestions"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Export">
              <Download className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-10 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 animate-fadeIn">
                  <div className="p-3 border-b border-slate-700 font-medium text-sm text-white">Notifications</div>
                  {notifications.map((n) => (
                    <div key={n.id} className="px-3 py-2 text-sm border-b border-slate-700/50 hover:bg-slate-700/50 transition">
                      <div className="text-slate-300">{n.text}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{n.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content + Context Panel */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
          {contextOpen && <ContextPanel onClose={() => setContextOpen(false)} />}
        </div>
      </div>
    </div>
  )
}
