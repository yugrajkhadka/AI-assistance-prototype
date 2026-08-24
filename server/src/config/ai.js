export function getGoogleApiKey() {
  const apiKey = process.env.GOOGLE_API_KEY?.trim()
  if (!apiKey || apiKey === 'your-google-api-key') {
    throw new Error(
      'GOOGLE_API_KEY is not set or is still the placeholder value. ' +
      'Set a valid Google Generative Language API key in server/.env or in your production environment variables.'
    )
  }
  return apiKey
}
