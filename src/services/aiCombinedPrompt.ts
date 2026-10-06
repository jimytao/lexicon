/**
 * Combined AI prompt builder — single call returns both Lookup and Core data.
 *
 * Architecture: The AI receives one prompt and returns JSON with two top-level
 * keys: "lookup" (understand-mode data) and "core" (native-mind data).
 * This guarantees natural context linkage between the two views and fixes
 * Chinese input by making the translation intent unambiguous.
 *
 * Schema: { "lookup": { ...AiFullResult fields }, "core": { ...AiFullResult fields } }
 *
 * Learner language: descriptions are templates over `spec.name` (nativeLanguage.ts);
 * the prompt ends with the shared language contract.
 */

import { buildNativeSceneDescription, buildNativeSceneRules } from './aiPromptGuidance'
import {
  buildInputDirectionRule,
  buildNativeLanguageContract,
  exampleGlossDesc,
  getNativeLanguage,
  type ExplanationLanguage,
} from './nativeLanguage'

export interface CombinedPromptOptions {
  lookupModules: Array<{ id: string; enabled: boolean }>
  coreModules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  /** Resolved learner native language (monolingual already folded in as 'en'). */
  explanationLanguage?: ExplanationLanguage
  meaningsAnchor?: Array<{ pos?: string; zh: string; en?: string; senseIndex?: number }>
}

export interface CombinedPhrasePromptOptions {
  lookupModules: Array<{ id: string; enabled: boolean }>
  coreModules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  /** Resolved learner native language (monolingual already folded in as 'en'). */
  explanationLanguage?: ExplanationLanguage
  queryType?: 'phrase' | 'sentence'
  meaningsAnchor?: Array<{ pos?: string; zh: string; en?: string; senseIndex?: number }>
}

function mod(modules: Array<{ id: string; enabled: boolean }>, id: string): boolean {
  return modules.some((m) => m.id === id && m.enabled)
}

// ── Word prompt ───────────────────────────────────────────────────────────────

