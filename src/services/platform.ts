/** Platform detection utilities */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

export function isWeb(): boolean {
  return !isTauri() && !isCapacitor()
}

export function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (isTauri()) return true
  if (isCapacitor()) return false
  return !/Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
}
