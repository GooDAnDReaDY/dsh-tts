import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('npm pack includes only runtime and product files (#140, #184, #185)', () => {
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
  assert.ok(entry && Array.isArray(entry.files), 'npm pack must return entry with files')
  const files = entry.files.map((f) => f.path)

  const scriptFiles = files.filter((f) => f.startsWith('scripts/'))
  assert.equal(scriptFiles.length, 0, 'npm pack must not include scripts/ directory: ' + scriptFiles.join(', '))

  const clientSrcFiles = files.filter((f) => f.startsWith('lib/client-src/'))
  assert.equal(clientSrcFiles.length, 0, 'npm pack must not include lib/client-src/ fragments: ' + clientSrcFiles.join(', '))

  // Excluded internal documents (#184, #185)
  assert.ok(!files.includes('AGENTS.md'), 'AGENTS.md must be excluded from npm package')
  assert.ok(!files.includes('index.md'), 'index.md must be excluded from npm package')
  assert.ok(!files.includes('task_plan.md'), 'task_plan.md must be excluded from npm package')
  assert.ok(!files.some((f) => f.startsWith('.worktrees/')), '.worktrees must be excluded')
  assert.ok(!files.some((f) => f.startsWith('test/')), 'test files must be excluded')

  const requiredFiles = [
    'lib/index.js',
    'lib/client.js',
    'package.json',
    'cordis.patch.yml',
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'README.ru.md',
    'README.zh.md',
  ]
  for (const req of requiredFiles) {
    assert.ok(files.includes(req), `npm pack must include ${req}`)
  }
})
