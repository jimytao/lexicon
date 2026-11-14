import { describe, expect, it } from 'vitest'
import { settleOnAbort } from './aiTransport'

/** A request that ignores its signal, like CapacitorHttp's patched fetch on the phone. */
function deafRequest() {
  let resolve!: (value: string) => void
  const promise = new Promise<string>(r => { resolve = r })
  return { promise, resolve }
}

describe('settleOnAbort', () => {
  it('rejects as soon as the signal aborts, even if the request never listens', async () => {
    const ctrl = new AbortController()
    const req = deafRequest()
    const wrapped = settleOnAbort(req.promise, ctrl.signal)
    ctrl.abort(new DOMException('TimeoutError', 'TimeoutError'))
    await expect(wrapped).rejects.toMatchObject({ name: 'TimeoutError' })
    req.resolve('late reply') // dropped
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(settleOnAbort(deafRequest().promise, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('passes a normal reply through', async () => {
    const ctrl = new AbortController()
    const req = deafRequest()
    const wrapped = settleOnAbort(req.promise, ctrl.signal)
    req.resolve('ok')
    await expect(wrapped).resolves.toBe('ok')
  })
})
