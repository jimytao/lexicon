import { describe, expect, it } from 'vitest'
import { getNativeLanguage } from './nativeLanguage'
import {
  buildCultureAwareInputRule,
  buildNativeSceneDescription,
  buildNativeSceneRules,
} from './aiPromptGuidance'

describe('native scene prompt guidance', () => {
  it('asks for scenes in the learner language and resists forced positivity', () => {
    for (const code of ['zh', 'vi'] as const) {
      const spec = getNativeLanguage(code)
      const description = buildNativeSceneDescription(spec)
      const rules = buildNativeSceneRules(spec)

      expect(description).toContain(`2-4 sentences in ${spec.name}`)
      expect(description).toMatch(/positive, negative, neutral, or mixed/)
      expect(rules).toContain(`(written in ${spec.name})`)
      expect(rules).toMatch(/Never turn restraint, deprivation, or self-denial into praise/)
      expect(rules).toMatch(/The scene IS the main body/)
    }
  })

  it('keeps monolingual guidance entirely in English', () => {
    const en = getNativeLanguage('en')
    const guidance = `${buildNativeSceneDescription(en)}\n${buildNativeSceneRules(en)}`

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
