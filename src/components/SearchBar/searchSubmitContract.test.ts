import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'index.tsx'), 'utf8')

describe('SearchBar Enter submission contract', () => {
  it('submits the live textarea value instead of possibly stale React state', () => {
    expect(source).toContain('(textareaRef.current?.value ?? query).trim()')
  })

  it('does not submit Enter while an IME composition is active', () => {
    expect(source).toContain('if (e.nativeEvent.isComposing) return')
  })
})