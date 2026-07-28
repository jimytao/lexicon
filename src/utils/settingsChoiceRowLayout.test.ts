import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SETTINGS_CHOICE_ROW_LAYOUT,
  isChoiceRowDescFullWidth,
  isChoiceRowStackedLayout,
} from './settingsChoiceRowLayout'

describe('SETTINGS_CHOICE_ROW_LAYOUT (scheme 1)', () => {
  it('stacks title+controls above a full-width description', () => {
    expect(isChoiceRowStackedLayout(SETTINGS_CHOICE_ROW_LAYOUT.root)).toBe(true)
    expect(SETTINGS_CHOICE_ROW_LAYOUT.titleRow).toContain('justify-between')
    expect(isChoiceRowDescFullWidth(SETTINGS_CHOICE_ROW_LAYOUT.desc)).toBe(true)
  })

  it('keeps option pills from wrapping awkwardly', () => {
    expect(SETTINGS_CHOICE_ROW_LAYOUT.optionButton(true)).toContain('whitespace-nowrap')
    expect(SETTINGS_CHOICE_ROW_LAYOUT.controls).toContain('shrink-0')
  })
})

describe('SettingsView ChoiceRow wiring', () => {
  const settingsSrc = readFileSync(
    join(__dirname, '../components/Settings/SettingsView.tsx'),
    'utf8',
  )

  it('uses ChoiceRow for compact 2-option selectors', () => {
    expect(settingsSrc).toMatch(/ChoiceRow|SETTINGS_CHOICE_ROW_LAYOUT/)
    expect(settingsSrc).toContain('settings.historyPreferDesc')
    expect(settingsSrc).toContain('settings.appLanguageDesc')
  })

  it('uses Accordion for ≥3-option selectors (default mode + appearance)', () => {
    expect(settingsSrc).toContain("settings.defaultMode'")
    expect(settingsSrc).toContain("settings.appearance'")
    const defaultModeIdx = settingsSrc.indexOf("settings.defaultMode'")
    const defaultModeSection = settingsSrc.slice(Math.max(0, defaultModeIdx - 80), defaultModeIdx + 900)
    expect(defaultModeSection).toContain('<Accordion')
    expect(defaultModeSection).not.toMatch(
      /flex-1 min-w-0 pr-3[\s\S]*defaultModeDesc[\s\S]*shrink-0/,
    )
    const appearanceIdx = settingsSrc.indexOf("settings.appearance'")
    const appearanceSection = settingsSrc.slice(Math.max(0, appearanceIdx - 80), appearanceIdx + 900)
    expect(appearanceSection).toContain('<Accordion')
    expect(appearanceSection).toContain("'system'")
  })
})
