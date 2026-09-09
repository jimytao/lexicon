import { describe, it, expect, beforeEach, vi } from 'vitest'
import { proxyFetch, proxyFetchDataUrl } from './extensionProxy'
import type { ProxyRequest, ProxyAbort, ProxyResult } from './extensionProxy'

/**
 * 覆盖代理的**契约**，重点是 abort 语义 —— `AbortSignal` 传不过 message 边界，
 * 现有代码又大量依赖切词时 abort 旧请求（generation 作废）。
 * 这条如果坏了，表现是「切词后旧结果覆盖新结果」，极难排查。
 */

type Sent = ProxyRequest | ProxyAbort

let sent: Sent[] = []
/** 由每个用例决定 proxyFetch 请求如何被应答；返回 null 表示永不应答（模拟在途） */
let responder: (msg: ProxyRequest) => ProxyResult | null

function installChromeMock() {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      id: 'test-extension-id',
      lastError: undefined,
      sendMessage: (msg: Sent, cb: (r: ProxyResult | undefined) => void) => {
        sent.push(msg)
        if (msg.kind === 'abortFetch') {
          cb({ ok: false, error: 'aborted', aborted: true })
          return
        }
        const result = responder(msg)
        if (result) setTimeout(() => cb(result), 0)
      },
    },
  }
}

beforeEach(() => {
  sent = []
  responder = () => ({ ok: true, status: 200, body: 'default' })
  installChromeMock()
})

describe('proxyFetch — 基本契约', () => {
  it('把 SW 的应答还原成真正的 Response', async () => {
    responder = () => ({ ok: true, status: 200, body: '{"hello":"world"}' })
    const res = await proxyFetch('https://api.example.com/x')
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
  })

  it('非 2xx 但请求到达服务端时，还原为同状态码的 Response 而不是抛错', async () => {
    // 调用点普遍写 `if (!response.ok) return ''`，必须让这条分支照常工作
    responder = () => ({ ok: false, status: 429, error: 'HTTP 429' })
    const res = await proxyFetch('https://api.example.com/x')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(429)
  })

  it('null-body 状态码（204/205/304）不会让 Response 构造抛错', async () => {
    for (const status of [204, 205, 304]) {
      responder = () => ({ ok: true, status, body: '' })
      const res = await proxyFetch('https://api.example.com/x')
      expect(res.status).toBe(status)
    }
  })

  it('网络层失败（无状态码）抛错', async () => {
    responder = () => ({ ok: false, error: 'net::ERR_NAME_NOT_RESOLVED' })
    await expect(proxyFetch('https://nope.invalid')).rejects.toThrow('ERR_NAME_NOT_RESOLVED')
  })

  it('SW 未响应时给出可读错误', async () => {
    responder = () => null
    const chrome = (globalThis as unknown as { chrome: { runtime: { sendMessage: unknown } } }).chrome
    // 模拟 sendMessage 立刻回调 undefined（SW 挂了）
    chrome.runtime.sendMessage = (msg: Sent, cb: (r: undefined) => void) => {
      sent.push(msg)
      cb(undefined)
    }
    await expect(proxyFetch('https://api.example.com/x')).rejects.toThrow(/未响应|Service Worker/)
  })
})

