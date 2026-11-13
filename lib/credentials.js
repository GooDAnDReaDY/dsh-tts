import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  CLOUD_PROVIDERS,
  assertCredentialRef,
  keyEnvName,
  needsApiKey,
} from './keys.js'

export function createCredentialsManager(ctx, live) {
  async function resolveKey(ref) {
    try {
      const resolved = await ctx.credentials?.resolve?.(credentialRef(ref))
      if (resolved && resolved.value) return resolved.value
    } catch (_err) { /* fall through to env */ }
    return process.env[ref] || ''
  }

  async function describeProvider(provider) {
    const ref = keyEnvName(live(), provider)
    const base = { provider, ref, configured: false, writable: true }
    if (!ref) return base
    try {
      if (typeof ctx.credentials?.describe === 'function') {
        const d = await ctx.credentials.describe(credentialRef(ref))
        return {
          provider,
          ref,
          configured: !!(d && d.configured),
          writable: d && d.writable === false ? false : true,
        }
      }
      const resolved = await ctx.credentials?.resolve?.(credentialRef(ref))
      return { provider, ref, configured: !!(resolved && resolved.value), writable: true }
    } catch (_err) {
      return base
    }
  }

  async function credentialsView() {
    const out = {}
    for (const provider of CLOUD_PROVIDERS) {
      out[provider] = await describeProvider(provider)
    }
    return out
  }

  async function storeProviderKey(provider, value) {
    if (!needsApiKey(provider)) {
      throw new Error(`${provider} does not take an API key`)
    }
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      throw new Error('an empty key cannot be stored')
    }
    if (typeof ctx.credentials?.set !== 'function') {
      throw new Error('no credentials service is mounted')
    }
    const ref = assertCredentialRef(keyEnvName(live(), provider))
    await ctx.credentials.set(credentialRef(ref), trimmed)
    return ref
  }

  async function clearProviderKey(provider) {
    if (!needsApiKey(provider)) {
      throw new Error(`${provider} does not take an API key`)
    }
    if (typeof ctx.credentials?.unset !== 'function') {
      throw new Error('no credentials service is mounted')
    }
    const ref = assertCredentialRef(keyEnvName(live(), provider))
    await ctx.credentials.unset(credentialRef(ref))
    return ref
  }

  return {
    resolveKey,
    describeProvider,
    credentialsView,
    storeProviderKey,
    clearProviderKey,
  }
}
