import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('client-src fragments are strictly under 800 lines', () => {
  const srcDir = path.join(root, 'lib', 'client-src')
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'))
  assert.ok(files.length >= 5, 'expected modular client-src fragments')
  for (const f of files) {
    const lines = readFileSync(path.join(srcDir, f), 'utf8').split('\n').length
    assert.ok(lines <= 800, `file ${f} has ${lines} lines, exceeding 800 line limit`)
  }
})

test('client includes ErrorBoundary and useSyncExternalStore', () => {
  const client = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.match(client, /function createErrorBoundary\(\)/, 'must define createErrorBoundary')
  assert.match(client, /React\.useSyncExternalStore/, 'must use React.useSyncExternalStore')
  assert.match(client, /SNAPSHOT_READY/, 'must define SNAPSHOT_READY')
  assert.match(client, /SNAPSHOT_LOADING/, 'must define SNAPSHOT_LOADING')
})

test('client includes unified dts-page-title and telemetry badges', () => {
  const client = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.match(client, /dts-page-title/, 'must use dts-page-title styling')
  assert.match(client, /statusOnline/, 'must localize statusOnline')
  assert.match(client, /statusOffline/, 'must localize statusOffline')
})
