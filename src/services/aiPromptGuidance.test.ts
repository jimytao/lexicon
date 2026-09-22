import { describe, expect, it } from 'vitest'
import { buildNativeSceneDescription, buildNativeSceneRules } from './aiPromptGuidance'

describe('native scene prompt guidance', () => {
  it('keeps bilingual scene descriptions in Chinese and resists forced positivity', () => {
    const description = buildNativeSceneDescription(false)
    const rules = buildNativeSceneRules(false)

    expect(description).toMatch(/褒义、贬义、中性/)
    expect(description).toMatch(/画面感/)
    expect(rules).toMatch(/不得把克制、匮乏或算计包装成积极品质/)
    expect(rules).toMatch(/场景是骨架/)
  })

  it('keeps monolingual guidance entirely in English', () => {
    const guidance = `${buildNativeSceneDescription(true)}\n${buildNativeSceneRules(true)}`

    expect(guidance).toContain('NATIVE SCENE CONTRACT')
    expect(guidance).toMatch(/lexical tendency from context-only reading/i)
    expect(guidance).toMatch(/SCENE FIRST/i)
    expect(guidance).not.toMatch(/[\u3400-\u9fff]/)
  })
})
