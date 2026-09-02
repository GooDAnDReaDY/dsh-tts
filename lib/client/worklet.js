class TTSWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferQueue = []
    this.currentChunk = null
    this.chunkOffset = 0
    this.playing = true

    this.port.onmessage = (event) => {
      const data = event.data
      if (!data) return
      if (data.type === 'chunk' && data.pcm instanceof Float32Array) {
        this.bufferQueue.push(data.pcm)
      } else if (data.type === 'clear' || data.type === 'stop') {
        this.bufferQueue = []
        this.currentChunk = null
        this.chunkOffset = 0
      } else if (data.type === 'pause') {
        this.playing = false
      } else if (data.type === 'resume') {
        this.playing = true
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0]
    if (!output || !output[0]) return true
    const channel = output[0]
    const bufferLength = channel.length

    if (!this.playing) {
      channel.fill(0)
      return true
    }

    let written = 0
    while (written < bufferLength) {
      if (!this.currentChunk || this.chunkOffset >= this.currentChunk.length) {
        if (this.bufferQueue.length === 0) {
          this.currentChunk = null
          break
        }
        this.currentChunk = this.bufferQueue.shift()
        this.chunkOffset = 0
      }

      const available = this.currentChunk.length - this.chunkOffset
      const needed = bufferLength - written
      const toCopy = Math.min(available, needed)

      for (let i = 0; i < toCopy; i++) {
        channel[written + i] = this.currentChunk[this.chunkOffset + i]
      }

      this.chunkOffset += toCopy
      written += toCopy
    }

    // Fill remaining output buffer with silence if queue is drained
    if (written < bufferLength) {
      for (let i = written; i < bufferLength; i++) {
        channel[i] = 0
      }
    }

    return true
  }
}

registerProcessor('tts-worklet', TTSWorklet)
