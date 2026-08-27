export class KokoroEngine {
  constructor({modelPath}){ this.modelPath=modelPath }
  async *synthesize(text, voice){ yield new Float32Array(24000) }
}
