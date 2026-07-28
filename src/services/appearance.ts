import { isTauri } from './platform'

export type AppearanceMode = 'light' | 'dark' | 'system'

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveDark(appearance: AppearanceMode, systemPrefersDark = getSystemPrefersDark()): boolean {
  if (appearance === 'dark') return true
  if (appearance === 'light') return false
  return systemPrefersDark
}

/** Migrate legacy `darkMode` boolean; default new installs to system. */
export function migrateAppearance(
  appearance: unknown,
  legacyDarkMode: unknown,
): AppearanceMode {
  if (appearance === 'light' || appearance === 'dark' || appearance === 'system') return appearance
  if (typeof legacyDarkMode === 'boolean') return legacyDarkMode ? 'dark' : 'light'
  return 'system'
}

export function applyDocumentAppearance(isDark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function subscribeSystemPrefersDark(onChange: (isDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (event: MediaQueryListEvent) => onChange(event.matches)
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}

/** Align Tauri window chrome with in-app appearance (no-op on Web / Capacitor). */
export async function syncNativeWindowTheme(appearance: AppearanceMode): Promise<void> {
  if (!isTauri()) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const theme = appearance === 'system' ? null : appearance
    await getCurrentWindow().setTheme(theme)
  } catch {
    // Window API may be unavailable in some test / preview hosts.
  }
}
