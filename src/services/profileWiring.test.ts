/**
 * Direction A wiring contracts: the learner profile must reach every AI surface,
 * not just full-sentence corrections, and the result-page insight chip must be
 * mounted where results render.
 *
 * Source-string assertions (like aiSplitContract.test.ts) — cheaper and more
 * robust than seeding localStorage across every prompt builder.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const aiSrc = read('services/ai.ts')
const phraseSrc = read('services/aiPhrasePrompt.ts')

describe('compact profile context is injected into the everyday AI prompts', () => {
  it('the live word full-lookup prompt (getFullLookupPrompt) appends the compact learner context + profileInsight schema', () => {
    const fn = aiSrc.slice(aiSrc.indexOf('function getFullLookupPrompt'), aiSrc.indexOf('export async function aiFullLookup'))
    expect(fn).toMatch(/buildProfilePromptContext\(\s*['"]compact['"]\s*,\s*learningRoute\s*,\s*explanationLanguage\s*\)/)
    expect(fn).toContain('"profileInsight"')
  })

  it('the live phrase prompt appends compact for a plain phrase (full only for a sentence)', () => {
    expect(phraseSrc).toMatch(/buildProfilePromptContext\([\s\S]{0,120}['"]compact['"][\s\S]{0,120}learningRoute/)
    expect(phraseSrc).toMatch(/buildProfilePromptContext\([\s\S]{0,120}['"]full['"][\s\S]{0,120}learningRoute/)
  })

  it('AI follow-up (askQuestion) injects the compact learner context', () => {
    const fn = aiSrc.slice(aiSrc.indexOf('export async function askQuestion'), aiSrc.indexOf('export async function askQuestion') + 2000)
    expect(fn).toMatch(/buildProfilePromptContext\(\s*['"]compact['"]\s*,/)
  })

  it('AI follow-up records the route from the original query rather than the corrected display context', () => {
    const chat = read('components/ResultView/AiSection/AiChatBox.tsx')
    expect(chat).toContain('routeQuery?: string')
    expect(chat).toMatch(/resolveCurrentLearningRoute\(routeQuery \|\| requestContext\)/)
    expect(read('components/ResultView/PhraseView.tsx')).toContain('routeQuery={phrase}')
    expect(read('components/ResultView/AiFullView.tsx')).toContain('routeQuery={word}')
    expect(read('components/ResultView/CoreCognitiveView.tsx')).toContain('routeQuery={word}')
  })
})

describe('ProfileInsightChip is mounted where results render', () => {
  it('the component exists', () => {
    expect(() => read('components/ResultView/ProfileInsightChip.tsx')).not.toThrow()
  })

  for (const view of [
    'components/ResultView/index.tsx',
    'components/ResultView/AiFullView.tsx',
    'components/ResultView/CoreCognitiveView.tsx',
    'components/ResultView/PhraseView.tsx',
  ]) {
    it(`${view} renders <ProfileInsightChip`, () => {
      expect(read(view)).toContain('<ProfileInsightChip')
    })
  }

  it('validates an insight against the original query, not an AI-corrected form', () => {
    const chip = read('components/ResultView/ProfileInsightChip.tsx')
    expect(chip).toContain('routeQuery?: string')
    expect(chip).toMatch(/resolveLearningRoute\(routeQuery \|\| dismissKey,/)
    expect(read('components/ResultView/AiFullView.tsx')).toContain('routeQuery={word}')
    expect(read('components/ResultView/CoreCognitiveView.tsx')).toContain('routeQuery={word}')
    expect(read('components/ResultView/PhraseView.tsx')).toContain('routeQuery={phrase}')
  })
})

describe('Profile modal actions describe their real behavior', () => {
  it('shows and gates manual distillation by the pending event count', () => {
    const modal = read('components/Settings/ProfileModal.tsx')
    expect(modal).toContain('getPendingEvents')
    expect(modal).toMatch(/pendingCount\s*===\s*0/)
    expect(modal).toContain("replace('{count}', String(pendingCount))")
  })
})

describe('search direction is a submit-time snapshot', () => {
  it('captures the selected direction before hydration and passes the route into delayed AI work', () => {
    const app = read('App.tsx')
    const handler = app.slice(app.indexOf('async function handleWordSelect'), app.indexOf('function handleRetry'))
    expect(handler.indexOf('directionSnapshot')).toBeGreaterThanOrEqual(0)
    expect(handler.indexOf('directionSnapshot')).toBeLessThan(handler.indexOf('await ensureSearchStateHydrated()'))
    expect(handler).toMatch(/triggerCombinedLookup\([^\n]+learningRoute\)/)
    expect(handler).toMatch(/triggerCombinedPhraseQuery\([^\n]+learningRoute\)/)
  })

  it('lets AI lookup functions consume an explicit route instead of rereading mutable UI state', () => {
    expect(aiSrc).toContain('learningRoute?: LearningRoute')
    expect(aiSrc).toMatch(/opts\.learningRoute \?\? resolveCurrentLearningRoute\(word\)/)
    expect(aiSrc).toMatch(/opts\.learningRoute \?\? resolveCurrentLearningRoute\(phrase\)/)
  })

  it('keeps follow-up chat and insight visibility on the active search snapshot', () => {
    const chat = read('components/ResultView/AiSection/AiChatBox.tsx')
    const chip = read('components/ResultView/ProfileInsightChip.tsx')
    expect(chat).toContain('learningRoute?: LearningRoute')
    expect(chat).toMatch(/requestLearningRoute = learningRoute \?\? resolveCurrentLearningRoute/)
    expect(chat).toMatch(/askQuestion\([\s\S]{0,500}requestLearningRoute/)
    expect(chip).toContain('learningRoute?: LearningRoute')
    expect(chip).toMatch(/currentRoute = learningRoute \?\? resolveLearningRoute/)
  })
})
