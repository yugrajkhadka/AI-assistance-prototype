import { createContext, useContext, useState, useCallback } from 'react'
import { analysis as analysisApi, projects as projectsApi } from '../services/api'

const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const [currentProject, setCurrentProject] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadProject = useCallback(async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await projectsApi.get(projectId)
      setCurrentProject(data.project)
      if (data.analysis) setAnalysisData(data.analysis)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const runAnalysis = useCallback(async (projectId) => {
    setLoading(true)
    setError(null)
    try {
      const data = await analysisApi.run(projectId)
      setAnalysisData(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAnalysis = useCallback(async () => {
    if (!currentProject?._id) return
    try {
      const data = await analysisApi.get(currentProject._id)
      setAnalysisData(data)
      return data
    } catch { /* ignore if no analysis yet */ }
  }, [currentProject])

  const setProjectFromUpload = useCallback((project) => {
    setCurrentProject(project)
    setAnalysisData(null)
  }, [])

  return (
    <ProjectContext.Provider value={{
      currentProject, analysisData, loading, error,
      loadProject, runAnalysis, refreshAnalysis,
      setCurrentProject, setProjectFromUpload, setAnalysisData,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => useContext(ProjectContext)
