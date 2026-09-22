import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('all child_process.spawn calls in lib/ specify windowsHide: true (#1, #135)', () => {
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib')
  function scanFiles(dir) {
    let results = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results = results.concat(scanFiles(full))
      else if (entry.isFile() && entry.name.endsWith('.js')) results.push(full)
    }
    return results
  }
  const files = scanFiles(libDir)
  let checkedSpawns = 0
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8')
    if (code.includes("from 'node:child_process'") || code.includes('from "node:child_process"')) {
      const spawnMatches = [...code.matchAll(/spawn\s*\(([\s\S]*?)\)/g)]
      for (const m of spawnMatches) {
        checkedSpawns++
        assert.ok(
          m[0].includes('windowsHide: true'),
          `spawn call in ${path.basename(file)} must pass windowsHide: true to prevent console window flashing on Windows (#1)`,
        )
      }
    }
  }
  assert.ok(checkedSpawns >= 3, 'expected at least 3 spawn calls in lib/ (local.js, f5.js, updater.js)')
})
