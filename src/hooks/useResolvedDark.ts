import { useEffect, useState } from 'react'
import {
  getSystemPrefersDark,
  resolveDark,
  subscribeSystemPrefersDark,
} from '../services/appearance'
import { useSettingsStore } from '../stores/settingsStore'

/** Reactive resolved dark flag for components that need JS theme branches (e.g. POS badge colors). */
export function useResolvedDark(): boolean {
  const appearance = useSettingsStore((s) => s.appearance)
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark)
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated())

  useEffect(() => {
    setHydrated(useSettingsStore.persist.hasHydrated())
    return useSettingsStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated || appearance !== 'system') return
    setSystemDark(getSystemPrefersDark())
    return subscribeSystemPrefersDark(setSystemDark)
  }, [appearance, hydrated])

  // Before rehydrate, prefer the already-applied document class (set by index.html) over default `system`.
  if (!hydrated && typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark')
  }

  return resolveDark(appearance, systemDark)
}
