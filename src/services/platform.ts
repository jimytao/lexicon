/** Platform detection utilities */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

/**
 * 浏览器扩展（MV3）。侧栏 / content script / SW 都为 true。
 * 判据用 `chrome.runtime.id`：普通网页即使有 `chrome` 对象也拿不到 id。
 */
export function isExtension(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

export function isWeb(): boolean {
  return !isTauri() && !isCapacitor() && !isExtension()
}

export function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (isTauri()) return true
  if (isCapacitor()) return false
  return !/Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
}
