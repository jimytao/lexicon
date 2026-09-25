import { describe, expect, it } from 'vitest'
import { resolveLearningRoute } from './learningDirection'

describe('resolveLearningRoute', () => {
  it('uses the selected direction for English input', () => {
    expect(resolveLearningRoute('a sentence from my textbook', 'in', 'en-zh')).toBe('in')
    expect(resolveLearningRoute('I wrote this sentence myself', 'out', 'en-zh')).toBe('out')
  })

  it('lets the selected direction own the active learner language', () => {
    expect(resolveLearningRoute('我想礼貌地拒绝他', 'in', 'en-zh')).toBe('in')
    expect(resolveLearningRoute('我想礼貌地拒绝他', 'out', 'en-zh')).toBe('out')
    expect(resolveLearningRoute('Tôi muốn diễn đạt điều này', 'in', 'en-vi')).toBe('in')
    expect(resolveLearningRoute('Tôi muốn diễn đạt điều này', 'out', 'en-vi')).toBe('out')
  })

  it('keeps non-learning languages out of the English profile', () => {
    expect(resolveLearningRoute('これは日本語の文章です', 'out', 'en-zh')).toBe('irrelevant')
    expect(resolveLearningRoute('Guten Morgen, wie geht es dir?', 'out', 'en-zh')).toBe('irrelevant')
    expect(resolveLearningRoute('Bonjour, comment allez vous?', 'in', 'en-zh')).toBe('irrelevant')
  })

  it('treats a different supported native language as irrelevant', () => {
    expect(resolveLearningRoute('我想表达这个意思', 'in', 'en-vi')).toBe('irrelevant')
    expect(resolveLearningRoute('Tôi muốn nói điều này', 'out', 'en-zh')).toBe('irrelevant')
  })

  it('allows only English in an English-English dictionary', () => {
    expect(resolveLearningRoute('我想表达这个意思', 'in', 'en-en')).toBe('irrelevant')
    expect(resolveLearningRoute('Tôi muốn nói điều này', 'out', 'en-en')).toBe('irrelevant')
    expect(resolveLearningRoute('a sentence from my textbook', 'in', 'en-en')).toBe('in')
  })

  it('uses the effective monolingual override instead of the dormant bilingual dictionary', () => {
    const settings = {
      mainDictionary: 'en-zh' as const,
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: true,
    }
    expect(resolveLearningRoute('我想礼貌地拒绝他，因为这件事让我不舒服。', 'in', settings)).toBe('irrelevant')
    expect(resolveLearningRoute('I want to decline politely because this makes me uncomfortable.', 'out', settings)).toBe('out')
  })

  it('recognises unaccented Vietnamese conservatively and rejects accented non-Vietnamese text', () => {
    expect(resolveLearningRoute('toi muon noi dieu nay', 'in', 'en-vi')).toBe('in')
    expect(resolveLearningRoute('Bonjour, je voudrais un café', 'in', 'en-vi')).toBe('irrelevant')
  })

  it('accepts a single high-confidence accented Vietnamese support word', () => {
    expect(resolveLearningRoute('không', 'in', 'en-vi')).toBe('in')
    expect(resolveLearningRoute('café', 'in', 'en-vi')).toBe('irrelevant')
  })

  it('falls back conservatively for empty or non-linguistic input', () => {
    expect(resolveLearningRoute('', 'out', 'en-zh')).toBe('irrelevant')
    expect(resolveLearningRoute('12345', 'in', 'en-zh')).toBe('irrelevant')
  })
})
