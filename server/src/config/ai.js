import Anthropic from '@anthropic-ai/sdk'

let client = null

export function getAIClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
    client = new Anthropic({ apiKey })
  }
  return client
}
