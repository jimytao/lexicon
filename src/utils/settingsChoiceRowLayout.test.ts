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

  it('uses ChoiceRow / layout contract for multi-option selectors', () => {
    expect(settingsSrc).toMatch(/ChoiceRow|SETTINGS_CHOICE_ROW_LAYOUT/)
  })

  it('no longer co-locates defaultModeDesc beside the three mode pills in one squeezed column', () => {
    // Legacy pattern: title + desc in left flex-1 column, pills on the right
    const legacySqueezedBlock = /settings\.defaultModeDesc[\s\S]{0,200}?settings\.defaultMode(?!Desc)/
    // After fix, desc should sit under ChoiceRow / layout.desc, not inside the title column with pills
    expect(settingsSrc).toContain('settings.defaultModeDesc')
    expect(settingsSrc).toContain('settings.historyPreferDesc')
    expect(settingsSrc).toContain('settings.appLanguageDesc')
    // Ensure default mode row is not the old side-by-side title+desc | pills structure
    const defaultModeSection = settingsSrc.slice(
      settingsSrc.indexOf("settings.defaultMode'"),
      settingsSrc.indexOf("settings.defaultMode'") + 800,
    )
    expect(defaultModeSection).not.toMatch(
      /flex-1 min-w-0 pr-3[\s\S]*defaultModeDesc[\s\S]*shrink-0/,
    )
    void legacySqueezedBlock
  })
})
