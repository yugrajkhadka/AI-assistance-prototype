const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

export async function checkOllamaHealth() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (!response.ok) {
      return { available: false, status: response.status, message: response.statusText }
    }

    const payload = await response.json()
    return {
      available: true,
      models: Array.isArray(payload.models) ? payload.models.map((model) => model.name) : [],
    }
  } catch (error) {
    return {
      available: false,
      message: error.message,
    }
  }
}
