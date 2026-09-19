import { describe, expect, it } from 'vitest'
import { buildNativeSceneDescription, buildNativeSceneRules } from './aiPromptGuidance'

describe('native scene prompt guidance', () => {
  it('keeps bilingual scene descriptions in Chinese and resists forced positivity', () => {
    const description = buildNativeSceneDescription(false)
    const rules = buildNativeSceneRules(false)

    expect(description).toMatch(/褒义、贬义、中性/)
    expect(description).toMatch(/限制、代价或社会暗示/)
    expect(rules).toMatch(/不得把克制、匮乏、算计或自我牺牲统一包装成积极品质/)
  })

  it('keeps monolingual guidance entirely in English', () => {
    const guidance = `${buildNativeSceneDescription(true)}\n${buildNativeSceneRules(true)}`

    expect(guidance).toContain('NATIVE NUANCE CONTRACT')
    expect(guidance).toMatch(/lexical tendency from a context-only reading/i)
    expect(guidance).not.toMatch(/[\u3400-\u9fff]/)
  })
})
