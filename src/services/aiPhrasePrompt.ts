/**
 * Phrase / sentence AI prompt builder.
 * Field ownership: short phrases keep meaning as a gloss;
 * situational / native-mind content goes to usageIntro + usageScenes.
 * Learner language: every explanatory field is a template over `spec.name`
 * (see nativeLanguage.ts); the prompt ends with the shared language contract.
 */

import { buildProfilePromptContext } from './profile'
import { buildCultureAwareInputRule } from './aiPromptGuidance'
import {
  buildInputDirectionRule,
  buildNativeLanguageContract,
  exampleGlossDesc,
  getNativeLanguage,
  type ExplanationLanguage,
} from './nativeLanguage'
import type { MeaningsAnchor } from './ai'
import type { LearningRoute } from '../types'

export type PhrasePromptQueryType = 'phrase' | 'sentence'

export interface BuildPhrasePromptOptions {
  modules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  cognitive?: 'lookup' | 'core'
  /** phrase = short idiom/collocation; sentence = clause / multi-sentence text */
  queryType?: PhrasePromptQueryType
  /** Stage-1 resolution shared by both halves of a split request. */
  meaningsAnchor?: MeaningsAnchor
  /** Resolved learner native language (monolingual already folded in as 'en'). */
  explanationLanguage?: ExplanationLanguage
  learningRoute?: LearningRoute
}

function moduleEnabled(modules: Array<{ id: string; enabled: boolean }>, id: string): boolean {
  return modules.some((m) => m.id === id && m.enabled)
}

