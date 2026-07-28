import { isCapacitor, isTauri } from './platform'

export type AppearanceMode = 'light' | 'dark' | 'system'

/** Capacitor Preferences / SharedPreferences / UserDefaults key (group CapacitorStorage). */
export const APPEARANCE_BOOT_KEY = 'appearance-boot'

/** Match CSS `--color-background` / Tauri cold-start chrome. */
export const BOOT_CHROME_LIGHT = '#FFFFFF'
export const BOOT_CHROME_DARK = '#050505'

export type AppearanceBoot = {
  dark: boolean
  appearance: AppearanceMode
}

export function normalizeAppearanceMode(value: unknown): AppearanceMode {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveDark(appearance: AppearanceMode, systemPrefersDark = getSystemPrefersDark()): boolean {
  if (appearance === 'dark') return true
  if (appearance === 'light') return false
  return systemPrefersDark
}

/**
 * Cold-start chrome: forced light/dark trusts persisted `dark`;
 * system / missing → live OS (same as Tauri resolve_boot_dark).
 */
export function resolveBootDark(
  boot: AppearanceBoot | null | undefined,
  systemPrefersDark: boolean,
): boolean {
  if (boot && (boot.appearance === 'light' || boot.appearance === 'dark')) return boot.dark
  return systemPrefersDark
}

export function bootChromeColor(isDark: boolean): string {
  return isDark ? BOOT_CHROME_DARK : BOOT_CHROME_LIGHT
}

export function serializeAppearanceBoot(dark: boolean, appearance: AppearanceMode | string): string {
  return JSON.stringify({
    dark: !!dark,
    appearance: normalizeAppearanceMode(appearance),
  })
}

export function parseAppearanceBoot(raw: string | null | undefined): AppearanceBoot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { dark?: unknown; appearance?: unknown }
    if (typeof parsed?.dark !== 'boolean') return null
    return {
      dark: parsed.dark,
      appearance: normalizeAppearanceMode(parsed.appearance),
    }
  } catch {
    return null
  }
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

/** Align native chrome + persist boot for next cold start (Tauri + Capacitor). */
export async function syncNativeWindowTheme(
  appearance: AppearanceMode,
  resolvedDark = resolveDark(appearance),
): Promise<void> {
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { invoke } = await import('@tauri-apps/api/core')
      const win = getCurrentWindow()
      const theme = appearance === 'system' ? null : appearance
      await win.setTheme(theme)
      await win.setBackgroundColor(bootChromeColor(resolvedDark))
      await invoke('persist_boot_appearance', { dark: resolvedDark, appearance })
    } catch {
      // Window API may be unavailable in some test / preview hosts.
    }
    return
  }

  if (isCapacitor()) {
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({
        key: APPEARANCE_BOOT_KEY,
        value: serializeAppearanceBoot(resolvedDark, appearance),
      })
    } catch {
      // Preferences may be unavailable in tests / web preview.
    }
  }
}
