import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import ScriptUpload from './pages/preproduction/ScriptUpload'
import AnalysisDashboard from './pages/preproduction/AnalysisDashboard'
import GeneratedOutputs from './pages/preproduction/GeneratedOutputs'
import ReviewApproval from './pages/preproduction/ReviewApproval'
import LiveCamera from './pages/onset/LiveCamera'
import GuidancePanel from './pages/onset/GuidancePanel'
import ProjectsPage from './pages/ProjectsPage'
import SettingsPage from './pages/SettingsPage'
import HelpPage from './pages/HelpPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/pre-production/upload" replace />} />
        <Route path="pre-production">
          <Route path="upload" element={<ScriptUpload />} />
          <Route path="analysis" element={<AnalysisDashboard />} />
          <Route path="outputs" element={<GeneratedOutputs />} />
          <Route path="review" element={<ReviewApproval />} />
        </Route>
        <Route path="on-set">
          <Route path="camera" element={<LiveCamera />} />
          <Route path="guidance" element={<GuidancePanel />} />
        </Route>
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
    </Routes>
  )
}
