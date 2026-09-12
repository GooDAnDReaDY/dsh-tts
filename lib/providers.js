import { PROVIDER_KEYS, OPENAI_COMPATIBLE, DEFAULT_MODELS, DEFAULT_VOICES } from "./providers/constants.js"
import { makeCloudProviders } from "./providers/cloud.js"
import { makeLocalProviders } from "./providers/local.js"

export { PROVIDER_KEYS, OPENAI_COMPATIBLE, DEFAULT_MODELS, DEFAULT_VOICES }

export function makeProviders(deps, req) {
  const { cfg } = deps
  const { signal: parentSignal } = req
  const cloudTimeoutMs = Number(cfg.cloudTimeoutMs) > 0 ? Number(cfg.cloudTimeoutMs) : 10000

  function withCloudTimeout() {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error())
    }, cloudTimeoutMs)
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort(parentSignal.reason)
      else parentSignal.addEventListener(abort, () => controller.abort(parentSignal.reason), { once: true })
    }
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    }
  }

  const cloud = makeCloudProviders(deps, req, withCloudTimeout)
  const local = makeLocalProviders(deps, req)

  return Object.assign({}, cloud, local)
}
