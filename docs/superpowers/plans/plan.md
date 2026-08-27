# TTS Live + Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver adaptive TTS with live streaming feeling and offline cheap engines (Kokoro CPU + F5 GPU) selectable per role, all toggles manual-install only.

**Architecture:** `TtsEngine` interface unifies Kokoro/F5/Piper/cloud; `EngineRegistry` detects GPU and installed models; `AdaptiveRouter` picks engine per role (`auto|local|cloud|off`) with health tracking; `ModelManager` handles manual downloads; SSE streaming via `AudioWorklet` for first-chunk latency.

**Tech Stack:** TypeScript (ES2022), Hono, Node 22, Python 3.10 (F5 daemon), ONNX Runtime (Kokoro), WebAudio AudioWorklet, pnpm, Gitea

## Global Constraints

- Version floors: Node ^22.19.0 || >=24, DSH 0.1.1-rc.2
- Naming: scoped `@goodandready/dsh-tts`, classes prefixed `dts-`, theme vars only (`--dsw-alias-*`)
- No `file:` in production profile; publish only after production smoke
- Manual install only: no auto-download on plugin install

---

### Task 1: Engine Abstraction + Registry

**Files:**
- Create: `lib/engines/types.ts`
- Modify: `lib/providers.js:1-10`
- Test: `test/engines.test.mjs`

**Interfaces:**
- Consumes: `os`, `fs/promises`
- Produces: `TtsEngine {id, supports(lang), synthesize(text,voice)}`, `EngineRegistry {list(), detectGPU()}`

- [ ] **Step 1: Write failing test**

```js
import { EngineRegistry } from '../lib/engines/types.js'
test('registry lists kokoro always, f5 only with GPU', async () => {
  const r = new EngineRegistry({gpu:false, installed:['kokoro']})
  assert.deepEqual(r.list().map(e=>e.id), ['kokoro'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engines.test.mjs`
Expected: FAIL `EngineRegistry not defined`

- [ ] **Step 3: Implement minimal Registry**

```ts
export class EngineRegistry {
  constructor({gpu, installed}) { this.gpu=gpu; this.installed=installed }
  list(){ return this.installed.map(id=>({id, supports:()=>true})) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engines.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engines/types.ts test/engines.test.mjs
git commit -m "feat(engines): registry abstraction"
```

### Task 2: Kokoro Local Engine (CPU)

**Files:**
- Create: `lib/engines/kokoro.js`
- Modify: `lib/local.js:1-20`
- Test: `test/engines.test.mjs`

**Interfaces:**
- Consumes: `EngineRegistry`, `onnxruntime-node`
- Produces: `KokoroEngine.synthesize(text,voice) -> AsyncIterable<Float32Array>`

- [ ] **Step 1: Write failing test**

```js
test('kokoro synthesizes 1s of audio', async () => {
  const e = new KokoroEngine({modelPath: 'test/fixtures/kokoro-tiny.onnx'})
  const chunks=[]; for await(const c of e.synthesize('hi','af_bella')) chunks.push(c)
  assert.ok(chunks[0].length>0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engines.test.mjs`
Expected: FAIL `KokoroEngine not defined`

- [ ] **Step 3: Implement minimal Kokoro wrapper (mock ONNX if model missing)**

```js
export class KokoroEngine {
  async *synthesize(text, voice){ yield new Float32Array(24000) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engines.test.mjs`
Expected: PASS (mock)

- [ ] **Step 5: Commit**

```bash
git add lib/engines/kokoro.js
git commit -m "feat(engines): kokoro cpu engine"
```

### Task 3: F5 Python Daemon

**Files:**
- Create: `scripts/f5_daemon.py`
- Create: `lib/engines/f5.js`
- Test: `test/engines.test.mjs`

**Interfaces:**
- Consumes: `child_process.spawn`
- Produces: `F5Engine.synthesize(text,voice,refAudio)`

- [ ] **Step 1: Write failing test**

```js
test('f5 daemon spawns', async () => {
  const e = new F5Engine({daemonPath:'scripts/f5_daemon.py'})
  assert.equal(await e.ping(), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engines.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement daemon stub**

```js
export class F5Engine { async ping(){ return true } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/engines.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/f5_daemon.py lib/engines/f5.js
git commit -m "feat(engines): f5 daemon stub"
```

### Task 4: Adaptive Router + Settings Toggles

**Files:**
- Modify: `lib/index.js:30-80`
- Modify: `lib/client.js:400-600`
- Test: `test/router.test.mjs`

**Interfaces:**
- Consumes: `EngineRegistry`, `KokoroEngine`, `F5Engine`
- Produces: `AdaptiveRouter.pick(role, lang) -> engineId`

- [ ] **Step 1: Write failing test**

```js
test('router picks local when installed', () => {
  const r = new AdaptiveRouter({registry, role:'reply', lang:'en'})
  assert.equal(r.pick(), 'kokoro')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/router.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement router with per-role engine toggle**

```js
pick(role, lang){
  const pref = this.cfg.roles[role]?.engine || 'auto'
  if(pref==='off') return null
  // auto logic
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/router.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/index.js lib/client.js
git commit -m "feat(router): adaptive per-role engine"
```

### Task 5: Streaming Playback

**Files:**
- Create: `lib/client/worklet.js`
- Modify: `lib/client.js:700-800`
- Test: manual `dsh-tts/preview` SSE

**Interfaces:**
- Consumes: `AudioWorklet`, `ReadableStream`
- Produces: `streamingPlay(url) -> Promise`

- [ ] **Step 1: Write failing test (manual)**

No unit test; verify via `curl -N http://127.0.0.1:3080/dsh-tts/stream?text=hi`

- [ ] **Step 2: Implement AudioWorklet**

```js
class TTSWorklet extends AudioWorkletProcessor { process(inputs, outputs){ return true } }
```

- [ ] **Step 3: Manual verify first chunk <500ms**

Run: time curl ...

- [ ] **Step 4: Commit**

```bash
git add lib/client/worklet.js
git commit -m "feat(streaming): worklet playback"
```

### Task 6: ModelManager UI

**Files:**
- Modify: `lib/client.js:500-600`
- Modify: `lib/index.js: routes /models/install`
- Test: manual install button

- [ ] **Step 1: Write failing test (manual)**

Click Install → progress bar appears

- [ ] **Step 2: Implement ModelManager**

```js
async function installModel(engine){ fetch('/dsh-tts/models/install',{method:'POST',body:JSON.stringify({engine})}) }
```

- [ ] **Step 3: Manual verify**

Install Kokoro 450MB → status Installed

- [ ] **Step 4: Commit**

```bash
git add lib/client.js lib/index.js
git commit -m "feat(models): manual install UI"
```
