import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProjectProvider } from './context/ProjectContext'
import './index.css'
import App from './App.jsx'

// Use HashRouter for GitHub Pages, BrowserRouter for production with proper server config
const Router = import.meta.env.VITE_ROUTER === 'browser' ? BrowserRouter : HashRouter
const basename = import.meta.env.VITE_ROUTER === 'browser' ? '/' : undefined

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router basename={basename}>
      <AuthProvider>
        <ProjectProvider>
          <App />
        </ProjectProvider>
      </AuthProvider>
    </Router>
  </StrictMode>,
)
