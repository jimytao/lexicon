import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPhrasePrompt } from './aiPhrasePrompt'

const LOOKUP_MODULES = [
  { id: 'dictionary', enabled: true },
  { id: 'examples', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const CORE_PHRASE_MODULES = [
  { id: 'usageScenes', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

describe('buildPhrasePrompt — short phrase field ownership', () => {
  it('Lookup phrase: meaning is short gloss only; situational content routes to usageIntro/usageScenes', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      lang: 'en',
      cognitive: 'lookup',
      queryType: 'phrase',
    })

    expect(prompt).toContain('"usageIntro"')
    expect(prompt).toMatch(/FIELD OWNERSHIP|字段职责/)
    expect(prompt).toMatch(/LEXICAL|词典式|等价词|short gloss|短释义|1[-–]2句/)
    expect(prompt).toMatch(/禁止.*(来源|语域|情景|何时用)|FORBID.*(origin|register|when-to-use|native)/i)
    // 短词组不得套用「长文必须全文翻译」规则作为 meaning 主职责
    expect(prompt).not.toMatch(
      /CRITICAL — meaning completeness: For long text[\s\S]*DO NOT output only a summary!/,
    )
  })

  it('Core phrase: meaning stays secondary gloss; native intent belongs in usageIntro/usageScenes/feelAnchor', () => {
    const prompt = buildPhrasePrompt({
      modules: CORE_PHRASE_MODULES,
      lang: 'en',
      cognitive: 'core',
      queryType: 'phrase',
    })

    expect(prompt).toContain('"usageIntro"')
    expect(prompt).toContain('"feelAnchor"')
    expect(prompt).toContain('"emotionalTone"')
    expect(prompt).toMatch(/usageIntro/)
    expect(prompt).toMatch(/勿把.*写进\s*"meaning"|Do NOT put .* into "meaning"/i)
  })

  it('omits usageIntro/usageScenes schema when Core disables usageScenes', () => {
    const prompt = buildPhrasePrompt({
      modules: [
        { id: 'usageScenes', enabled: false },
        { id: 'chat', enabled: true },
      ],
      cognitive: 'core',
      queryType: 'phrase',
    })
    expect(prompt).not.toMatch(/"usageIntro"\s*:/)
    expect(prompt).not.toMatch(/"usageScenes"\s*:/)
    expect(prompt).toMatch(/usageIntro\/usageScenes omitted|已关闭/)
  })

  it('2-Tier Proofreading System — includes nativeForm and nativeRationale schema in phrase prompt', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      lang: 'en',
      cognitive: 'lookup',
      queryType: 'sentence',
    })
    expect(prompt).toContain('"nativeForm"')
    expect(prompt).toContain('"nativeRationale"')
    expect(prompt).toMatch(/minimal fix|Minimal Fix|保持句子结构/i)
  })
})

describe('buildPhrasePrompt — sentence / long text keeps full translation duty', () => {
  it('sentence Lookup: meaning must be a faithful sentence-by-sentence translation', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      lang: 'en',
      cognitive: 'lookup',
      queryType: 'sentence',
    })

    expect(prompt).toMatch(/FAITHFUL TRANSLATION|忠实全文翻译|SENTENCE BY SENTENCE|逐句/)
    expect(prompt).toContain('"usageIntro"')
  })

  it('sentence Lookup: forbids summarizing and self-invented numbering in meaning', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      lang: 'en',
      cognitive: 'lookup',
      queryType: 'sentence',
    })

    // No topic-summary escape hatch left, and brevity must not override completeness
    expect(prompt).not.toMatch(/【主题概括】/)
    expect(prompt).toMatch(/NEVER a summary/)
    expect(prompt).toMatch(/Do NOT invent numbering/)
    expect(prompt).toMatch(/completeness always beats brevity/)
  })

  it('short phrase: still keeps meaning as a short gloss (no translation essay rule)', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      lang: 'en',
      cognitive: 'lookup',
      queryType: 'phrase',
    })

    expect(prompt).not.toMatch(/NEVER a summary/)
    expect(prompt).toMatch(/1-2 sentences max|最多 1-2 句/)
  })
})

describe('buildPhrasePrompt — culture stays distinct from usage', () => {
  it('keeps culturalLore distinct from usageScenes when culture enabled', () => {
    const prompt = buildPhrasePrompt({
      modules: LOOKUP_MODULES,
      cognitive: 'lookup',
      queryType: 'phrase',
      isFull: true,
    })
    expect(prompt).toMatch(/distinct from usageScenes|与 usageScenes 区分|勿与 usageScenes 重复/)
  })
})

describe('source wiring — phrase prompt + PhraseView usageIntro', () => {
  const root = join(__dirname, '..')
  const aiSrc = readFileSync(join(root, 'services/ai.ts'), 'utf8')
  const phraseView = readFileSync(join(root, 'components/ResultView/PhraseView.tsx'), 'utf8')
  const typesSrc = readFileSync(join(root, 'types/index.ts'), 'utf8')

  it('ai.ts uses buildPhrasePrompt and passes queryType', () => {
    expect(aiSrc).toContain('buildPhrasePrompt')
    expect(aiSrc).toMatch(/buildPhrasePrompt\([\s\S]*queryType/)
    expect(aiSrc).not.toMatch(/function getPhrasePrompt\s*\(/)
  })

  it('PhraseResult includes optional usageIntro', () => {
    expect(typesSrc).toMatch(/usageIntro\??:\s*string/)
  })

  it('PhraseView renders usageIntro under Usage Contexts before scene cards', () => {
    expect(phraseView).toContain('usageIntro')
    expect(phraseView).toMatch(/usageIntro[\s\S]{0,200}usageScenes|usageScenes[\s\S]{0,80}usageIntro/)
  })

  it('Core word full-lookup prompt separates coreConcept.explanation from usageScenes', () => {
    expect(aiSrc).toMatch(
      /coreConcept\.explanation[\s\S]{0,120}usageScenes|Do NOT dump concrete scenes into coreConcept\.explanation/i,
    )
  })
})
