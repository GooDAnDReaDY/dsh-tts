import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('npm pack includes only runtime and product files (#140)', () => {
  const stdout = execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8' })
  const result = JSON.parse(stdout)
  assert.ok(Array.isArray(result) && result.length > 0, 'npm pack must return json array')
  const files = result[0].files.map((f) => f.path)

  const scriptFiles = files.filter((f) => f.startsWith('scripts/'))
  assert.equal(scriptFiles.length, 0, 'npm pack must not include scripts/ directory: ' + scriptFiles.join(', '))

  const clientSrcFiles = files.filter((f) => f.startsWith('lib/client-src/'))
  assert.equal(clientSrcFiles.length, 0, 'npm pack must not include lib/client-src/ fragments: ' + clientSrcFiles.join(', '))

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
