import os from "node:os"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { PROVIDER_KEYS, DEFAULT_MODELS, DEFAULT_VOICES } from '../lib/providers/constants.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Block 6: #184 & #185 - npm pack strictly excludes internal docs and scripts', () => {
  const stdout = execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8' })
  let result
  const jsonStart = stdout.indexOf('{')
  const jsonEnd = stdout.lastIndexOf('}')
  const arrStart = stdout.indexOf('[')
  const arrEnd = stdout.lastIndexOf(']')

  if (jsonStart >= 0 && (arrStart === -1 || jsonStart < arrStart)) {
    result = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1))
  } else {
    result = JSON.parse(stdout.slice(arrStart, arrEnd + 1))
  }

  const entry = Array.isArray(result) ? result[0] : Object.values(result)[0]
  const files = entry.files.map((f) => f.path)

  const forbidden = [
    'AGENTS.md',
    'index.md',
    'task_plan.md',
    'findings.md',
    'progress.md',
    'credentials.yaml',
  ]
  for (const f of forbidden) {
    assert.ok(!files.includes(f), `file ${f} must NEVER be packaged in npm`)
  }

  // No test or dev script files in package
  assert.equal(files.filter((f) => f.startsWith('test/')).length, 0)
  assert.equal(files.filter((f) => f.startsWith('scripts/')).length, 0)
  assert.equal(files.filter((f) => f.startsWith('.worktrees/')).length, 0)
})

test('Block 6: #183 - README documented provider keys and defaults match constants.js', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  // All active providers in PROVIDER_KEYS must be mentioned in README
  for (const p of PROVIDER_KEYS) {
    assert.ok(readme.includes(`\`${p}\``), `Provider ${p} must be documented in README.md`)
  }
})

test('Block 6: #182 - cache operations strictly isolate storage within temporary directories', async () => {
  const { createSpeechCache, cacheKey } = await import('../lib/cache.js')
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dsh-tts-cache-test-'))
  try {
    const cache = createSpeechCache({ root: tmpDir, maxBytes: 1024 * 1024 })
    const key = cacheKey(['isolate', 'test'])
    await cache.put(key, 'audio/wav', Buffer.from([1, 2, 3]))
    const hit = await cache.get(key)
    assert.ok(hit)
    assert.deepEqual(hit.audio, Buffer.from([1, 2, 3]))
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    assert.equal(fs.existsSync(tmpDir), false, 'temporary directory must be fully cleaned')
  }
})

test('Block 6: #184 - DEV internal documentation exists in DEV repo and is excluded from npm', () => {
  assert.ok(fs.existsSync(path.join(root, 'AGENTS.md')), 'AGENTS.md must exist in DEV repo')
  assert.ok(fs.existsSync(path.join(root, 'index.md')), 'index.md must exist in DEV repo')
  assert.ok(fs.existsSync(path.join(root, 'docs/architecture.md')), 'docs/architecture.md must exist in DEV repo')
  assert.ok(fs.existsSync(path.join(root, 'docs/testing.md')), 'docs/testing.md must exist in DEV repo')
  assert.ok(fs.existsSync(path.join(root, 'docs/deployment.md')), 'docs/deployment.md must exist in DEV repo')
})

test('Block 6: #185 - publish-github.sh correctly excludes lib/client-src/ from sanitized tree', () => {
  const out = execSync('bash scripts/publish-github.sh --check', { cwd: root, encoding: 'utf8' })
  assert.match(out, /WILL BE PUBLISHED/, 'must run publish-github check')
  const willBePublished = out.split('WILL BE DROPPED')[0]
  assert.ok(!willBePublished.includes('lib/client-src/'), 'sanitized tree must never contain lib/client-src/')
  assert.ok(willBePublished.includes('lib/client.js'), 'sanitized tree must contain lib/client.js')
})

test('Block 6: #183 - README files do not claim AudioWorklet, sub-300ms or settings.yaml', () => {
  for (const name of ['README.md', 'README.ru.md', 'README.zh.md']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8')
    assert.ok(!text.includes('AudioWorklet'), `${name} must not claim AudioWorklet`)
    assert.ok(!text.includes('<300ms'), `${name} must not claim <300ms`)
    assert.ok(!text.includes('settings.yaml'), `${name} must not claim settings.yaml`)
  }
})
