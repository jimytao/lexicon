/**
 * 「待查词」通道：把网页上选中的文字交给侧栏。
 *
 * 为什么要这么一层，而不是直接 `sidePanel.open()` 然后传参：
 * `chrome.sidePanel.open()` 要求用户手势，而实测/社区报告显示手势在穿过
 * `sendMessage` 到 SW 的过程中可能被消耗，右键菜单点击也不总被认作手势
 * （Chromium issue 355266358 / 415694848）。
 *
 * 所以把「捕获词」与「打开侧栏」解耦：
 *   - 词先落到 storage.session
 *   - 侧栏开着 → onChanged 立刻查
 *   - 侧栏没开 → open() 只是机会主义尝试，失败也不丢词；
 *     用户下次打开侧栏时照样会查
 *
 * 见 lexicon-docs/10-browser-extension.md §9（P3）。
 */
import { isExtension } from './platform'
import { normalizeSelection } from './selectionText'

export { MAX_SELECTION_LENGTH, normalizeSelection } from './selectionText'

/** SW 与侧栏共用同一个 key，故常量放在这里而不是各写一份。 */
export const PENDING_QUERY_KEY = 'lexicon:pendingQuery'

export interface PendingQuery {
  text: string
  /** 时间戳。必须有：storage.onChanged 在值相同时不触发，
   *  没有它连续选同一个词第二次就不会响应。 */
  at: number
}

function isValidPending(value: unknown): value is PendingQuery {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<PendingQuery>
  return typeof v.text === 'string' && v.text.length > 0 && typeof v.at === 'number'
}

/** 写入待查词（SW 侧调用）。 */
export async function writePendingQuery(text: string): Promise<void> {
  const normalized = normalizeSelection(text)
  if (!normalized) return
  const payload: PendingQuery = { text: normalized, at: Date.now() }
  await chrome.storage.session.set({ [PENDING_QUERY_KEY]: payload })
}

/**
 * 取出并清除待查词（侧栏挂载时调用一次）。
 * 清除是必要的：否则每次打开侧栏都会重查上一次的词。
 */
export async function takePendingQuery(): Promise<string | null> {
  if (!isExtension()) return null
  try {
    const stored = await chrome.storage.session.get(PENDING_QUERY_KEY)
    const value = stored[PENDING_QUERY_KEY]
    if (!isValidPending(value)) return null
    await chrome.storage.session.remove(PENDING_QUERY_KEY)
    return value.text
  } catch {
    return null
  }
}

/**
 * 订阅待查词（侧栏运行期间）。返回取消订阅函数。
 * 收到后立即清除，避免侧栏重挂载时重复查询。
 */
export function subscribePendingQuery(onQuery: (text: string) => void): () => void {
  if (!isExtension()) return () => undefined

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'session') return
    const change = changes[PENDING_QUERY_KEY]
    if (!change || !isValidPending(change.newValue)) return
    void chrome.storage.session.remove(PENDING_QUERY_KEY)
    onQuery(change.newValue.text)
  }

  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
