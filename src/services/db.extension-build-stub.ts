import type { DBService } from './db'

/** Extension-build-only replacement for the unreachable Capacitor adapter. */
export const nativeDB: DBService = new Proxy({} as DBService, {
  get() {
    throw new Error('Native database adapter is unavailable in the browser extension')
  },
})