describe('proxyFetch — 请求描述符组装', () => {
  it('Headers 实例被拍平成可结构化克隆的对象', async () => {
    const headers = new Headers({ Accept: 'application/json' })
    headers.append('X-Subscription-Token', 'secret')
    await proxyFetch('https://api.search.brave.com/x', { headers })
    const msg = sent[0] as ProxyRequest
    expect(msg.headers).toEqual({
      accept: 'application/json',
      'x-subscription-token': 'secret',
    })
  })

  it('数组与普通对象形式的 headers 同样被拍平', async () => {
    await proxyFetch('https://a.example', { headers: [['A', '1']] })
    await proxyFetch('https://b.example', { headers: { B: '2' } })
    expect((sent[0] as ProxyRequest).headers).toEqual({ A: '1' })
    expect((sent[1] as ProxyRequest).headers).toEqual({ B: '2' })
  })

  it('透传 method 与字符串 body，并带上 responseAs', async () => {
    await proxyFetch('https://api.tavily.com/search', {
      method: 'POST',
      body: '{"query":"cat"}',
    })
    const msg = sent[0] as ProxyRequest
    expect(msg.method).toBe('POST')
    expect(msg.body).toBe('{"query":"cat"}')
    expect(msg.responseAs).toBe('text')
  })

  it('每个请求拿到互不相同的 requestId', async () => {
    await proxyFetch('https://a.example')
    await proxyFetch('https://b.example')
    const ids = sent.map((m) => (m as ProxyRequest).requestId)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('proxyFetch — abort 语义（最关键）', () => {
  it('signal 已经 aborted 时立即抛 AbortError，且不发出任何请求', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      proxyFetch('https://api.example.com/x', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(sent).toHaveLength(0)
  })

  it('在途 abort 时抛 AbortError，并用同一个 requestId 通知 SW 取消', async () => {
    responder = () => null // 永不应答，模拟请求在途
    const controller = new AbortController()

    const pending = proxyFetch('https://api.example.com/x', { signal: controller.signal })
    const requestId = (sent[0] as ProxyRequest).requestId

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    const abortMsg = sent.find((m) => m.kind === 'abortFetch') as ProxyAbort | undefined
    expect(abortMsg).toBeDefined()
    expect(abortMsg?.requestId).toBe(requestId)
  })

  it('SW 上报 aborted 时也抛 AbortError（而不是普通 Error）', async () => {
    // 关键：现有代码把 Abort 与 Timeout 分开映射，普通 Error 会被当成可展示错误
    responder = () => ({ ok: false, error: 'aborted', aborted: true })
    await expect(proxyFetch('https://api.example.com/x')).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('正常完成后解绑 abort 监听，事后 abort 不再发消息', async () => {
    const controller = new AbortController()
    await proxyFetch('https://api.example.com/x', { signal: controller.signal })
    const countBefore = sent.length

    controller.abort()
    await Promise.resolve()

    expect(sent).toHaveLength(countBefore)
  })
})

describe('proxyFetchDataUrl', () => {
  it('成功时返回 dataURL', async () => {
    responder = () => ({ ok: true, status: 200, body: 'data:image/png;base64,AAAA' })
    await expect(proxyFetchDataUrl('https://img.example/a.png')).resolves.toBe(
      'data:image/png;base64,AAAA',
    )
  })

  it('请求 responseAs 为 dataUrl', async () => {
    responder = () => ({ ok: true, status: 200, body: 'data:image/png;base64,AAAA' })
    await proxyFetchDataUrl('https://img.example/a.png')
    expect((sent[0] as ProxyRequest).responseAs).toBe('dataUrl')
  })

  it('防盗链返回非 2xx 时给出 null（让 UI 继续试下一个候选）', async () => {
    responder = () => ({ ok: false, status: 403, error: 'HTTP 403' })
    await expect(proxyFetchDataUrl('https://img.example/a.png')).resolves.toBeNull()
  })

  it('拿到的不是 dataURL 时也给出 null，不把错误页当图片', async () => {
    responder = () => ({ ok: true, status: 200, body: '<html>403 Forbidden</html>' })
    await expect(proxyFetchDataUrl('https://img.example/a.png')).resolves.toBeNull()
  })
})

describe('回归：非扩展平台不受影响', () => {
  it('ai.ts 的 searchFetch/aiFetch 只在 isExtension() 为真时走代理', async () => {
    // 这里守的是「别把代理误用到 Web/Tauri/Capacitor」这条边界。
    // isExtension() 的判据是 chrome.runtime.id，删掉即应为假。
    const { isExtension } = await import('./platform')
    expect(isExtension()).toBe(true)

    delete (globalThis as unknown as { chrome?: unknown }).chrome
    vi.resetModules()
    const fresh = await import('./platform')
    expect(fresh.isExtension()).toBe(false)
  })
})
