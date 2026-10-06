/**
 * Learner native-language registry — the ONLY place that knows per-language prompt facts.
 *
 * Which language is active is decided once by `resolveDictionaryContext`
 * (per-query-type monolingual switch > main dictionary). Every prompt builder then
 * receives that `ExplanationLanguage` code, looks it up here, and interpolates
 * `spec.name` into language-neutral English templates. No builder may branch on
 * "is it Chinese / Vietnamese" itself, so switching dictionaries or monolingual mode
 * can never leave another language's wording behind.
 *
 * Adding a language = add one entry here (+ its dictionary mapping in dictionaryContext).
 */

export type ExplanationLanguage = 'zh' | 'vi' | 'en'
export type DictionaryTarget = 'enzh' | 'envi' | 'enen'

export interface NativeLanguageSpec {
  code: ExplanationLanguage
  /** English name interpolated into prompts: "write it in ${name}". */
  name: string
  /** Extra script/variant note appended to the language contract. */
  writingNote?: string
  /** Who the learner is, for role intros: "for ${audience}". */
  audience: string
  /** English-English mode: explanations are in English itself. */
  isEnglish: boolean
  /** Label for learner-language interference in unnaturalMindModel / profile prompts. */
  transferLabel: string
  /** Non-English language whose input counts as an OUT expression need; null for English-English. */
  supportLanguage: Exclude<ExplanationLanguage, 'en'> | null
  dictionaryTarget: DictionaryTarget
  /** Mnemonic "story" hook that only works in the learner's own language. */
  soundAlikeHint: string
}

export const NATIVE_LANGUAGES: Record<ExplanationLanguage, NativeLanguageSpec> = {
  zh: {
    code: 'zh',
    name: 'Chinese',
    writingNote: 'Simplified Chinese characters',
    audience: 'Chinese native speakers learning English',
    isEnglish: false,
    transferLabel: 'Chinese-to-English transfer',
    supportLanguage: 'zh',
    dictionaryTarget: 'enzh',
    soundAlikeHint: 'Chinese homophones (e.g. pest -> 拍死它)',
  },
  vi: {
    code: 'vi',
    name: 'Vietnamese',
    audience: 'Vietnamese native speakers learning English',
    isEnglish: false,
    transferLabel: 'Vietnamese-to-English transfer',
    supportLanguage: 'vi',
    dictionaryTarget: 'envi',
    soundAlikeHint: 'Vietnamese sound-alike words or phrases',
  },
  en: {
    code: 'en',
    name: 'English',
    audience: 'learners who prefer English-only (monolingual) explanations',
    isEnglish: true,
    transferLabel: 'source-language transfer',
    supportLanguage: null,
    dictionaryTarget: 'enen',
    soundAlikeHint: 'English wordplay, rhymes, puns or spelling tricks (e.g. "hear" has "ear")',
  },
}

export function getNativeLanguage(code: ExplanationLanguage | undefined): NativeLanguageSpec {
  return NATIVE_LANGUAGES[code ?? 'zh'] ?? NATIVE_LANGUAGES.zh
}

/**
 * The one hard language rule every learner-facing prompt ends with. Placed last so it
 * wins over any wording above (schema descriptions, input-direction notes, profile).
 */
export function buildNativeLanguageContract(spec: NativeLanguageSpec): string {
  if (spec.isEnglish) {
    return `

LEARNER LANGUAGE CONTRACT (overrides any conflicting wording above):
- ALL output text must be in English only. No Chinese, Vietnamese or other non-English text in explanations.
- Use clear, learner-friendly English (CEFR B1–B2 level max) in explanations. Do not assume any second-language transfer.`
  }
  const variant = spec.writingNote ? ` (${spec.writingNote})` : ''
  return `

LEARNER LANGUAGE CONTRACT (overrides any conflicting wording above):
- The learner's native language is ${spec.name}. ALL learner-facing explanatory text — glosses, translations, notes, reasons, correction explanations, scene labels and descriptions, stories, feedback — MUST be written in ${spec.name}${variant}.
- Keep English ONLY for: the English headword/expression itself, quoted English spans (e.g. both sides of "original -> corrected"), English example sentences, and fixed enum/keyword values from the schema.
- In JSON output, keys never change. A key named "zh" is a legacy name: fill it with ${spec.name}.`
}

/** How the learner's input relates to their native language — one line, language-agnostic. */
export function buildInputDirectionRule(spec: NativeLanguageSpec, inputLang: string): string {
  if (spec.isEnglish) return ''
  if (inputLang === spec.code) {
    return `- ${spec.name} input (the learner's native language): produce the most natural English equivalent or expression, then explain it in ${spec.name}.`
  }
  if (inputLang === 'en') {
    return `- English input: explain and translate it in ${spec.name}.`
  }
  return `- Input in another language: translate it into ${spec.name} and write all explanatory text in ${spec.name}. Keep the original term only where it identifies the expression itself.`
}

/** Description for legacy `examples[].zh`. */
export function exampleGlossDesc(spec: NativeLanguageSpec): string {
  return spec.isEnglish ? 'English meaning / explanation' : `${spec.name} translation`
}
