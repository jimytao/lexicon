import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = readFileSync(join(__dirname, '../../vite.config.extension.ts'), 'utf8')

describe('extension manifest runtime contract', () => {
  it('allows local sql.js WebAssembly compilation under MV3 CSP', () => {
    expect(config).toContain("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'")
  })
})