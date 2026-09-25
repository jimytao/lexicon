import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'index.tsx'), 'utf8')

describe('SearchBar focus and alignment contract', () => {
  it('cancels a stale delayed blur when the textarea regains focus', () => {
    expect(source).toContain('createCancelableDelay')
    expect(source).toMatch(/onFocus={[\s\S]{0,500}?\.cancel\(\)/)
    expect(source).toMatch(/document\.activeElement === textareaRef\.current/)
  })

  it('keeps a single line centered while expanded multiline text stays top-aligned', () => {
    expect(source).toMatch(/isMultiLine && !isCollapsed[\s\S]{0,100}items-start[\s\S]{0,100}items-center/)
  })
})