export function buildPhrasePrompt({
  modules,
  lang = 'en',
  webSearchResults,
  isFull = true,
  triLingual = false,
  cognitive = 'lookup',
  queryType = 'phrase',
  meaningsAnchor,
  explanationLanguage = 'zh',
  learningRoute = 'irrelevant',
}: BuildPhrasePromptOptions): string {
  const isEnabled = (id: string) => moduleEnabled(modules, id)
  const isCore = cognitive === 'core'
  const spec = getNativeLanguage(explanationLanguage)
  const L = spec.name
  const isShortPhrase = queryType === 'phrase'
  const wantUsage = !isCore || isEnabled('usageScenes')
  // The learner's own language is a source of expression needs, not "foreign" culture material.
  const isForeign = lang !== 'en' && lang !== 'zh' && lang !== spec.code

  const meaningDesc = isShortPhrase
    ? `LEXICAL ${L} gloss only: ${L} equivalents + one short sense nucleus, shaped like 'equivalent; equivalent — short sense nucleus' (e.g. self-conscious -> 'self-aware; uneasy about appearance — overly aware of how others see oneself', written in ${L}). Answer only what it means. FORBID origin, register, slang geography, when-to-use essays, or native-mind scenes.`
    : `FAITHFUL FULL ${L} TRANSLATION of the entire input, sentence by sentence, in the original order. Keep every clause, hedge, modifier, name and number. Never summarize, condense, merge or drop anything. This field holds the translation only — no commentary.`

  const usageIntroDesc = isCore
    ? `1-3 conversational sentences in ${L}: opening blurb for Usage Contexts — native communicative intent, register/slang note, when speakers reach for this (NOT a dictionary gloss)`
    : `1-3 conversational sentences in ${L}: opening blurb for Usage Contexts — situation, register/origin note, tone (NOT a dictionary gloss)`

  const sceneDesc = isCore
    ? `1-3 sentences in ${L}: WHEN a native speaker reaches for this expression, what communicative job it does, and what feeling it carries`
    : `1-3 sentences in ${L}, explaining when to use this expression, tone, and feeling`

  const nativeFormDesc = 'Polished native or formal English rephrasing: how a native speaker or professional writer would naturally elevate or frame this sentence.'

  const nativeRationaleDesc = `1-2 sentences in ${L} explaining WHY native speakers prefer this specific phrase, word choice, or preposition in nativeForm over the literal wording (quote the English words; explain in ${L}).`

  const correctionNoteDesc = `If correctForm differs from input: explain why, in ${L}. When there are multiple changes (grammar, preposition misuse, wrong word/collocation, typos, articles), MUST itemize them with bullet points, one per change: '• <original English span> -> <corrected English span>: <reason written in ${L}>'. Only the two quoted spans stay in English. Mention details only when they matter; never collapse the changes into one vague abstract sentence. Skip trivial capitalization unless necessary. Omit if no change.`

  const unnaturalDesc = spec.isEnglish
    ? `{ "chineseThought": "the source-language or non-native framing (legacy field name; do not assume Chinese)", "nativeConcept": "how a native English speaker conceptualizes it", "reusablePrinciple": "a reusable principle for future speaking/writing" }`
    : `{ "chineseThought": "in ${L}: the literal ${L}-influenced framing the learner carries over (legacy field name)", "nativeConcept": "in ${L}: how a native English speaker actually conceptualizes it", "reusablePrinciple": "in ${L}: a reusable principle for future speaking/writing" }`

  let schema = `{\n  "correctForm": "Minimal Fix version — fix actual grammar errors, preposition misuses, word misuses (incorrect word choice), and typos ONLY. Preserve user's original sentence structure and wording as much as possible.",\n  "correctionNote": "${correctionNoteDesc}",\n  "nativeForm": "${nativeFormDesc}",\n  "nativeRationale": "${nativeRationaleDesc}",\n  "unnaturalMindModel": ${unnaturalDesc},\n  "meaning": "${meaningDesc}"`

  // Lookup：场景始终要；Core：跟 corePhraseModules.usageScenes 开关
  if (wantUsage) {
    schema += `,\n  "usageIntro": "${usageIntroDesc}",\n  "usageScenes": [\n    {\n      "label": "short ${L} context tag (2-4 words)",\n      "description": "${sceneDesc}"\n    }\n  ]`
  }

  if (isCore) {
    schema += `,\n  "feelAnchor": "1 short line in ${L}: sensory feel / atmosphere (not a long scene)",\n  "emotionalTone": "1 short line in ${L}: emotional / social stance"`
  }

  if (isEnabled('examples')) {
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "${L} translation" }\n  ]`
    } else {
      schema += `,\n  "examples": [\n    { "en": "Example sentence using this phrase", "zh": "${exampleGlossDesc(spec)}" }\n  ]`
    }
  }

  if (isFull && isEnabled('culture')) {
    if (isForeign) {
      schema += `,\n  "culturalLore": {\n    "title": "short ${L} tag for the fun background / cultural origin",\n    "content": "1-3 sentences in ${L}: the history, cultural background or reason this expression became popular",\n    "subculture": "in ${L}: if it is ACG / gaming / internet slang, its source and in-group meaning",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    } else {
      schema += `,\n  "culturalLore": {\n    "title": "short ${L} tag (2-4 words)",\n    "content": "1-2 sentences in ${L}: the phrase's register (formal/informal/slang/technical) or any cultural nuance worth knowing",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    }
  }

  // Direction A — optional personalization hook; OMITTED unless clearly relevant.
  schema += `,\n  "profileInsight": "OPTIONAL — OMIT this field entirely unless this phrase clearly relates to one of the learner's listed recurring confusions; then ONE short sentence in ${L} naming the link"`

  schema += `\n}`

  const basePrompt = isCore
    ? `You are a native-speaker cognitive coach for ${spec.audience}. Your job is NOT dictionary lookup — it is to remodel how learners THINK about an expression so they can use it the way natives do (mental picture, emotional stance, cultural fit, when/why to choose it).`
    : `You are a professional English language analyst for ${spec.audience}.`
  const multiLangPrompt = isCore
    ? `You are a cultural-cognitive coach for foreign expressions, explaining them to ${spec.audience}. Prioritize how natives conceptualize the phrase — social meaning, subculture nuance, and when it is the right choice.`
    : `You are a professional multi-language translator and cultural analyst for ${spec.audience}. You specialize in "Cultural Interpretation" — explaining the social, historical, and subculture (especially ACG/Internet) context behind foreign expressions.`

  const fieldOwnership = wantUsage
    ? `- FIELD OWNERSHIP (critical):
  - "meaning" = dictionary gloss / translation only — it answers only "what does it mean".
  - Do NOT put origin, register, slang geography, when-to-use essays, or native-mind scenes into "meaning".
  - Put that situational / native-intent content into "usageIntro" (opening blurb) and "usageScenes" (concrete scene cards).
  - feelAnchor / emotionalTone (Core) = short sensory/emotion lines — not essays that belong in usageIntro.`
    : `- FIELD OWNERSHIP (critical):
  - "meaning" = dictionary gloss / translation only — it answers only "what does it mean".
  - Do NOT put origin, register, slang geography, when-to-use essays, or native-mind scenes into "meaning".
  - usageIntro/usageScenes are omitted (module off); keep meaning as a short gloss only.`

  const meaningCompletenessRule = isShortPhrase
    ? (wantUsage
      ? `- For short phrases/idioms: keep "meaning" to a short gloss (1-2 sentences max). Situational essays belong in usageIntro/usageScenes.`
      : `- For short phrases/idioms: keep "meaning" to a short gloss (1-2 sentences max).`)
    : `- CRITICAL — "meaning" is a FAITHFUL TRANSLATION, NEVER a summary. Translate like a literal, obedient translator, not like an editor writing an abstract:
  - Go SENTENCE BY SENTENCE in the original order. Every sentence of the input must produce its own translated sentence in "meaning" — same sentence count, same order.
  - Carry over EVERY clause, modifier, hedge, intensifier, politeness marker, name, number and connective (e.g. "I don't usually...", "especially", "really", "but", "because"). Nothing may be dropped as redundant.
  - FORBIDDEN in "meaning": gist/abstract/paraphrase, topic-summary lines, merging two sentences into one, commentary, analysis, or "this passage is about...". If your draft has fewer sentences than the input, you are summarizing — redo it.
  - Do NOT invent numbering, bullets or headings that the source does not have. Reproduce the source's own markers verbatim (e.g. a leading thread marker like "1/2" stays "1/2"; it is NOT list item 1).
  - Keep the original register and sentence shape as closely as the target language allows. A plain, slightly literal translation is BETTER than an elegant compressed one.
  - Length sanity check: the translation must be roughly as long as the input. A translation that is a fraction of the input's length is a failure.
  - Interpretation, tone and "what the speaker is really doing" belong in usageIntro / usageScenes — never in "meaning".`

  let prompt = `${isForeign ? multiLangPrompt : basePrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} phrase or sentence, provide a complete analysis${isCore ? ' with native-mind priority' : ''}.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
