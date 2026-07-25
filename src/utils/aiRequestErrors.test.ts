import { describe, expect, it } from 'vitest'
import {
  classifyAiRequestError,
  remapFetchAbortError,
} from './aiRequestErrors'

describe('classifyAiRequestError', () => {
  it('treats fetch AbortError + TimeoutError reason as timeout (not silent abort)', () => {
    const fetchAbort = new DOMException('The user aborted a request.', 'AbortError')
    const timeoutReason = new DOMException('TimeoutError', 'TimeoutError')
    expect(classifyAiRequestError(fetchAbort, timeoutReason)).toBe('timeout')
  })

  it('treats bare TimeoutError as timeout', () => {
    const timeout = new DOMException('TimeoutError', 'TimeoutError')
    expect(classifyAiRequestError(timeout)).toBe('timeout')
  })

  it('treats user cancel AbortError without timeout reason as abort', () => {
    const fetchAbort = new DOMException('The user aborted a request.', 'AbortError')
    expect(classifyAiRequestError(fetchAbort, undefined)).toBe('abort')
  })

  it('treats normal Error as other', () => {
    expect(classifyAiRequestError(new Error('API key not configured'))).toBe('other')
  })
})

describe('remapFetchAbortError', () => {
  it('rethrows TimeoutError when AbortError was caused by timeout reason', () => {
    const fetchAbort = new DOMException('The user aborted a request.', 'AbortError')
    const timeoutReason = new DOMException('TimeoutError', 'TimeoutError')
    const remapped = remapFetchAbortError(fetchAbort, timeoutReason)
    expect(remapped).toBeInstanceOf(DOMException)
    expect((remapped as DOMException).name).toBe('TimeoutError')
  })

  it('leaves user-cancel AbortError unchanged', () => {
    const fetchAbort = new DOMException('The user aborted a request.', 'AbortError')
    expect(remapFetchAbortError(fetchAbort, undefined)).toBe(fetchAbort)
  })
})
