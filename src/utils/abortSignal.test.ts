import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combineSignals } from './abortSignal'

describe('combineSignals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('works with no user signal (timeout-only)', () => {
    const { signal } = combineSignals(undefined, 5_000)
    vi.advanceTimersByTime(5_000)
    expect(signal.aborted).toBe(true)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
  })

  it('aborts with TimeoutError reason when timer fires', () => {
    const user = new AbortController()
    const { signal } = combineSignals(user.signal, 30_000)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(DOMException)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
  })

  it('dispose prevents later timeout abort', () => {
    const user = new AbortController()
    const { signal, dispose } = combineSignals(user.signal, 30_000)
    dispose()
    vi.advanceTimersByTime(30_000)
    expect(signal.aborted).toBe(false)
  })

  it('user abort clears timeout and forwards reason', () => {
    const user = new AbortController()
    const { signal } = combineSignals(user.signal, 30_000)
    const reason = new Error('user-cancel')
    user.abort(reason)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(reason)
    vi.advanceTimersByTime(30_000)
    // still aborted for user reason, not overwritten by timeout
    expect(signal.reason).toBe(reason)
  })
})