${buildCultureAwareInputRule()}
${fieldOwnership}
${meaningCompletenessRule}
- CRITICAL — correctForm integrity: Do NOT delete, shorten, summarize, or truncate any part of the input. If input is a long sentence or multi-sentence paragraph, correctForm must preserve ALL sentences and content — only fix actual errors word by word. correctForm is a proofread copy, NOT a rewrite or summary.
- If the input has NO real errors, set correctForm exactly equal to the input (copy it verbatim). Only change what is genuinely wrong.
- correctionNote: Only include when correctForm differs from the input. Write each reason in ${L}. Internally judge each change as (a) understandable but unnatural/not idiomatic, (b) understandable but can flow better, (c) actual grammar/collocation error, or (d) no real error, minor polish only — use that judgment to decide what to say, but do NOT print these English category labels. Mention capitalization/punctuation ONLY if it changes meaning or is a serious mistake. Omit correctionNote entirely if correctForm == input.
- unnaturalMindModel: When input sounds unnatural, unidiomatic, or clearly reflects ${spec.transferLabel}, fill unnaturalMindModel with a detailed cognitive breakdown. The legacy chineseThought field stores the learner/source-language framing; never assume a transfer source that the active dictionary does not support. Omit if input is already natural.
${isCore ? `- Do NOT invent nativeMindModel (legacy). Fill feelAnchor + emotionalTone instead.
- Do NOT invent wordChoiceContrast.
- PRIORITY order for Pure Core: feelAnchor/emotionalTone > unnaturalMindModel (if any)${wantUsage ? ' > usageIntro/usageScenes' : ''} > meaning (lexical gloss still required and accurate).
${wantUsage ? '- usageScenes in Core mode must emphasize native communicative intent (what job the phrase does), not just textbook situations.' : '- usageIntro/usageScenes omitted (module off) — do not invent those fields.'}` : `- Focus on clear lexical meaning, practical usage scenes, and correction quality. nativeMindModel / wordChoiceContrast are NOT required for Lookup mode.`}
- If input is CHINESE (targeting English):
  - correctForm: the most natural, complete English translation of the full input — do NOT omit any part of the Chinese.
  - correctionNote: omit (translation, not correction).
${wantUsage ? '  - usageIntro/usageScenes: explain when to use this translation vs others.' : ''}
${isCore ? '  - feelAnchor/emotionalTone: how an English native would feel/stance the translated expression.\n  - unnaturalMindModel: if a literal Chinese-style English would be tempting, contrast that transfer error with the native concept.' : ''}
- If input is a FOREIGN LANGUAGE (not English/Chinese):
  - meaning: accurate and natural translation (gloss / full translation by query length — still FIELD OWNERSHIP).
${wantUsage ? '  - usageIntro/usageScenes: explain the specific feeling or tone of the original expression.' : ''}
  - culturalLore: PRIORITY: Provide deep cultural/subculture context. Specify historical origins or social context if applicable.
${buildInputDirectionRule(spec, lang)}
${wantUsage ? `- Provide usageIntro (1 blurb) + 2-4 usage scenes${isCore ? '' : ', 2-4 examples'}.` : `- Do not output usageIntro/usageScenes (module off)${isCore ? '' : '; still provide 2-4 examples if examples enabled'}.`}
- Keep everything concise${isShortPhrase ? '' : ' — EXCEPT "meaning" for sentence/paragraph input, where completeness always beats brevity'}.
- Never output anything outside the JSON object.`

  if (isFull && isEnabled('culture')) {
    if (isForeign) {
      prompt += `\n- culturalLore: PRIORITY for foreign phrases. Provide deep cultural/subculture context.`
    } else {
      prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: 1-2 sentences on register or cultural nuance only. Keep it distinct from usageScenes.`
    }
  }

  if (meaningsAnchor?.correctForm) {
    prompt += `

RESOLVED TARGET (stage 1 — already decided, do not re-litigate):
- The expression being explained is: "${meaningsAnchor.correctForm}". Use it as correctForm verbatim.`
    const senses = meaningsAnchor.senses ?? []
    if (senses.length > 0) {
      prompt += `
- Stay consistent with this resolved reading: ${senses.map(sn => sn.zh || sn.en || '').filter(Boolean).join(' / ')}`
    }
  }

  prompt += buildProfilePromptContext(
    queryType === 'sentence' ? 'full' : 'compact',
    learningRoute,
    explanationLanguage,
  )

  prompt += buildNativeLanguageContract(spec)

  return prompt
}