export function buildCombinedWordPrompt({
  lookupModules,
  coreModules,
  lang = 'en',
  webSearchResults,
  isFull = true,
  triLingual = false,
  explanationLanguage = 'zh',
  meaningsAnchor,
}: CombinedPromptOptions): string {
  const spec = getNativeLanguage(explanationLanguage)
  const L = spec.name
  const isZh = lang === 'zh'
  const isForeign = lang !== 'en' && lang !== 'zh' && lang !== spec.code

  // ── LOOKUP schema ─────────────────────────────────────────────────────────
  const lookupMeaningsDesc = isZh
    ? `in ${L}, 1 sentence: how this English candidate differs in nuance from the Chinese input`
    : `LEXICAL ${L} gloss: ${L} equivalents + one short sense nucleus, e.g. self-conscious -> 'self-aware; uneasy about how one appears — overly aware of oneself' (written in ${L}). No scene prose.`
  const lookupEnDesc = isZh ? 'English candidate word/phrase' : (spec.isEnglish ? 'English sense paraphrase (lexical, not a scene essay)' : 'English definition (lexical)')
  const sceneLabel = `short ${L} context tag (2-4 words)`
  const sceneDesc = buildNativeSceneDescription(spec)

  let lookupSchema = `"correctForm": "corrected spelling (fix typos if any)",
    "phonetic": "IPA for English, Kana/Romaji for Japanese, etc.",
    "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)",
    "coreConcept": {
      "image": "1 short sentence in ${L}: vivid core image for memory",
      "explanation": "1 short sentence in ${L} unifying the main senses for memory (light)"
    }`

  if (isZh) {
    // Chinese reverse lookup: short English candidates only
    lookupSchema += `,
    "meanings": [{ "zh": "${lookupMeaningsDesc}", "en": "${lookupEnDesc}", "pos": "part of speech" }]`
  } else {
    lookupSchema += `,
    "meanings": [
      {
        "zh": "${lookupMeaningsDesc}",
        "en": "${lookupEnDesc}",
        "pos": "specific part of speech",
        "scene": { "label": "${sceneLabel}", "description": "${sceneDesc}" },
        "imageQuery": "a 3-6 word English noun phrase for image search"
      }
    ]`
  }

  if (isFull && mod(lookupModules, 'etymology') && !isZh) {
    lookupSchema += `,
    "etymology": {
      "parts": [{ "segment": "morpheme", "meaning": "meaning in ${L}", "sourceForm": "original Latin/Greek root", "anchor": "common word with same root", "anchorNote": "1 sentence in ${L}: how this anchor word embodies the root meaning" }],
      "story": "1-2 sentences in ${L}: roots/affixes and origin",
      "derivedWords": [{ "word": "derived word", "pos": "pos", "meaning": "meaning in ${L}" }]
    }`
  }

  if (isFull && mod(lookupModules, 'synonyms')) {
    lookupSchema += `,
    "synonyms": [{ "word": "synonym", "distinction": "in ${L}: nuance vs the headword", "tone": "positive|negative|neutral|informal", "whenToUse": "1 sentence in ${L}: mental fit — when natives pick THIS synonym, and when the HEADWORD is still better" }],
    "antonyms": [{ "word": "antonym", "distinction": "in ${L}: nuance vs the headword" }]`
  }

  if (mod(lookupModules, 'examples') && !isZh) {
    if (isForeign && triLingual) {
      lookupSchema += `,
    "examples": [{ "original": "Example in target language", "en": "English translation", "zh": "${L} translation" }]`
    } else {
      lookupSchema += `,
    "examples": [{ "en": "Example sentence", "zh": "${exampleGlossDesc(spec)}" }]`
    }
  }

  // ── CORE schema ───────────────────────────────────────────────────────────
  let coreSchema = `"correctForm": "same as lookup.correctForm",
    "phonetic": "same as lookup.phonetic",
    "pos": "same as lookup.pos",
    "coreConcept": {
      "gloss": "Short lexical gloss in ${L}: equivalents + sense nucleus (NOT a scene essay)",
      "image": "1-2 sentences in ${L}: core physical/metaphorical image",
      "explanation": "2-4 sentences in ${L}: how this image guides REAL USAGE branches — when/why natives extend it this way",
      "feelAnchor": "1 short line in ${L}: sensory feel / atmosphere (NOT a full scene; do not repeat explanation)",
      "emotionalTone": "1 short line in ${L}: emotional tone when natives use this word"
    }`

  if (isZh) {
    // Chinese → Core shows the best English match with native-mind analysis
    coreSchema += `,
    "meanings": [{ "zh": "in ${L}, 1 sentence: how this English candidate differs in nuance from the Chinese input", "en": "best English word/phrase", "pos": "part of speech" }]`
  } else {
    coreSchema += `,
    "meanings": []`
  }

  const wantCoreSynonyms = isFull && mod(coreModules, 'synonyms')
  if (wantCoreSynonyms) {
    coreSchema += `,
    "synonyms": [{ "word": "near-synonym", "distinction": "in ${L}: nuance vs the headword", "tone": "positive|negative|neutral|informal", "whenToUse": "1 sentence in ${L}: mental fit — when natives pick THIS near-synonym AND when the HEADWORD fits better" }],
    "antonyms": [{ "word": "antonym", "distinction": "in ${L}: nuance vs the headword" }]`
  }

  const wantChunks = isFull && mod(coreModules, 'chunks')
  const wantCollocations = isFull && mod(coreModules, 'collocations')
  if (wantChunks || wantCollocations) {
    const note = `REQUIRED: clear meaning in ${L}`
    const spatial = `in ${L}: for prep phrases, briefly explain the preposition's spatial/logical role; omit if none`
    const chunksPart = wantChunks
      ? `"chunks": [{ "chunk": "COMMON PREPOSITIONAL phrase only", "note": "${note}", "spatialExtension": "${spatial}" }]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [{ "chunk": "OTHER common phrase WITHOUT prep focus", "note": "${note}" }]`
      : `"collocations": []`
    coreSchema += `,
    "collocations": { ${chunksPart}, ${colloPart} }`
  }

  if (isFull && mod(coreModules, 'usageScenes')) {
    coreSchema += `,
    "usageScenes": [{ "label": "short ${L} scene tag (2-4 words)", "description": "1-2 sentences in ${L}: when natives use this word, what communicative job it does, typical pattern" }]`
  }

  if (isFull && mod(coreModules, 'wordGraph')) {
    coreSchema += `,
    "conceptGraph": {
      "rootCore": "1-3 word core concept label in ${L}",
      "branches": [{
        "category": "Domain category in ${L} (e.g. Physical Motion, Business)",
        "explanation": "1 sentence in ${L}: why this branch derives from rootCore",
        "examples": [{ "phrase": "typical phrase", "meaning": "REQUIRED: clear meaning in ${L}", "mindHint": "REQUIRED, 1 sentence in ${L}: how a native links this to the root core" }]
      }]
    }`
  }

  if (isFull && mod(coreModules, 'culture')) {
    if (isForeign) {
      coreSchema += `,
    "culturalLore": { "title": "short ${L} tag for the cultural origin", "content": "1-3 sentences in ${L}: cultural background", "subculture": "in ${L}: source / in-group meaning", "register": "formal|informal|slang|technical|neutral" }`
    } else {
      coreSchema += `,
    "culturalLore": { "title": "short ${L} tag (2-4 words)", "content": "1-2 sentences in ${L}: cultural origin, register, or notable usage shift", "register": "formal|informal|slang|technical|neutral" }`
    }
  }

  // ── Full prompt ───────────────────────────────────────────────────────────
  const langLabel = lang === 'en' ? 'English' : lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'

  const roleIntro = `You are an expert English learning coach for ${spec.audience}. You combine a clear vocabulary analyst (for understanding) and a native-speaker cognitive coach (for using). Return analysis in TWO complementary sections.`

  const chineseInputRule = isZh ? `
CRITICAL — CHINESE INPUT RULE (read this first):
The user typed Chinese. This is a Chinese→English translation request from an English learner.
- They want to FIND and LEARN the natural English word/phrase for this Chinese concept.
- Do NOT analyze the Chinese word itself.
- lookup.correctForm: the best single English word/phrase equivalent.
- core.correctForm: same as lookup.correctForm (the English word).
- lookup.meanings: 2-5 English candidates with nuance notes in ${L}.
- core.meanings: the top 1-2 English candidates with a brief nuance note in ${L}.
` : ''

  const anchorText = meaningsAnchor && meaningsAnchor.length > 0 ? `

FIXED MEANINGS ANCHOR:
The meanings for this query have been fixed in Stage 1. You MUST use these exact meanings in the "lookup.meanings" array:
${meaningsAnchor.map((m, i) => `[Sense ${m.senseIndex || i + 1}]: ${m.pos ? `(${m.pos}) ` : ''}${m.zh}${m.en ? ` | ${m.en}` : ''}`).join('\n')}
- Ensure all scenes, collocations, etymology, and pure core cognitive stories match these exact senses in order.` : ''

  const prompt = `${roleIntro}${anchorText}

Given a ${langLabel} input, return ONE JSON object with EXACTLY two top-level keys: "lookup" and "core".
${webSearchResults ? `\nADDITIONAL CONTEXT (Web Search):\n${webSearchResults}\nUse this to ensure accuracy.\n` : ''}
Return ONLY a valid JSON object. No markdown. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "lookup": {
    ${lookupSchema}
  },
  "core": {
    ${coreSchema}
  }
}

Rules:
${buildInputDirectionRule(spec, lang)}
- lookup.scene is REQUIRED for every lookup meaning when the input is not Chinese.
${!isZh ? buildNativeSceneRules(spec) : ''}
${chineseInputRule}
- BOTH sections share the same input word — they are two perspectives on the SAME word.
- lookup = "understand & remember": focus on lexical meanings (gloss first), etymology, examples, light core concept.
- lookup.meanings: MUST be dictionary-style glosses (equivalents + short sense), NOT scene essays. Scenes belong in meanings[].scene.
- core = "use it natively": focus on mental image, feel/emotion, usage branches, when/why natives choose it. Do NOT add a dictionary meanings wall (meanings: [] for English input in core).
- core.coreConcept.gloss: REQUIRED short lexical gloss (equivalents + sense nucleus) so learners see a real translation before imagery.
- core.correctForm and core.phonetic and core.pos: copy from lookup (they must match).
- Do NOT invent nativeMindModel (legacy). Put feel into core.coreConcept.feelAnchor and emotion into core.coreConcept.emotionalTone.
- Do NOT invent wordChoiceContrast — fold why-choose-headword into core.synonyms[].whenToUse (mental fit).
- core.coreConcept.explanation: RICH — how the image guides when/how to use the word. feelAnchor must NOT repeat this.
- Do NOT dump concrete scenes into core.coreConcept.explanation — concrete scenes belong in core.usageScenes.
${mod(coreModules, 'wordGraph') ? '- core.conceptGraph: REQUIRED. Examples MUST be { phrase, meaning, mindHint }; never bare strings or N/A.' : ''}
${wantChunks ? `- core.collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases ONLY.` : ''}
${wantCollocations ? `- core.collocations.collocations: 4-6 OTHER common phrases (no prep focus).` : ''}
${isFull && mod(coreModules, 'usageScenes') ? '- core.usageScenes: 3-5 native usage scenes — not a translation example wall.' : ''}
${wantCoreSynonyms ? '- core.synonyms: 3-5 with tone + whenToUse (include when HEADWORD is better); antonyms: 3-5.' : ''}
${isFull && mod(lookupModules, 'etymology') && !isZh ? `- lookup.etymology.parts: cover ALL meaningful morphemes. For ROOT morphemes fill sourceForm, anchor, anchorNote.` : ''}
${isFull && mod(lookupModules, 'synonyms') ? '- lookup.synonyms: 3-5 with tone + whenToUse; antonyms: 3-5.' : ''}
${mod(lookupModules, 'examples') && !isZh ? '- lookup.examples: 3-5 learner-friendly sentences.' : ''}
${isForeign ? '- For foreign language input: prioritize culturalLore in core section with deep subculture/ACG context.' : ''}
- Keep everything concise. Never output anything outside the JSON object.${buildNativeLanguageContract(spec)}`

  return prompt
}

