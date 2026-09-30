#!/usr/bin/env node
// Concatenate lib/client-src fragments into lib/client.js (single ModuleLoader entry).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(root, 'lib', 'client-src')
const outFile = path.join(root, 'lib', 'client.js')

const files = (await readdir(srcDir)).filter((f) => f.endsWith('.js')).sort()
if (files.length === 0) throw new Error('no client-src fragments')
let out = ''
for (const f of files) {
  out += await readFile(path.join(srcDir, f), 'utf8')
  if (!out.endsWith('\n')) out += '\n'
}
const isCheck = process.argv.includes('--check')
if (isCheck) {
  let current = ''
  try {
    current = await readFile(outFile, 'utf8')
  } catch {
    console.error('lib/client.js does not exist. Run npm run build:client.')
    process.exit(1)
  }
  if (current !== out) {
    console.error('lib/client.js is out of sync with lib/client-src/ fragments. Run npm run build:client.')
    process.exit(1)
  }
  console.log(`verified lib/client.js parity with ${files.length} fragments`)
  process.exit(0)
}

await writeFile(outFile, out, 'utf8')
console.log(`built lib/client.js from ${files.length} fragments (${out.length} bytes)`)
