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
    expect(fn).toMatch(/buildProfilePromptContext\(\s*['"]compact['"]\s*\)/)
    expect(fn).toContain('"profileInsight"')
  })

  it('the live phrase prompt appends compact for a plain phrase (full only for a sentence)', () => {
    expect(phraseSrc).toMatch(/buildProfilePromptContext\([\s\S]{0,80}['"]compact['"]/)
    expect(phraseSrc).toMatch(/buildProfilePromptContext\([\s\S]{0,80}['"]full['"]/)
  })

  it('AI follow-up (askQuestion) injects the compact learner context', () => {
    const fn = aiSrc.slice(aiSrc.indexOf('export async function askQuestion'), aiSrc.indexOf('export async function askQuestion') + 2000)
    expect(fn).toMatch(/buildProfilePromptContext\(\s*['"]compact['"]\s*\)/)
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
})
