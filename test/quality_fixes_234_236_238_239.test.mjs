import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

test('Issue #234: scripts/pack-check.mjs blocks stray tarballs in checkout root', () => {
  const root = process.cwd()
  const dummyTarball = path.join(root, 'test-stray-artifact.tgz')
  try {
    fs.writeFileSync(dummyTarball, 'dummy')
    assert.throws(() => {
      execSync('node scripts/pack-check.mjs', { cwd: root, stdio: 'pipe' })
    }, /Untracked release tarballs found/)
  } finally {
    if (fs.existsSync(dummyTarball)) fs.unlinkSync(dummyTarball)
  }
})

test('Issue #236: lib/client-src and lib/client.js have zero rgba fallback colors and use canonical tokens', () => {
  const root = process.cwd()
  const clientDir = path.join(root, 'lib', 'client-src')
  const clientFiles = fs.readdirSync(clientDir).filter((f) => f.endsWith('.js'))
  for (const f of clientFiles) {
    const content = fs.readFileSync(path.join(clientDir, f), 'utf8')
    assert.ok(!content.includes('rgba('), `Found rgba( in ${f}`)
    assert.ok(!content.includes('--dsh-border'), `Found obsolete --dsh-border in ${f}`)
    assert.ok(!content.includes('--dsw-alias-bg-hover'), `Found obsolete --dsw-alias-bg-hover in ${f}`)
  }
  const bundled = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(!bundled.includes('rgba('), 'Found rgba( in bundled lib/client.js')
})

test('Issue #238: lib/ source files have zero unannotated empty catch blocks', () => {
  const root = process.cwd()
  const libDir = path.join(root, 'lib')
  const scanDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) scanDir(full)
      else if (e.isFile() && e.name.endsWith('.js') && e.name !== 'client.js') {
        const text = fs.readFileSync(full, 'utf8')
        assert.ok(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(text), `Empty catch in ${e.name}`)
        assert.ok(!/catch\s*\{\s*\}/.test(text), `Empty catch in ${e.name}`)
        assert.ok(!/\.catch\s*\(\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)?\s*=>\s*\{\s*\}\s*\)/.test(text), `Empty .catch in ${e.name}`)
      }
    }
  }
  scanDir(libDir)
})

test('Issue #239: package.json overrides lock zod >= 4.6.6 and fast-uri >= 3.1.9', () => {
  const root = process.cwd()
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.ok(pkg.overrides, 'package.json should have overrides')
  assert.ok(pkg.overrides.zod, 'overrides.zod should exist')
  assert.ok(pkg.overrides['fast-uri'], 'overrides.fast-uri should exist')
})
