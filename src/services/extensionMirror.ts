/**
 * 把侧栏的少量设置镜像到 `chrome.storage.local`，供 content script 读取。
 *
 * 为什么需要：content script 与扩展页**不同 origin**，读不到侧栏的
 * `localStorage`（Zustand persist 就写在那里）。见 10-browser-extension.md §2。
 *
 * 只镜像 content script 真正需要的最小集合 —— 不要把整个设置对象搬过去，
 * 那等于把 API key 暴露到每个网页的脚本环境里。
 */
import { isExtension } from './platform'

export const MIRROR_KEYS = {
  /** 悬浮按钮开关 */
  enabled: 'lexicon:selectionButtonEnabled',
  /** 深浅色：按钮跟随**我们的**外观设置，而不是宿主页的 */
  dark: 'lexicon:isDark',
  /** 站点黑名单（P3c 才做 UI；content script 已能消费） */
  blocklist: 'lexicon:siteBlocklist',
} as const

export function mirrorSelectionButton(enabled: boolean): void {
  if (!isExtension()) return
  void chrome.storage.local.set({ [MIRROR_KEYS.enabled]: enabled }).catch(() => undefined)
}

export function mirrorDark(isDark: boolean): void {
  if (!isExtension()) return
  void chrome.storage.local.set({ [MIRROR_KEYS.dark]: isDark }).catch(() => undefined)
}
