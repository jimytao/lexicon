import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const searchBarSource = readFileSync(join(__dirname, 'index.tsx'), 'utf8')
const settingsSource = readFileSync(join(__dirname, '..', 'Settings', 'SettingsView.tsx'), 'utf8')

describe('learning direction UI contract', () => {
  it('turns the passive leading search glyph into an accessible IN/OUT control', () => {
    expect(searchBarSource).toContain("t('search.directionToggle')")
    expect(searchBarSource).toContain("learningDirection === 'in' ? 'IN' : 'OUT'")
    expect(searchBarSource).toContain('setLearningDirection')
  })

  it('offers a separate default direction choice in the Profile settings area', () => {
    expect(settingsSource).toContain("t('settings.defaultLearningDirection')")
    expect(settingsSource).toContain('setDefaultLearningDirection')
    expect(settingsSource).toContain("id: 'in' as const")
    expect(settingsSource).toContain("id: 'out' as const")
  })
})
