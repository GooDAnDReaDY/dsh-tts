export const PROVIDER_KEYS = [
  'kokoro', 'f5',
  'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter',
  'siliconflow', 'deepinfra', 'fireworks', 'mimo', 'custom',
  'edge', 'piper', 'espeak', 'minimax',
]

// OpenAI-compatible providers share /audio/speech; they differ by base URL,
// model, and key name. Each URL was probed without a key and returned 401.
export const OPENAI_COMPATIBLE = {
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', keyEnv: 'SILICONFLOW_API_KEY' },
  deepinfra: { baseUrl: 'https://api.deepinfra.com/v1/openai', keyEnv: 'DEEPINFRA_API_KEY' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', keyEnv: 'FIREWORKS_API_KEY' },
  // Custom endpoint: base URL and key name come from settings.
  custom: { baseUrl: '', keyEnv: 'CUSTOM_TTS_API_KEY' },
}

export const DEFAULT_MODELS = {
  kokoro: 'hexgrad/Kokoro-82M',
  f5: 'F5-TTS',
  mimo: 'mimo-v2.5-tts',
  minimax: '',
  siliconflow: 'FunAudioLLM/CosyVoice2-0.5B',
  deepinfra: 'hexgrad/Kokoro-82M',
  fireworks: 'kokoro',
  openai: 'gpt-4o-mini-tts',
  elevenlabs: 'eleven_multilingual_v2',
  google: 'gemini-2.5-flash-preview-tts',
  azure: 'en-US-JennyNeural',
  groq: 'playai-tts',
  deepgram: 'aura-asteria-en',
  openrouter: 'openai/gpt-4o-mini-tts-2025-12-15',
  custom: '',
  edge: 'ru-RU-SvetlanaNeural',
  piper: '',
  espeak: 'ru',
}

export const DEFAULT_VOICES = {
  kokoro: 'af_bella',
  f5: 'default',
  // MiMo voices use Chinese names; 冰糖 is their default.
  mimo: '冰糖',
  minimax: '',
  siliconflow: 'FunAudioLLM/CosyVoice2-0.5B:alex',
  deepinfra: 'af_bella',
  fireworks: 'af_bella',
  openai: 'alloy',
  elevenlabs: '21m00Tcm4TlvDq8ikWAM',
  google: 'Kore',
  azure: 'en-US-JennyNeural',
  groq: 'Fritz-PlayAI',
  deepgram: '',
  openrouter: 'alloy',
  custom: '',
  edge: 'ru-RU-SvetlanaNeural',
  piper: '',
  espeak: 'ru',
}


