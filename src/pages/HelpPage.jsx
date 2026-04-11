import { HelpCircle, Book, MessageCircle, Video, Keyboard, FileText, ExternalLink } from 'lucide-react'

const helpSections = [
  {
    icon: Book,
    title: 'Getting Started',
    desc: 'Learn the basics of CineAssist AI — from script upload to on-set guidance.',
    links: ['Upload your first script', 'Understanding AI analysis', 'Navigating generated outputs'],
  },
  {
    icon: Video,
    title: 'Pre-Production Workflow',
    desc: 'Master the script analysis, storyboard generation, and review pipeline.',
    links: ['Shot list management', 'Lighting plan editor', 'Approval workflows'],
  },
  {
    icon: MessageCircle,
    title: 'On-Set Features',
    desc: 'Real-time camera guidance, scene analysis, and the intelligent assistant.',
    links: ['Live camera overlays', 'Guidance modes explained', 'Voice commands reference'],
  },
  {
    icon: Keyboard,
    title: 'Keyboard Shortcuts',
    desc: 'Speed up your workflow with keyboard shortcuts and gestures.',
    links: ['Navigation shortcuts', 'Editor shortcuts', 'On-set quick controls'],
  },
]

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Help & Documentation</h1>
        <p className="text-slate-400 text-sm">Everything you need to use CineAssist AI effectively</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {helpSections.map((section) => (
          <div key={section.title} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/40 transition">
            <div className="flex items-center gap-2 mb-2">
              <section.icon className="w-5 h-5 text-cinema-400" />
              <span className="text-sm font-medium text-white">{section.title}</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">{section.desc}</p>
            <div className="space-y-1">
              {section.links.map((link) => (
                <div key={link} className="flex items-center gap-1.5 text-xs text-cinema-400 hover:text-cinema-300 cursor-pointer transition">
                  <FileText className="w-3 h-3" />
                  {link}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center">
        <HelpCircle className="w-6 h-6 text-cinema-400 mx-auto mb-2" />
        <div className="text-sm text-white mb-1">Need more help?</div>
        <p className="text-xs text-slate-400">Contact the CineAssist AI support team or browse the full documentation.</p>
      </div>
    </div>
  )
}
