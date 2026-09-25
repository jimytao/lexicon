export interface CancelableDelay {
  schedule: (callback: () => void, delayMs: number) => void
  cancel: () => void
}

/** Keeps delayed UI dismissal from surviving a newer focus transition. */
export function createCancelableDelay(): CancelableDelay {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timeoutId === null) return
    clearTimeout(timeoutId)
    timeoutId = null
  }

  return {
    schedule(callback, delayMs) {
      cancel()
      timeoutId = setTimeout(() => {
        timeoutId = null
        callback()
      }, delayMs)
    },
    cancel,
  }
}
