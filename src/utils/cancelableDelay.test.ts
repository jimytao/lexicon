import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCancelableDelay } from './cancelableDelay'

describe('createCancelableDelay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run a pending blur dismissal after focus returns', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    const delay = createCancelableDelay()

    delay.schedule(dismiss, 200)
    delay.cancel()
    vi.advanceTimersByTime(200)

    expect(dismiss).not.toHaveBeenCalled()
  })

  it('replaces an obsolete pending dismissal with the latest one', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const latest = vi.fn()
    const delay = createCancelableDelay()

    delay.schedule(first, 200)
    delay.schedule(latest, 200)
    vi.advanceTimersByTime(200)

    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
  })
})