// ── Phrase prompt ─────────────────────────────────────────────────────────────

export function buildCombinedPhrasePrompt({
  lookupModules,
  coreModules,
  lang = 'en',
  webSearchResults,
  triLingual = false,
  explanationLanguage = 'zh',
  queryType = 'phrase',
  meaningsAnchor,
}: CombinedPhrasePromptOptions): string {
  const spec = getNativeLanguage(explanationLanguage)
  const L = spec.name
  const isZh = lang === 'zh'
  const isForeign = lang !== 'en' && lang !== 'zh' && lang !== spec.code
  const isShortPhrase = queryType === 'phrase'
  const wantUsage = mod(coreModules, 'usageScenes') || !isShortPhrase

  const meaningDesc = isShortPhrase
    ? `LEXICAL ${L} gloss only: ${L} equivalents + one short sense nucleus, e.g. self-conscious -> 'self-aware; uneasy about appearance — overly aware of oneself' (written in ${L}). FORBID origin, register, when-to-use essays, or scene prose.`
    : `FAITHFUL FULL ${L} TRANSLATION of the entire input, sentence by sentence, in the original order. Keep every clause, hedge, modifier, name and number. Never summarize, condense, merge or drop anything. Translation only — no commentary.`

  const sceneDesc = `1-3 sentences in ${L}: WHEN a native speaker reaches for this, what communicative job it does, and what feeling it carries`

  const nativeFormDesc = 'Polished native or formal English rephrasing: how a native speaker or professional writer would naturally elevate or frame this sentence.'

  const nativeRationaleDesc = `1-2 sentences in ${L} explaining WHY native speakers prefer this specific phrase, word choice, or preposition in nativeForm over the literal wording (quote the English words; explain in ${L}).`

  const correctionNoteDesc = `If correctForm differs from input: explain why, in ${L}. When there are multiple changes (grammar, preposition misuse, wrong word/collocation, typos, articles), MUST itemize them with bullet points, one per change: '• <original English span> -> <corrected English span>: <reason written in ${L}>'. Only the two quoted spans stay in English. Never collapse the changes into one vague abstract sentence. Omit if no change.`

  const unnaturalDesc = spec.isEnglish
    ? `{ "chineseThought": "source-language or non-native framing (legacy field name; do not assume Chinese)", "nativeConcept": "how a native English speaker conceptualizes it", "reusablePrinciple": "a reusable principle for future speaking" }`
    : `{ "chineseThought": "in ${L}: the literal ${L}-influenced framing the learner carries over (legacy field name)", "nativeConcept": "in ${L}: how a native English speaker actually conceptualizes it", "reusablePrinciple": "in ${L}: a reusable principle for future speaking" }`

  // ── SHARED correctForm / unnaturalMindModel (same for both sections) ───────
  const sharedFields = `"correctForm": "Minimal Fix version — fix actual grammar errors, preposition misuses, word misuses (incorrect word choice), and typos ONLY. Preserve user's original sentence structure and wording as much as possible.",
    "correctionNote": "${correctionNoteDesc}",
    "nativeForm": "${nativeFormDesc}",
    "nativeRationale": "${nativeRationaleDesc}",
    "unnaturalMindModel": ${unnaturalDesc},
    "meaning": "${meaningDesc}"`

  // ── LOOKUP section ─────────────────────────────────────────────────────────
  let lookupSchema = sharedFields

  if (wantUsage) {
    lookupSchema += `,
    "usageIntro": "1-3 conversational sentences in ${L}: opening blurb — situation, register, tone (NOT a dictionary gloss)",
    "usageScenes": [{ "label": "short ${L} context tag (2-4 words)", "description": "${sceneDesc}" }]`
  }

  if (mod(lookupModules, 'examples')) {
    if (isForeign && triLingual) {
      lookupSchema += `,
    "examples": [{ "original": "Example in target language", "en": "English translation", "zh": "${L} translation" }]`
    } else {
      lookupSchema += `,
    "examples": [{ "en": "Example sentence using this phrase", "zh": "${exampleGlossDesc(spec)}" }]`
    }
  }

  // ── CORE section ───────────────────────────────────────────────────────────
  let coreSchema = sharedFields

  if (wantUsage) {
    coreSchema += `,
    "usageIntro": "1-3 conversational sentences in ${L}: opening blurb — native communicative intent, register/slang note, when speakers reach for this",
    "usageScenes": [{ "label": "short ${L} context tag (2-4 words)", "description": "${sceneDesc}" }]`
  }

  coreSchema += `,
    "feelAnchor": "1 short line in ${L}: sensory feel / atmosphere (not a long scene)",
    "emotionalTone": "1 short line in ${L}: emotional / social stance when using this expression"`

  // ── Full prompt ───────────────────────────────────────────────────────────
  const langLabel = lang === 'en' ? 'English' : lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'

  const roleIntro = `You are an expert English learning coach for ${spec.audience}, analyzing phrases/sentences. Return TWO complementary views in one JSON: Lookup (understanding) and Core (native usage).`

  const chineseInputRule = isZh ? `
CRITICAL — CHINESE INPUT RULE:
The user typed Chinese. This is a Chinese→English learning request.
- correctForm (in BOTH lookup and core): the most accurate English translation of the full Chinese input.
- nativeForm: an elevated, highly idiomatic native English translation.
- correctionNote: omit (this is translation, not correction).
- lookup: provide usage context and scenes for the translated expression.
- core: teach the learner how a native speaker FEELS and USES this English expression.
` : ''

  const anchorText = meaningsAnchor && meaningsAnchor.length > 0 ? `

FIXED MEANINGS ANCHOR:
The meanings for this query have been fixed in Stage 1. You MUST use these exact meanings in the "lookup.meanings" array:
${meaningsAnchor.map((m, i) => `[Sense ${m.senseIndex || i + 1}]: ${m.pos ? `(${m.pos}) ` : ''}${m.zh}${m.en ? ` | ${m.en}` : ''}`).join('\n')}
- Ensure all scenes, collocations, and pure core cognitive stories match these exact senses in order.` : ''

  const prompt = `${roleIntro}${anchorText}

Given a ${langLabel} phrase or sentence, return ONE JSON object with EXACTLY two top-level keys: "lookup" and "core".
${webSearchResults ? `\nADDITIONAL CONTEXT (Web Search):\n${webSearchResults}\n` : ''}
Return ONLY a valid JSON object. No markdown. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "lookup": {
    ${lookupSchema}
  },
  "core": {
    ${coreSchema}
  }
}

Rules:
${buildInputDirectionRule(spec, lang)}
${chineseInputRule}
- Both sections analyze the SAME input from different angles.
- lookup = understanding + practical usage context.
- core = native communicative intent, emotional feel, when/why to choose this expression.
- 2-TIER PROOFREADING:
  - Tier 1: correctForm is MINIMAL FIX ONLY (grammar, preposition, word misuse, typos). Keep original sentence structure intact.
  - Tier 1: correctionNote explains Tier 1 minimal fix items point-by-point, each reason written in ${L}.
  - Tier 2: nativeForm provides polished native/formal rephrasing; nativeRationale explains (in ${L}) why native speakers use this phrase/preposition.
- correctionNote: Only when correctForm differs from input. Omit if no change.
- unnaturalMindModel: Fill only when the input clearly reflects ${spec.transferLabel}. The legacy chineseThought field stores source-language framing; never assume a transfer source that the active dictionary does not support. Omit if naturally idiomatic.
- FIELD OWNERSHIP: meaning = lexical gloss only (equivalents + sense nucleus). Put situational/intent content into usageIntro/usageScenes. Put feel/emotion into feelAnchor/emotionalTone. Do NOT invent wordChoiceContrast.
${isShortPhrase ? '- Short phrases: keep "meaning" to a lexical gloss (1-2 sentences max). Essays belong in usageIntro/usageScenes.' : `- CRITICAL — "meaning" is a FAITHFUL TRANSLATION, NEVER a summary. Translate like a literal, obedient translator, not like an editor writing an abstract:
  - Go SENTENCE BY SENTENCE in the original order — same sentence count, same order as the input.
  - Carry over EVERY clause, modifier, hedge, intensifier, politeness marker, name, number and connective. Nothing may be dropped as redundant.
  - FORBIDDEN in "meaning": gist/abstract/paraphrase, topic-summary lines, merging sentences, commentary. Fewer sentences than the input = summarizing = redo it.
  - Do NOT invent numbering, bullets or headings the source lacks. Reproduce the source's own markers verbatim (a leading thread marker like "1/2" stays "1/2"; it is NOT list item 1).
  - A plain, slightly literal translation is BETTER than an elegant compressed one; the translation must be roughly as long as the input.
  - Interpretation and tone belong in usageIntro/usageScenes — never in "meaning".`}
${wantUsage ? '- Provide usageIntro (1 blurb) + 2-4 usage scenes in both sections.' : ''}
${isForeign ? '- For foreign input: prioritize culturalLore with deep subculture/ACG context.' : ''}
- Keep everything concise${isShortPhrase ? '' : ' — EXCEPT "meaning" for sentence/paragraph input, where completeness always beats brevity'}. Never output anything outside the JSON object.${buildNativeLanguageContract(spec)}`

  return prompt
}
