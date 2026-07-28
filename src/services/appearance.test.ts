import { beforeEach, describe, expect, it, vi } from 'vitest'

const prefsSet = vi.hoisted(() => vi.fn())
const applyNightMode = vi.hoisted(() => vi.fn(async () => {}))
const releaseSplash = vi.hoisted(() => vi.fn(async () => {}))
const isTauri = vi.hoisted(() => vi.fn(() => false))
const isCapacitor = vi.hoisted(() => vi.fn(() => false))

vi.mock('./platform', () => ({
  isTauri: () => isTauri(),
  isCapacitor: () => isCapacitor(),
}))

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    applyNightMode: (...args: unknown[]) => applyNightMode(...args),
    releaseSplash: (...args: unknown[]) => releaseSplash(...args),
  }),
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: (...args: unknown[]) => prefsSet(...args),
  },
}))

import {
  APPEARANCE_BOOT_KEY,
  BOOT_CHROME_DARK,
  BOOT_CHROME_LIGHT,
  bootChromeColor,
  migrateAppearance,
  normalizeAppearanceMode,
  parseAppearanceBoot,
  resolveBootDark,
  resolveDark,
  serializeAppearanceBoot,
  syncNativeWindowTheme,
  type AppearanceBoot,
} from './appearance'

describe('resolveDark', () => {
  it('forces light and dark regardless of system', () => {
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('light', false)).toBe(false)
    expect(resolveDark('dark', true)).toBe(true)
    expect(resolveDark('dark', false)).toBe(true)
  })

  it('follows system when appearance is system', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
  })
})

describe('migrateAppearance', () => {
  it('keeps valid appearance values', () => {
    expect(migrateAppearance('system', true)).toBe('system')
    expect(migrateAppearance('light', true)).toBe('light')
    expect(migrateAppearance('dark', false)).toBe('dark')
  })

  it('maps legacy darkMode boolean', () => {
    expect(migrateAppearance(undefined, true)).toBe('dark')
    expect(migrateAppearance(undefined, false)).toBe('light')
  })

  it('defaults new installs to system', () => {
    expect(migrateAppearance(undefined, undefined)).toBe('system')
  })

  it('ignores invalid appearance strings and falls back', () => {
    expect(migrateAppearance('auto', true)).toBe('dark')
    expect(migrateAppearance('auto', undefined)).toBe('system')
  })
})

/** Contract table: (appearance, systemDark) → bootDark + chrome */
describe('cold-start boot contract', () => {
  const rows: Array<{
    name: string
    boot: AppearanceBoot | null
    systemDark: boolean
    expectDark: boolean
    expectChrome: string
  }> = [
    {
      name: 'forced light trusts stored dark=false even if OS dark',
      boot: { dark: false, appearance: 'light' },
      systemDark: true,
      expectDark: false,
      expectChrome: BOOT_CHROME_LIGHT,
    },
    {
      name: 'forced dark trusts stored dark=true even if OS light',
      boot: { dark: true, appearance: 'dark' },
      systemDark: false,
      expectDark: true,
      expectChrome: BOOT_CHROME_DARK,
    },
    {
      name: 'system follows live OS (ignore stale dark)',
      boot: { dark: true, appearance: 'system' },
      systemDark: false,
      expectDark: false,
      expectChrome: BOOT_CHROME_LIGHT,
    },
    {
      name: 'missing boot follows OS',
      boot: null,
      systemDark: true,
      expectDark: true,
      expectChrome: BOOT_CHROME_DARK,
    },
  ]

  for (const row of rows) {
    it(row.name, () => {
      const dark = resolveBootDark(row.boot, row.systemDark)
      expect(dark).toBe(row.expectDark)
      expect(bootChromeColor(dark)).toBe(row.expectChrome)
    })
  }

  it('chrome constants match CSS tokens (#FFFFFF / #050505)', () => {
    expect(BOOT_CHROME_LIGHT).toBe('#FFFFFF')
    expect(BOOT_CHROME_DARK).toBe('#050505')
  })
})

describe('appearance boot serialize / parse', () => {
  it('round-trips valid payloads', () => {
    const raw = serializeAppearanceBoot(true, 'dark')
    expect(JSON.parse(raw)).toEqual({ dark: true, appearance: 'dark' })
    expect(parseAppearanceBoot(raw)).toEqual({ dark: true, appearance: 'dark' })
  })

  it('normalizes invalid appearance to system on serialize', () => {
    expect(JSON.parse(serializeAppearanceBoot(false, 'auto' as never))).toEqual({
      dark: false,
      appearance: 'system',
    })
  })

  it('parse returns null for garbage', () => {
    expect(parseAppearanceBoot(undefined)).toBeNull()
    expect(parseAppearanceBoot('')).toBeNull()
    expect(parseAppearanceBoot('{')).toBeNull()
    expect(parseAppearanceBoot('null')).toBeNull()
    expect(parseAppearanceBoot('{"dark":1}')).toBeNull()
  })

  it('parse coerces appearance via normalizeAppearanceMode', () => {
    expect(normalizeAppearanceMode('light')).toBe('light')
    expect(normalizeAppearanceMode('nope')).toBe('system')
    expect(parseAppearanceBoot('{"dark":false,"appearance":"light"}')).toEqual({
      dark: false,
      appearance: 'light',
    })
    expect(parseAppearanceBoot('{"dark":true}')).toEqual({
      dark: true,
      appearance: 'system',
    })
  })
})

describe('syncNativeWindowTheme Capacitor path', () => {
  beforeEach(() => {
    prefsSet.mockReset()
    applyNightMode.mockClear()
    releaseSplash.mockClear()
    isTauri.mockReturnValue(false)
    isCapacitor.mockReturnValue(true)
  })

  it(`writes ${APPEARANCE_BOOT_KEY} and applies native night mode + releases splash`, async () => {
    await syncNativeWindowTheme('dark', true)
    expect(prefsSet).toHaveBeenCalledWith({
      key: APPEARANCE_BOOT_KEY,
      value: serializeAppearanceBoot(true, 'dark'),
    })
    expect(applyNightMode).toHaveBeenCalledWith({ appearance: 'dark', dark: true })
    expect(releaseSplash).toHaveBeenCalled()
  })

  it('applies light night mode when forcing light against dark OS', async () => {
    await syncNativeWindowTheme('light', false)
    expect(applyNightMode).toHaveBeenCalledWith({ appearance: 'light', dark: false })
  })
})
