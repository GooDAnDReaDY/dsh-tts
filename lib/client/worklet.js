class TTSWorklet extends AudioWorkletProcessor {
  process(inputs, outputs, params) { return true }
}
registerProcessor('tts-worklet', TTSWorklet)
