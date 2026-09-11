window.__ModuleLoader__.load({
  id: '@goodandready/dsh-tts',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    // Chevron comes from core UI primitives; local SVG is a fallback for
    // builds without the package. Icon always points down; open state rotates.
    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (noPrimitives) {
      ChevronIcon = null
    }
    const NS = 'dsh-tts'
    const PROVIDERS = [
      'openai', 'elevenlabs', 'google', 'azure', 'groq', 'deepgram', 'openrouter',
      'edge', 'piper', 'espeak',
    ]
    const CLOUD = {
      openai: 1, elevenlabs: 1, google: 1, azure: 1, groq: 1, deepgram: 1, openrouter: 1, custom: 1,
    }
    // Hints stay generic: concrete provider model IDs rot quickly.
    const MODEL_HINT = {
      openai: 'provider default',
      elevenlabs: 'provider default',
      google: 'provider default',
      azure: 'region voice name',
      groq: 'provider default',
      deepgram: 'provider default (English-only voices)',
      openrouter: 'provider/model id',
      edge: 'BCP-47 voice, e.g. ru-RU-SvetlanaNeural',
      piper: 'path to .onnx',
      espeak: 'language code, e.g. ru',
      kokoro: 'not bundled — offline neural runtime unavailable',
      f5: 'not bundled — offline neural runtime unavailable',
    }


    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return (props && props.children) || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-tts] React Error:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'dts-alert dts-alert-err',
                style: { margin: '12px 0', padding: '14px', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ TTS UI Error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dts-btn',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                'Retry',
              ),
            )
          }
          return (this.props && this.props.children) || null
        }
      }
    }
    const ErrorBoundary = createErrorBoundary()
    const SNAPSHOT_READY = Object.freeze({ status: 'ready', value: {} })
    const SNAPSHOT_LOADING = Object.freeze({ status: 'loading', value: {} })
