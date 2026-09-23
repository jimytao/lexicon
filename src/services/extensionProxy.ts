/**
 * 扩展侧网络代理的**页面端**。
 *
 * 为什么需要：浏览器页面里的 `fetch` 受 CORS 约束，而 Brave / Tavily 的搜索 API
 * 与多数自建 AI 端点都不返回 `Access-Control-Allow-Origin`（P-1 已实测，
 * 见 10-browser-extension.md §5.0）。MV3 Service Worker 的 `fetch` 在声明
 * `host_permissions` 后不受 CORS 约束，所以把请求转交给它执行。
 *
 * 硬约束：SW 是**哑代理**，不读配置、不含业务逻辑（配置由页面端 Zustand
 * store 持有）。因此请求描述符
 * 必须在这一侧组装好，含 API key。见 §2 / §4。
 */

export type ProxyResponseAs = 'text' | 'dataUrl'

export interface ProxyRequest {
  kind: 'proxyFetch'
  requestId: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  responseAs: ProxyResponseAs
}

export interface ProxyAbort {
  kind: 'abortFetch'
  requestId: string
}

export type ProxyResult =
  | { ok: true; status: number; body: string }
  | { ok: false; status?: number; error: string; aborted?: boolean }

let _seq = 0
function nextRequestId(): string {
  _seq += 1
  return `${Date.now().toString(36)}-${_seq}`
}

/** RequestInit.headers 可能是 Headers / 数组 / 普通对象，统一拍平成可结构化克隆的对象。 */
function flattenHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined
  const out: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
  } else {
    Object.assign(out, headers)
  }
  return out
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function sendMessage(message: ProxyRequest | ProxyAbort): Promise<ProxyResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (result: ProxyResult | undefined) => {
      if (!result) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError?.message ?? 'Service Worker 未响应',
        })
        return
      }
      resolve(result)
    })
  })
}

/**
 * 与 `fetch` 同签名（够用的子集），返回真正的 `Response`，
 * 这样调用点（`braveTextSearch` 等）完全不用改。
 *
 * `AbortSignal` **无法跨 message 传递**，所以这里用 requestId + 独立的
 * abort 消息复现取消语义 —— 现有代码大量依赖切词时 abort 旧请求，
 * 少了这条会破坏 generation 作废逻辑。
 */
export async function proxyFetch(
  url: string,
  init?: RequestInit,
  responseAs: ProxyResponseAs = 'text',
): Promise<Response> {
  const signal = init?.signal ?? undefined
  if (signal?.aborted) throw abortError()

  const requestId = nextRequestId()

  const request: ProxyRequest = {
    kind: 'proxyFetch',
    requestId,
    url,
    method: init?.method,
    headers: flattenHeaders(init?.headers),
    body: typeof init?.body === 'string' ? init.body : undefined,
    responseAs,
  }

  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return
    onAbort = () => {
      // 通知 SW 取消真实请求；本地立即以 AbortError 拒绝
      void sendMessage({ kind: 'abortFetch', requestId })
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

  try {
    const result = await Promise.race([sendMessage(request), aborted])
    if (!result.ok) {
      if (result.aborted) throw abortError()
      // 有 status 说明请求到达了服务端 → 还原成非 2xx 的 Response，
      // 让调用点原有的 `!response.ok` 分支照常工作
      if (typeof result.status === 'number') {
        return new Response(null, { status: result.status })
      }
      throw new Error(result.error)
    }
    // 204 / 205 / 304 是 null-body 状态码：带 body 构造 Response 会抛 TypeError
    const nullBody = result.status === 204 || result.status === 205 || result.status === 304
    return new Response(nullBody ? null : result.body, { status: result.status })
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort)
  }
}

/** 取图专用：拿到 base64 dataURL（同源，顺带绕开 COEP/CORP 与防盗链）。 */
export async function proxyFetchDataUrl(
  url: string,
  init?: RequestInit,
): Promise<string | null> {
  const res = await proxyFetch(url, init, 'dataUrl')
  if (!res.ok) return null
  const text = await res.text()
  return text.startsWith('data:') ? text : null
}
