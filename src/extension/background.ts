/**
 * MV3 Service Worker。
 *
 * 职责只有两件：
 *   1. 打开 Side Panel
 *   2. 网络代理 —— 代替页面执行 fetch，从而豁免 CORS
 *      （Brave / Tavily / 自建 AI 端点都不返回 CORS 头，见 §5.0）
 *
 * 硬约束（勿违反，见 10-browser-extension.md §2「SW 无状态原则」）：
 *   - 不放 sql.js —— SW 空闲即终止、无 DOM
 *   - 不读 localStorage —— SW 里根本没有；配置由侧栏组装进请求描述符
 *   - 不含 prompt / 业务逻辑 —— 这里永远只是哑代理
 */
import type { ProxyRequest, ProxyAbort, ProxyResult } from '../services/extensionProxy'
import { writePendingQuery } from '../services/pendingQuery'

const CONTEXT_MENU_ID = 'lexicon-lookup-selection'

// setPanelBehavior 与右键菜单都只需设一次，但 SW 会被反复唤醒，
// 所以放在 onInstalled 而不是模块顶层的副作用里。
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e: unknown) => console.error('[lexicon] setPanelBehavior failed', e))

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    // %s 会被替换为用户选中的文字；菜单文案由 SW 提供，拿不到 i18n 的 t()，
    // 所以走 chrome.i18n 之外的最简做法：中英同列，避免为一行菜单再搭一套机制。
    title: 'Lexicon: "%s"',
    contexts: ['selection'],
  })
})

/* ---------------- 选词 → 侧栏 ---------------- */

/**
 * 把词交给侧栏。
 *
 * 顺序很重要：**先写 storage，再尝试开侧栏**。
 * `sidePanel.open()` 的手势要求很脆（见 pendingQuery.ts 头注释），
 * 失败时词已经存住了，用户下次打开侧栏照样会查 —— 功能不会丢。
 */
async function dispatchSelection(text: string, tabId: number | undefined): Promise<void> {
  await writePendingQuery(text)

  if (tabId === undefined) return
  try {
    await chrome.sidePanel.open({ tabId })
  } catch (e) {
    // 侧栏已开时本就无需 open；未开且手势被拒时退化为「下次打开即查」
    console.debug('[lexicon] sidePanel.open 未成功（已写入待查词，不影响功能）:', e)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return
  if (!info.selectionText) return
  void dispatchSelection(info.selectionText, tab?.id)
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'lookup-selection') return
  const tabId = tab?.id
  if (tabId === undefined) return
  // content script 才拿得到选区；SW 没有 DOM
  chrome.tabs.sendMessage(tabId, { kind: 'getSelection' }, (reply?: { text?: string }) => {
    // 页面没有注入 content script（chrome:// 等）时 lastError 会被置上，忽略即可
    if (chrome.runtime.lastError) return
    if (!reply?.text) return
    void dispatchSelection(reply.text, tabId)
  })
})

/* ---------------- 网络代理 ---------------- */

/** AbortSignal 传不过 message 边界，所以在这一侧持有控制器，按 requestId 取消。 */
const inFlight = new Map<string, AbortController>()

/** ArrayBuffer → base64，不用 FileReader（避免 SW 环境差异）。 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function handleProxyFetch(msg: ProxyRequest): Promise<ProxyResult> {
  const controller = new AbortController()
  inFlight.set(msg.requestId, controller)

  try {
    const res = await fetch(msg.url, {
      method: msg.method ?? 'GET',
      headers: msg.headers,
      body: msg.body,
      signal: controller.signal,
    })

    if (msg.responseAs === 'dataUrl') {
      // 即使非 2xx 也如实上报状态，别把错误页当图片
      if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
      const buf = await res.arrayBuffer()
      const type = res.headers.get('content-type') ?? 'image/jpeg'
      return { ok: true, status: res.status, body: `data:${type};base64,${toBase64(buf)}` }
    }

    // text：无论状态码都把 body 带回去 —— 调用点常要读错误响应体
    return { ok: true, status: res.status, body: await res.text() }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'aborted', aborted: true }
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    inFlight.delete(msg.requestId)
  }
}

function handleAbort(msg: ProxyAbort): ProxyResult {
  inFlight.get(msg.requestId)?.abort()
  inFlight.delete(msg.requestId)
  return { ok: false, error: 'aborted', aborted: true }
}

/** content script 的悬浮按钮点击 */
interface LookupSelectionMessage {
  kind: 'lookupSelection'
  text: string
}

chrome.runtime.onMessage.addListener(
  (
    msg: ProxyRequest | ProxyAbort | LookupSelectionMessage,
    sender,
    sendResponse: (r: ProxyResult | { ok: true }) => void,
  ) => {
    if (msg?.kind === 'lookupSelection') {
      void dispatchSelection(msg.text, sender.tab?.id).then(() => sendResponse({ ok: true }))
      return true
    }

    if (msg?.kind === 'abortFetch') {
      sendResponse(handleAbort(msg))
      return false
    }

    if (msg?.kind === 'proxyFetch') {
      void handleProxyFetch(msg).then(sendResponse)
      return true // 异步响应
    }

    return false
  },
)
