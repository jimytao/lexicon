import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AI_CHAT_COMPOSER_LAYOUT,
  isOverflowSafeComposerInputClass,
  isOverflowSafeComposerRowClass,
} from './aiChatComposerLayout'

describe('AI_CHAT_COMPOSER_LAYOUT', () => {
  it('row and input include min-w-0 so Send is not clipped on narrow Android', () => {
    expect(isOverflowSafeComposerRowClass(AI_CHAT_COMPOSER_LAYOUT.row)).toBe(true)
    expect(isOverflowSafeComposerInputClass(AI_CHAT_COMPOSER_LAYOUT.input)).toBe(true)
    expect(AI_CHAT_COMPOSER_LAYOUT.send).toContain('shrink-0')
    expect(AI_CHAT_COMPOSER_LAYOUT.send).toContain('whitespace-nowrap')
  })
})

describe('AiChatBox wiring', () => {
  const chatSrc = readFileSync(
    join(__dirname, '../components/ResultView/AiSection/AiChatBox.tsx'),
    'utf8',
  )

  it('applies the overflow-safe composer layout contract', () => {
    expect(chatSrc).toContain('AI_CHAT_COMPOSER_LAYOUT')
    expect(chatSrc).toMatch(/AI_CHAT_COMPOSER_LAYOUT\.row/)
    expect(chatSrc).toMatch(/AI_CHAT_COMPOSER_LAYOUT\.input/)
    expect(chatSrc).toMatch(/AI_CHAT_COMPOSER_LAYOUT\.send/)
  })

  it('does not leave a bare flex-1 input without min-w-0', () => {
    // Legacy bug: className="flex-1 text-sm border ..." without min-w-0
    expect(chatSrc).not.toMatch(/className="flex-1 text-sm border/)
  })

  it('requires cognitive prop for Lookup/Core dual-track storage', () => {
    expect(chatSrc).toContain('cognitive: CognitiveMode')
    expect(chatSrc).toContain('cognitiveCacheKey')
  })
})
