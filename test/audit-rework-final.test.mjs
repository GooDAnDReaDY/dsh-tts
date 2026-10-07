import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { apply } from "../lib/index.js"
import { createSpeechCache } from "../lib/cache.js"
import { MODEL_SPECS, createModelManager } from "../lib/engines/manager.js"

test("Issue #151: settings save strips revision from config and does not mutate keys on conflict", async () => {
  let replaceCalls = []
  let storedKeys = []
  let replaceRevision = null
  let shouldFailReplace = false

  const mockCtx = {
    on() {},
    effect(fn) { return fn() },
    webServer: {
      routes: new Map(),
      register(r) { this.routes.set(r.path, r) },
    },
    tools: { register() {} },
    credentials: {
      resolve: async () => null,
      describe: async () => null,
      set: async (key, val) => {
        storedKeys.push({ key, val })
      },
    },
    settings: {
      describe: async () => ({ revision: 7 }),
      replace: async (ns, config, rev) => {
        replaceRevision = rev
        replaceCalls.push(config)
        if (shouldFailReplace) {
          const err = new Error("Conflict: revision mismatch")
          err.code = "conflict"
          throw err
        }
      },
    },
  }

  apply(mockCtx, { speakReplies: false })
  const configRoute = mockCtx.webServer.routes.get("/dsh-tts/config")
  assert.ok(configRoute, "/dsh-tts/config route must exist")

  const makeReqRes = (payload) => {
    let statusCode = 200
    let resBody = ""
    return {
      req: {
        method: "PUT",
        headers: { "sec-fetch-site": "same-origin" },
        on(event, cb) {
          if (event === "data") cb(Buffer.from(JSON.stringify(payload)))
          if (event === "end") cb()
          return this
        },
      },
      res: {
        writeHead(code) { statusCode = code },
        end(data) { if (data) resBody += data },
        get body() { return resBody },
        get statusCode() { return statusCode },
      },
    }
  }

  // 1. Success case: revision is stripped from config passed to replace
  const req1 = makeReqRes({
    speakReplies: true,
    revision: 7,
    keys: { openai: "sk-test-key-1" },
  })
  await configRoute.handler(req1.req, req1.res)
  assert.equal(req1.res.statusCode, 200)
  assert.equal(replaceRevision, 7, "expected revision passed to replace")
  assert.ok(replaceCalls.length > 0)
  assert.equal("revision" in replaceCalls[0], false, "revision must be stripped from config")
  assert.equal(storedKeys.length, 1, "keys stored on success")

  // 2. Conflict case: stale revision must return 409 and NOT mutate keys
  storedKeys = []
  shouldFailReplace = true
  const req2 = makeReqRes({
    speakReplies: true,
    revision: 6,
    keys: { openai: "sk-stale-key-not-written" },
  })
  await configRoute.handler(req2.req, req2.res)
  assert.equal(req2.res.statusCode, 409, "must return 409 conflict")
  const json2 = JSON.parse(req2.res.body)
  assert.equal(json2.ok, false)
  assert.equal(json2.error.code, "conflict")
  assert.equal(storedKeys.length, 0, "keys must NOT be written when replace conflicts")
})

test("Issue #165: /speak rejects external/messenger requests when messengerTtsEnabled is false", async () => {
  const routes = new Map()
  const mockCtx = {
    on() {},
    effect(fn) { return fn() },
    webServer: {
      register(r) { routes.set(r.path, r) },
    },
    tools: { register() {} },
    credentials: { resolve: async () => null, describe: async () => null },
  }

  // Default: messengerTtsEnabled: false
  apply(mockCtx, {
    speakReplies: true,
    messengerTtsEnabled: false,
    vadBargeIn: true,
  })

  const speakRoute = routes.get("/dsh-tts/speak")
  const statusRoute = routes.get("/dsh-tts/status")
  assert.ok(speakRoute)
  assert.ok(statusRoute)

  // Status must deliver vadBargeIn
  let statusBody = ""
  const statusRes = {
    writeHead() {},
    end(d) { statusBody += d },
  }
  await statusRoute.handler({ method: "GET", headers: { "sec-fetch-site": "same-origin" } }, statusRes)
  const statusJson = JSON.parse(statusBody)
  assert.equal(statusJson.vadBargeIn, true, "status must deliver vadBargeIn")

  const makeReqRes = (payload) => {
    let statusCode = 200
    let resBody = ""
    return {
      req: {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        on(event, cb) {
          if (event === "data") cb(Buffer.from(JSON.stringify(payload)))
          if (event === "end") cb()
          return this
        },
      },
      res: {
        writeHead(code) { statusCode = code },
        end(data) { if (data) resBody += data },
        get body() { return resBody },
        get statusCode() { return statusCode },
      },
    }
  }

  // Gateway payload without channel when messengerTtsEnabled is false -> 403
  const req1 = makeReqRes({ text: "Hello messenger", channel: "messenger" })
  await speakRoute.handler(req1.req, req1.res)
  assert.equal(req1.res.statusCode, 403)
  const errJson = JSON.parse(req1.res.body)
  assert.equal(errJson.error.code, "disabled")
})

