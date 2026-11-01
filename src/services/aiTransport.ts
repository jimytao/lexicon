import { isExtension } from './platform'

/** Keep model discovery and background diagnostics on the same transport as lookup. */
export function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isExtension()) {
    return import('./extensionProxy').then(({ proxyFetch }) => proxyFetch(url, init))
  }
  return fetch(url, init)
}
