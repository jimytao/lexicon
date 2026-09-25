import { describe, expect, it } from 'vitest'
import {
  buildCultureAwareInputRule,
  buildNativeSceneDescription,
  buildNativeSceneRules,
} from './aiPromptGuidance'

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

describe('culture-aware input gate', () => {
  it('recognizes culture-bound language only when there is evidence', () => {
    const rule = buildCultureAwareInputRule()

    expect(rule).toMatch(/slang.*internet meme.*wordplay.*homophone/is)
    expect(rule).toMatch(/only when.*evidence/is)
    expect(rule).toMatch(/source-language community/i)
  })

  it('keeps ordinary lexical analysis and existing field ownership unchanged', () => {
    const rule = buildCultureAwareInputRule()

    expect(rule).toMatch(/otherwise.*ordinary lexical or translation analysis unchanged/is)
    expect(rule).toMatch(/preserve.*schema.*field-ownership/is)
  })
})
