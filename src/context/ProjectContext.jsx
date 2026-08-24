import { createContext, useContext, useState, useCallback } from 'react'
import { analysis as analysisApi, projects as projectsApi } from '../services/api'
import { getSelectedCamera, saveCameraPrefs } from '../services/cameraPrefs'

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
    // Read camera selection from settings
    let cameraPrefs = null
    try { cameraPrefs = JSON.parse(localStorage.getItem('cineassist_camera_prefs') || '{}').camera } catch {
      // ignore
    }

    const data = await analysisApi.run(projectId, cameraPrefs)
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
    } catch {
      // ignore
    }
  }, [currentProject?._id])

  const updateProject = useCallback(async (updates) => {
    if (!currentProject?._id) return null
    setLoading(true)
    setError(null)
    try {
      const project = await projectsApi.update(currentProject._id, updates)
      setCurrentProject(project)
      if (updates.cameraPackage) {
        saveCameraPrefs({ camera: updates.cameraPackage, budget: updates.cameraPackage?.budget || '' })
      }
      return project
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [currentProject?._id])

  const setProjectFromUpload = useCallback((project) => {
    setCurrentProject(project)
    setAnalysisData(null)
  }, [])

  const selectedCamera = currentProject?.cameraPackage || getSelectedCamera()

  return (
    <ProjectContext.Provider value={{
      currentProject, analysisData, loading, error, selectedCamera,
      loadProject, runAnalysis, refreshAnalysis,
      updateProject, setCurrentProject, setProjectFromUpload, setAnalysisData,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => useContext(ProjectContext)
