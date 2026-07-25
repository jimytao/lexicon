/** Classify AI fetch failures so timeouts are not swallowed as silent cancels. */

export type AiRequestErrorKind = 'timeout' | 'abort' | 'other'

export function isTimeoutReason(reason: unknown): boolean {
  if (!reason) return false
  if (reason instanceof DOMException && reason.name === 'TimeoutError') return true
  if (typeof reason === 'object' && reason !== null && 'name' in reason) {
    return (reason as { name: string }).name === 'TimeoutError'
  }
  return false
}

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error
    && (error as { name: string }).name === 'AbortError'
}

/**
 * Prefer signal.reason (fetch always throws AbortError on abort).
 * Order: timeout → abort → other.
 */
export function classifyAiRequestError(
  error: unknown,
  signalReason?: unknown,
): AiRequestErrorKind {
  if (isTimeoutReason(signalReason) || isTimeoutReason(error)) return 'timeout'
  if (isAbortError(error)) return 'abort'
  return 'other'
}

/**
 * If fetch rejected with AbortError because of a timeout reason, rethrow TimeoutError
 * so callers can branch before treating it as a silent cancel.
 */
export function remapFetchAbortError(error: unknown, signalReason?: unknown): unknown {
  if (isAbortError(error) && isTimeoutReason(signalReason)) {
    return signalReason instanceof DOMException
      ? signalReason
      : new DOMException('TimeoutError', 'TimeoutError')
  }
  return error
}
