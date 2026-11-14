import { isExtension } from './platform'

/**
 * Make an AbortSignal actually settle the promise.
 *
 * On Capacitor (iOS / Android) `CapacitorHttp` patches `window.fetch` and routes
 * every POST through the native HTTP layer, which never reads `init.signal`.
 * Without this wrapper an abort or a timeout is silently ignored on the phone:
 * the 45 s cap never fires, and a superseded request keeps running until the
 * server answers. The native call itself still cannot be cancelled, but its
 * eventual reply is now dropped instead of landing on whatever is on screen.
 *
 * On the web this is a no-op in practice: native fetch already rejects first.
 */
export function settleOnAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise
  const reason = () => signal.reason ?? new DOMException('Aborted', 'AbortError')
  if (signal.aborted) {
    promise.catch(() => undefined)
    return Promise.reject(reason())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reason())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}

/** Keep model discovery and background diagnostics on the same transport as lookup. */
export function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isExtension()) {
    return import('./extensionProxy').then(({ proxyFetch }) => proxyFetch(url, init))
  }
  return settleOnAbort(fetch(url, init), init?.signal)
}
