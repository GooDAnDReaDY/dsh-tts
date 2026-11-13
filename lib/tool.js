import { defineTool } from '@deepseek-ai/dsh-tools'

export function registerSpeakTool(ctx, {
  live,
  prepareSpeechTextBound,
  nextUtteranceId,
  reserve,
  settle,
  synthesize,
}) {
  ctx.tools.register(
    defineTool({
      name: 'speak_text',
      description:
        'Synthesize speech from text using the dsh-tts provider fallback chain. '
        + 'Returns audio as base64 plus the provider that succeeded. '
        + 'Use when the user asks to hear text; do not dump the audio into the model context.',
      parameters: {
        text: { type: 'string', required: true, description: 'Text to speak.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            id: { type: 'string' },
            provider: { type: 'string' },
            mime: { type: 'string' },
            bytes: { type: 'number' },
            tookMs: { type: 'number' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value && value.ok
            ? `Spoken with ${value.provider} (${value.mime}, ${value.bytes || 0} bytes).`
            : `TTS failed: ${value && value.error ? value.error : 'unknown'}`,
        }],
      },
      execute: async (args, exec) => {
        const cfg = live()
        const rawText = String(args.text || '').trim()
        if (!rawText) return { ok: false, error: 'empty text' }
        const sid = exec?.session?.id || 'tool'
        const id = nextUtteranceId()
        reserve(id)
        try {
          const text = await prepareSpeechTextBound(rawText, cfg, exec.signal)
          if (!text) {
            settle(id, { id, sessionId: sid, kind: 'error', text: rawText, error: 'nothing to speak' })
            return { ok: false, error: 'nothing to speak' }
          }
          const out = await synthesize(text, cfg, exec.signal, 'reply', { skipClean: true })
          const item = {
            id,
            sessionId: sid,
            kind: 'speech',
            role: 'reply',
            text,
            provider: out.provider,
            mime: out.mime,
            audioBase64: Buffer.from(out.audio).toString('base64'),
            tookMs: out.tookMs,
          }
          settle(id, item)
          return {
            ok: true,
            id,
            provider: out.provider,
            mime: out.mime,
            bytes: out.audio.length,
            tookMs: out.tookMs,
          }
        } catch (e) {
          settle(id, { id, sessionId: sid, kind: 'error', text: rawText, error: String(e && e.message || e) })
          return { ok: false, error: String(e && e.message || e) }
        }
      },
    }),
  )
}
