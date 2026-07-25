/**
 * AbortSignal helpers for environments without AbortSignal.any / AbortSignal.timeout
 * (older Android WebViews).
 */

export interface CombinedAbortSignal {
  signal: AbortSignal
  /** Clear the timeout timer; safe to call multiple times. */
  dispose: () => void
}

/**
 * Merge an optional user AbortSignal with a timeout. Abort reason is TimeoutError
 * DOMException when the timer fires; user abort forwards userSignal.reason.
 */
export function combineSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): CombinedAbortSignal {
  const ctrl = new AbortController()
  let settled = false

  const tid = setTimeout(() => {
    if (settled) return
    settled = true
    ctrl.abort(new DOMException('TimeoutError', 'TimeoutError'))
  }, timeoutMs)

  const onUserAbort = () => {
    if (settled) return
    settled = true
    clearTimeout(tid)
    ctrl.abort(userSignal!.reason)
  }

  if (userSignal) {
    if (userSignal.aborted) {
      onUserAbort()
    } else {
      userSignal.addEventListener('abort', onUserAbort, { once: true })
    }
  }

  return {
    signal: ctrl.signal,
    dispose: () => {
      settled = true
      clearTimeout(tid)
      if (userSignal) {
        userSignal.removeEventListener('abort', onUserAbort)
      }
    },
  }
}