test("Issue #179: model manager validates format and rejects dummy byte repetitions and invalid JSON", async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dsh-models-test-"))
  try {
    const mgr = createModelManager({ root: tmpDir })
    const kokoroPath = mgr.getModelPath("kokoro")
    await fs.promises.mkdir(kokoroPath, { recursive: true })

    // 1. Create a dummy file with 2048 bytes of 0x2a under kokoro-v0_19.onnx
    const dummyPath = path.join(kokoroPath, "kokoro-v0_19.onnx")
    await fs.promises.writeFile(dummyPath, Buffer.alloc(2048, 0x2a))
    const status1 = await mgr.getStatus("kokoro")
    assert.equal(status1.installed, false, "2048 bytes of 0x2a must not be recognized as installed ONNX")

    // 2. Create invalid JSON under voices.json
    const jsonPath = path.join(kokoroPath, "voices.json")
    await fs.promises.writeFile(jsonPath, Buffer.from("{ invalid json content", "utf8"))
    const status2 = await mgr.getStatus("kokoro")
    assert.equal(status2.installed, false, "invalid JSON must not be recognized as installed")

    // 3. Verify MODEL_SPECS URLs are immutable and valid
    assert.ok(MODEL_SPECS.kokoro.files[0].url.includes("thewh1teagle/kokoro-onnx"), "Kokoro URL uses official release")
    assert.ok(MODEL_SPECS.f5.files[0].url.includes("84e5a410d9cead4de2f847e7c9369a6440bdfaca"), "F5 uses verified immutable commit")
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

test("Issue #198: clientFetch body stall rejects within timeoutMs using AbortController", async () => {
  let serverClosed = false
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.write('{"partial": ')
    // intentionally do NOT end or write more data
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port

  try {
    const clientSrc = fs.readFileSync("lib/client.js", "utf8")
    function extractFunction(src, name) {
      const startIdx = src.indexOf("function " + name + "(")
      if (startIdx === -1) return null
      const braceIdx = src.indexOf("{", startIdx)
      if (braceIdx === -1) return null
      let depth = 0
      for (let i = braceIdx; i < src.length; i++) {
        if (src[i] === "{") depth++
        else if (src[i] === "}") {
          depth--
          if (depth === 0) return src.slice(startIdx, i + 1)
        }
      }
      return null
    }

    const fnStr = extractFunction(clientSrc, "clientFetch")
    assert.ok(fnStr, "clientFetch must be in client bundle")

    const clientFetch = new Function("url", "options", "return (" + fnStr + ")(url, options)")

    let caughtErr = null
    try {
      const res = await clientFetch("http://127.0.0.1:" + port + "/test", { timeoutMs: 50 })
      await res.json()
    } catch (e) {
      caughtErr = e
    }

    assert.ok(caughtErr, "res.json() must reject when body stalls")
    assert.ok(caughtErr.name === "AbortError" || /abort/i.test(caughtErr.message), "error must be AbortError")
  } finally {
    server.close()
  }
})

test("Issue #202: cache clear awaits in-flight writes and leaves zero residual files", async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dsh-cache-test-"))
  try {
    const cache = createSpeechCache({ root: tmpDir, maxBytes: 10 * 1024 * 1024 })
    await cache.put("test-key-1", "audio/mpeg", Buffer.from("dummy audio bytes"))

    // Trigger get immediately followed by clear
    const getPromise = cache.get("test-key-1")
    const clearPromise = cache.clear()

    const [hit, cleared] = await Promise.all([getPromise, clearPromise])
    assert.ok(hit, "get returned hit")
    assert.equal(cleared, 1, "clear deleted 1 entry")

    // Check directory on disk
    const cacheDir = path.join(tmpDir, "data", "dsh-tts", "cache")
    let files = []
    try {
      files = await fs.promises.readdir(cacheDir)
    } catch {
      files = []
    }
    assert.deepEqual(files, [], "no cache files must remain on disk after clear")
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})
