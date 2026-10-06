import { detectQueryType } from '../stores/searchStore'
import type { QueryType } from '../types'
import {
  getNativeLanguage,
  type DictionaryTarget,
  type ExplanationLanguage,
  type NativeLanguageSpec,
} from './nativeLanguage'

export type MainDictionary = 'en-zh' | 'en-vi' | 'en-en'
export type { DictionaryTarget, ExplanationLanguage }

const MAIN_DICTIONARY_LANGUAGE: Record<MainDictionary, ExplanationLanguage> = {
  'en-zh': 'zh',
  'en-vi': 'vi',
  'en-en': 'en',
}

export interface DictionaryRoutingSettings {
  mainDictionary: MainDictionary
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
}

export interface DictionaryContext {
  queryType: QueryType
  dictionaryTarget: DictionaryTarget
  explanationLanguage: ExplanationLanguage
  isMonolingual: boolean
}

export interface LearnerLanguagePolicy {
  nativeLanguage: ExplanationLanguage
  /** Non-English language eligible for manual IN/OUT evidence. English-English has none. */
  supportLanguage: 'zh' | 'vi' | null
  profileLanguage: ExplanationLanguage
  dictionaryTarget: DictionaryTarget
  isMonolingual: boolean
}

/** One routing decision shared by local dictionaries and AI prompts. */
export function resolveDictionaryContext(
  queryText: string,
  settings: DictionaryRoutingSettings,
): DictionaryContext {
  const queryType = detectQueryType(queryText)
  const monolingualOverride = queryType === 'sentence'
    ? settings.monolingualSentence
    : queryType === 'phrase'
      ? settings.monolingualPhrase
      : settings.monolingualWord
  // Monolingual switch beats the main dictionary.
  const language = monolingualOverride
    ? 'en'
    : MAIN_DICTIONARY_LANGUAGE[settings.mainDictionary] ?? 'zh'
  const spec = getNativeLanguage(language)

  return {
    queryType,
    dictionaryTarget: spec.dictionaryTarget,
    explanationLanguage: spec.code,
    isMonolingual: spec.isEnglish,
  }
}

/** The learner's native language for this query — what every AI prompt must write in. */
export function resolveNativeLanguage(
  queryText: string,
  settings: DictionaryRoutingSettings,
): NativeLanguageSpec {
  return getNativeLanguage(resolveDictionaryContext(queryText, settings).explanationLanguage)
}

/** Learner-language policy for a known language lane (e.g. a stored profile event). */
export function learnerLanguagePolicyFor(language: ExplanationLanguage): LearnerLanguagePolicy {
  const spec = getNativeLanguage(language)
  return {
    nativeLanguage: spec.code,
    supportLanguage: spec.supportLanguage,
    profileLanguage: spec.code,
    dictionaryTarget: spec.dictionaryTarget,
    isMonolingual: spec.isEnglish,
  }
}

/**
 * One source of truth for the learner identity implied by the dictionary that is
 * actually active for this query (including per-query-type monolingual overrides).
 */
export function resolveLearnerLanguagePolicy(
  queryText: string,
  settings: DictionaryRoutingSettings,
): LearnerLanguagePolicy {
  return learnerLanguagePolicyFor(resolveDictionaryContext(queryText, settings).explanationLanguage)
}
