import { publicConfig } from './keys.js'

export function extractRevision(desc, targetNs = 'dsh-tts') {
  if (!desc || typeof desc !== 'object') return undefined
  if (desc.namespace === targetNs) {
    return desc.revision
  }
  if (Array.isArray(desc.namespaces)) {
    const hit = desc.namespaces.find((ns) => ns === targetNs || (ns && ns.namespace === targetNs))
    if (hit) {
      if (typeof hit === 'object' && hit.revision !== undefined) return hit.revision
      if (desc.revision !== undefined) return desc.revision
    }
  }
  if (Array.isArray(desc)) {
    const hit = desc.find((item) => (item && item.name === targetNs) || (item && item.namespace === targetNs))
    if (hit && hit.revision !== undefined) return hit.revision
  }
  if (desc.revision !== undefined && desc.namespace === undefined && !desc.namespaces) {
    return desc.revision
  }
  return undefined
}

export function createSettingsApi(ctx, config, live, plainConfig, NS = 'dsh-tts') {
  return {
    get: () => live(),
    replace: async (next, expectedRevision) => {
      const plain = plainConfig(next)
      delete plain.revision
      const svc = ctx?.get?.('settings') ?? ctx?.settings ?? ctx?.get?.('settingsForms') ?? ctx?.settingsForms
      if (!svc) {
        throw new Error('Settings service is unavailable')
      }
      let rev = expectedRevision
      if (rev === undefined && typeof svc.describe === 'function') {
        try {
          const desc = await svc.describe(NS)
          rev = extractRevision(desc, NS)
        } catch (_err) {
          // ignore describe error
        }
      }
      if (typeof svc.replace === 'function') {
        await svc.replace(NS, plain, rev)
      } else if (typeof svc.update === 'function') {
        await svc.update(NS, plain, rev)
      } else {
        throw new Error('Settings service does not support replace or update')
      }

      // Mutate volatile boxes directly so runtime dynamically reflects new settings (#152)
      if (config && typeof config === 'object') {
        for (const [k, v] of Object.entries(plain)) {
          if (config[k] && typeof config[k] === 'object') {
            const sym = Object.getOwnPropertySymbols(config[k]).find((s) => String(s).includes('volatile.write'))
            if (sym && typeof config[k][sym] === 'function') {
              try { config[k][sym](v) } catch (_wErr) { /* best effort */ }
            } else if ('value' in config[k]) {
              config[k].value = v
            }
          } else if (config[k] !== undefined) {
            config[k] = v
          }
        }
      }
      return plain
    },
  }
}

export async function buildConfigResponse(ctx, live, credentialsView, NS = 'dsh-tts') {
  let revision = null
  const svc = ctx?.get?.('settings') ?? ctx?.settings ?? ctx?.get?.('settingsForms') ?? ctx?.settingsForms
  if (svc && typeof svc.describe === 'function') {
    try {
      const desc = await svc.describe(NS)
      revision = extractRevision(desc, NS) ?? null
    } catch (_err) {
      // best effort describe
    }
  }
  return {
    ok: true,
    config: publicConfig(live()),
    credentials: await credentialsView(),
    revision,
  }
}
