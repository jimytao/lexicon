import { describe, expect, it } from 'vitest'
import { isLearningRouteForced, resolveLearningRoute } from './learningDirection'

describe('resolveLearningRoute', () => {
  it('uses the selected direction for English input', () => {
    expect(resolveLearningRoute('a sentence from my textbook', 'in', 'en-zh')).toBe('in')
    expect(resolveLearningRoute('I wrote this sentence myself', 'out', 'en-zh')).toBe('out')
  })

  it('routes the learner support language to OUT automatically', () => {
    expect(resolveLearningRoute('我想礼貌地拒绝他', 'in', 'en-zh')).toBe('out')
    expect(resolveLearningRoute('Tôi muốn diễn đạt điều này', 'in', 'en-vi')).toBe('out')
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

  it('falls back conservatively for empty or non-linguistic input', () => {
    expect(resolveLearningRoute('', 'out', 'en-zh')).toBe('irrelevant')
    expect(resolveLearningRoute('12345', 'in', 'en-zh')).toBe('irrelevant')
  })
})

describe('isLearningRouteForced', () => {
  it('locks only the active support language, regardless of the previous manual selection', () => {
    expect(isLearningRouteForced('这个怎么说', 'en-zh')).toBe(true)
    expect(isLearningRouteForced('cách nói này', 'en-vi')).toBe(true)
    expect(isLearningRouteForced('an English sentence', 'en-zh')).toBe(false)
    expect(isLearningRouteForced('この言葉', 'en-zh')).toBe(false)
  })
})
