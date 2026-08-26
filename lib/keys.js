export const CLOUD_PROVIDERS = [
  'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter', 'custom',
]

export const KEY_ENV_FIELD = {
  openai: 'openaiKeyEnv',
  elevenlabs: 'elevenlabsKeyEnv',
  google: 'googleKeyEnv',
  azure: 'azureKeyEnv',
  groq: 'groqKeyEnv',
  deepgram: 'deepgramKeyEnv',
  openrouter: 'openrouterKeyEnv',
  custom: 'customKeyEnv',
}

export const DEFAULT_KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
  google: 'GEMINI_API_KEY',
  azure: 'AZURE_SPEECH_KEY',
  groq: 'GROQ_API_KEY',
  deepgram: 'DEEPGRAM_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  custom: 'CUSTOM_TTS_API_KEY',
}

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function needsApiKey(provider) {
  return Object.prototype.hasOwnProperty.call(KEY_ENV_FIELD, provider)
}

export function keyEnvName(cfg, provider) {
  const field = KEY_ENV_FIELD[provider]
  if (!field) return ''
  const name = String((cfg && cfg[field]) || '').trim()
  return name || DEFAULT_KEY_ENV[provider] || ''
}

export function assertCredentialRef(ref) {
  if (!REF_PATTERN.test(ref)) {
    throw new Error('credential ref must be an environment variable name')
  }
  return ref
}

/** Drop write-only key material so it never lands in plugin settings. */
export function stripSecretsFromConfig(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const config = { ...payload }
  delete config.keys
  delete config.credentials
  for (const key of Object.keys(config)) {
    if (/KeyEnv$/.test(key)) continue
    if (/(^|.*)(apiKey|api_key|secret|token|password)$/i.test(key) || /Key$/.test(key)) {
      delete config[key]
    }
  }
  return config
}

export function pendingKeyWrites(keys) {
  const out = []
  if (!keys || typeof keys !== 'object') return out
  for (const provider of Object.keys(keys)) {
    if (!needsApiKey(provider)) continue
    const value = typeof keys[provider] === 'string' ? keys[provider].trim() : ''
    if (!value) continue
    out.push({ provider, value })
  }
  return out
}

export function publicConfig(cfg) {
  return stripSecretsFromConfig(cfg)
}
