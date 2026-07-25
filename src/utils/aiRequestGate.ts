/**
 * Generation gate so Instant cancel / newer triggers discard stale AI writes.
 * abort alone is not enough when the response arrives between clear and setState.
 */
export interface AiRequestGate {
  /** Begin a new request; returns the generation token for this request. */
  begin: () => number
  /** Invalidate in-flight work (Instant switch / explicit cancel). */
  cancel: () => void
  /** True iff token still matches the latest begin/cancel. */
  isCurrent: (token: number) => boolean
}

export function createAiRequestGate(): AiRequestGate {
  let gen = 0
  return {
    begin: () => ++gen,
    cancel: () => { gen += 1 },
    isCurrent: (token: number) => token === gen,
  }
}

/** Instant must never apply in-flight AI display writes. */
export function shouldCommitAiDisplay(
  token: number,
  gate: AiRequestGate,
  searchMode: string,
): boolean {
  if (!gate.isCurrent(token)) return false
  if (searchMode === 'instant') return false
  return true
}
