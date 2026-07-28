import { describe, expect, it } from 'vitest'
import { migrateAppearance, resolveDark } from './appearance'

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
