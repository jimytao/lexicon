import { describe, expect, it } from 'vitest'
import { decideHistoryClickRoute } from './historyDecisionTree'

describe('decideHistoryClickRoute', () => {
  it('returns instant mode when neither normal nor bypass cache exists', () => {
    const route = decideHistoryClickRoute({ hasNormalCache: false, hasBypassCache: false })
    expect(route.mode).toBe('instant')
    expect(route.searchSource).toBe('local')
    expect(route.activeTag).toBeNull()
  })

  it('returns normal tag and local source when both caches exist', () => {
    const route = decideHistoryClickRoute({ hasNormalCache: true, hasBypassCache: true })
    expect(route.mode).toBe('ai')
    expect(route.searchSource).toBe('local')
    expect(route.activeTag).toBe('normal')
  })

  it('returns normal tag when only normal cache exists', () => {
    const route = decideHistoryClickRoute({ hasNormalCache: true, hasBypassCache: false })
    expect(route.mode).toBe('ai')
    expect(route.searchSource).toBe('local')
    expect(route.activeTag).toBe('normal')
  })

  it('returns bypass tag and ai-full source when only bypass cache exists', () => {
    const route = decideHistoryClickRoute({ hasNormalCache: false, hasBypassCache: true })
    expect(route.mode).toBe('ai')
    expect(route.searchSource).toBe('ai-full')
    expect(route.activeTag).toBe('bypass')
  })
})
