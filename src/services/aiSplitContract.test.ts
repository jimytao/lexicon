/**
 * v0.9.15 contracts the split architecture depends on:
 *  - monolingual means "answer in English whatever I type", so it is NOT gated
 *    on the input language (prompt side AND UI side must agree);
 *  - with monolingual off, foreign input is explained in the learner's native language;
 *  - the stage-1 anchor is carried into both halves so they cannot diverge.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPhrasePrompt } from './aiPhrasePrompt'

const root = join(__dirname, '..')
const aiSrc = readFileSync(join(root, 'services/ai.ts'), 'utf8')
const hookSrc = readFileSync(join(root, 'hooks/useAiLookup.ts'), 'utf8')
const aiFullView = readFileSync(join(root, 'components/ResultView/AiFullView.tsx'), 'utf8')

const baseModules = [
  { id: 'dictionary', enabled: true },
  { id: 'examples', enabled: true },
]

describe('monolingual is language-independent', () => {
  it('the per-query language helper does not bail out on non-English input', () => {
    const fn = aiSrc.slice(aiSrc.indexOf('function getLanguageSpec'), aiSrc.indexOf('export interface MeaningsAnchor'))
    expect(fn).toContain('resolveNativeLanguage(query, config)')
    expect(fn).not.toContain("if (lang !== 'en') return false")
  })

  it('getFullLookupPrompt does not gate isMono on lang', () => {
    expect(aiSrc).not.toContain("const isMono = monolingualWord && lang === 'en'")
  })

  it('AiFullView hides translations on the same rule the prompt uses', () => {
    expect(aiFullView).not.toContain("monolingualWord && lang === 'en'")
    expect(aiFullView).toContain('const shouldHideTranslation = monolingualWord')
  })
})

describe('non-monolingual foreign input is explained in the native language', () => {
  it('word prompt states it explicitly rather than leaving it to roleIntro', () => {
    expect(aiSrc).toMatch(/buildInputDirectionRule\(spec, lang\)/)
    expect(aiSrc).toMatch(/buildNativeLanguageContract\(spec\)/)
  })

  it('phrase prompt translates and explains ja input in Chinese for the zh lane', () => {
    const prompt = buildPhrasePrompt({ modules: baseModules, lang: 'ja', explanationLanguage: 'zh' })
    expect(prompt).toMatch(/Input in another language: translate it into Chinese/)
    expect(prompt).toMatch(/MUST be written in Chinese/)
  })

  it('phrase prompt always carries the language contract, for en and zh input too', () => {
    for (const lang of ['en', 'zh']) {
      const prompt = buildPhrasePrompt({ modules: baseModules, lang, explanationLanguage: 'zh' })
      expect(prompt).toMatch(/LEARNER LANGUAGE CONTRACT/)
      expect(prompt).not.toMatch(/Input in another language/)
    }
  })

  it('monolingual (resolved as en) wins over the foreign-input rule', () => {
    const prompt = buildPhrasePrompt({ modules: baseModules, lang: 'ja', explanationLanguage: 'en' })
    expect(prompt).toMatch(/ALL output text must be in English only/)
    expect(prompt).not.toMatch(/MUST be written in Chinese/)
  })
})

describe('stage-1 anchor reaches both halves', () => {
  it('runs the culture-aware gate in stage 1 and permits a natural short expression', () => {
    const uses = aiSrc.match(/buildCultureAwareInputRule\(\)/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(2)
    expect(aiSrc).toMatch(/closest natural English word or short expression/i)
  })

  it('phrase prompt pins correctForm when an anchor is supplied', () => {
    const prompt = buildPhrasePrompt({
      modules: baseModules,
      lang: 'zh',
      meaningsAnchor: { correctForm: 'break the ice', senses: [{ senseIndex: 1, zh: '打破僵局' }] },
    })
    expect(prompt).toContain('RESOLVED TARGET')
    expect(prompt).toContain('break the ice')
    expect(prompt).toContain('打破僵局')
  })

  it('phrase prompt stays clean with no anchor', () => {
    const prompt = buildPhrasePrompt({ modules: baseModules, lang: 'zh' })
    expect(prompt).not.toContain('RESOLVED TARGET')
  })

  it('aiFullLookup forwards the anchor into the prompt builder', () => {
    expect(aiSrc).toMatch(/getFullLookupPrompt\([\s\S]{0,240}?opts\.anchor, learningRoute\)/)
  })
})

describe('the halves run in parallel off one shared web search', () => {
  it('both halves are awaited together, not sequentially', () => {
    expect(hookSrc).toContain("Promise.all([runHalf(selected), runHalf(other)])")
  })

  it('web search is hoisted out of the halves', () => {
    expect(hookSrc).toContain('await performWebSearch(word, signal)')
    expect(aiSrc).toContain('opts.webResults ?? await performWebSearch(word, signal)')
  })

  it('the local-dictionary anchor is rejected when it belongs to another word', () => {
    expect(hookSrc).toMatch(/normalizeQuery\(wr\.word\) === normalizeQuery\(word\)/)
  })

  it('force-AI ignores the local dictionary anchor entirely', () => {
    expect(hookSrc).toMatch(/tag !== 'bypass'/)
  })

  it('a cancelled stage-1 aborts the request instead of being swallowed', () => {
    expect(hookSrc).toMatch(/classifyAiRequestError\(e, signal\.reason\) === 'abort'\) throw e/)
  })
})
