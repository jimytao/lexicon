import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extensionReleaseUrl } from './updateStore'

describe('extension update link', () => {
  it('opens the versioned Release that also holds the APK / EXE / IPA', () => {
    expect(extensionReleaseUrl('0.9.29')).toBe('https://github.com/jimytao/lexicon/releases/tag/v0.9.29')
  })

  it('no longer sends users to the frozen extension-preview Release', () => {
    const src = readFileSync(new URL('./updateStore.ts', import.meta.url), 'utf8')
    expect(src).not.toContain('extension-preview')
    expect(src).toContain('extensionReleaseUrl(manifest.version)')
  })
})
