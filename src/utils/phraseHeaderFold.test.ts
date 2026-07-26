import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORRECT_FORM_FOLD_CHARS, isCorrectFormLong } from './phraseHeaderFold'

describe('isCorrectFormLong', () => {
  it('is false for short correctForm even if note would be long', () => {
    expect(isCorrectFormLong('flat chat')).toBe(false)
    expect(isCorrectFormLong('a'.repeat(CORRECT_FORM_FOLD_CHARS))).toBe(false)
  })

  it('is true only when correctForm itself exceeds threshold', () => {
    expect(isCorrectFormLong('a'.repeat(CORRECT_FORM_FOLD_CHARS + 1))).toBe(true)
  })
})

describe('PhraseView — correctForm fold independent of why-changed (amber)', () => {
  const phraseView = readFileSync(
    join(__dirname, '../components/ResultView/PhraseView.tsx'),
    'utf8',
  )

  it('uses isCorrectFormLong helper (not phrase length / note) for header fold', () => {
    expect(phraseView).toContain('isCorrectFormLong')
    expect(phraseView).not.toMatch(/isHeaderLong\s*=\s*targetPhrase\.length\s*>\s*140\s*\|\|\s*phrase\.length/)
  })

  it('keeps whyChanged / correctionNote outside the correctForm max-h fold container', () => {
    const foldOpen = phraseView.indexOf('correctFormLong && !headerExpanded')
    expect(foldOpen).toBeGreaterThan(-1)

    const afterFold = phraseView.slice(foldOpen)
    const whyIdx = afterFold.indexOf("t('phrase.whyChanged')")
    const expandIdx = afterFold.indexOf("t('phrase.expandHeader')")
    const noteCoreIdx = afterFold.indexOf('isCoreMode && phraseResult.correctionNote')
    expect(whyIdx).toBeGreaterThan(-1)
    expect(expandIdx).toBeGreaterThan(-1)
    // Expand control + end of fold come before amber why-changed
    expect(expandIdx).toBeLessThan(whyIdx)
    expect(afterFold.slice(0, expandIdx)).toContain('max-h-36')
    // Core correctionNote also after expand control
    expect(noteCoreIdx).toBeGreaterThan(expandIdx)
  })

  it('renders DiffText / youEntered outside the correctForm fold as well', () => {
    const foldOpen = phraseView.indexOf('correctFormLong && !headerExpanded')
    const afterFold = phraseView.slice(foldOpen)
    const youEnteredIdx = afterFold.indexOf("t('phrase.youEntered')")
    const expandIdx = afterFold.indexOf("t('phrase.expandHeader')")
    expect(youEnteredIdx).toBeGreaterThan(-1)
    expect(expandIdx).toBeGreaterThan(-1)
    expect(youEnteredIdx).toBeGreaterThan(expandIdx)
  })
})
