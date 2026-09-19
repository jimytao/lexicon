import { describe, expect, it } from 'vitest'
import appSource from './App.tsx?raw'

describe('slow-device search hydration contract', () => {
  it('waits for settings and result-cache hydration before selecting a word', () => {
    expect(appSource).toContain('useSettingsStore.persist.rehydrate()')
    expect(appSource).toContain('useResultStore.persist.rehydrate()')

    const handler = appSource.slice(
      appSource.indexOf('async function handleWordSelect'),
      appSource.indexOf('function handleRetry'),
    )
    expect(handler.indexOf('await ensureSearchStateHydrated()')).toBeGreaterThan(-1)
    expect(handler.indexOf('await ensureSearchStateHydrated()')).toBeLessThan(handler.indexOf('await selectWord(word)'))
  })

  it('derives loading and failure independently for Lookup and Core', () => {
    expect(appSource).toMatch(/lookupStatus[\s\S]*aiPendingHalves\.lookup[\s\S]*aiFailedHalves\.lookup/)
    expect(appSource).toMatch(/coreStatus[\s\S]*aiPendingHalves\.core[\s\S]*aiFailedHalves\.core/)
  })
})
