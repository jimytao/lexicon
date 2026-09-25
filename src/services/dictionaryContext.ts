import { detectQueryType } from '../stores/searchStore'
import type { QueryType } from '../types'

export type MainDictionary = 'en-zh' | 'en-vi' | 'en-en'
export type DictionaryTarget = 'enzh' | 'envi' | 'enen'
export type ExplanationLanguage = 'zh' | 'vi' | 'en'

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
  const isMonolingual = monolingualOverride || settings.mainDictionary === 'en-en'

  if (isMonolingual) {
    return {
      queryType,
      dictionaryTarget: 'enen',
      explanationLanguage: 'en',
      isMonolingual: true,
    }
  }

  if (settings.mainDictionary === 'en-vi') {
    return {
      queryType,
      dictionaryTarget: 'envi',
      explanationLanguage: 'vi',
      isMonolingual: false,
    }
  }

  return {
    queryType,
    dictionaryTarget: 'enzh',
    explanationLanguage: 'zh',
    isMonolingual: false,
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
  const context = resolveDictionaryContext(queryText, settings)
  if (context.dictionaryTarget === 'envi') {
    return {
      nativeLanguage: 'vi',
      supportLanguage: 'vi',
      profileLanguage: 'vi',
      dictionaryTarget: context.dictionaryTarget,
      isMonolingual: context.isMonolingual,
    }
  }
  if (context.dictionaryTarget === 'enen') {
    return {
      nativeLanguage: 'en',
      supportLanguage: null,
      profileLanguage: 'en',
      dictionaryTarget: context.dictionaryTarget,
      isMonolingual: context.isMonolingual,
    }
  }
  return {
    nativeLanguage: 'zh',
    supportLanguage: 'zh',
    profileLanguage: 'zh',
    dictionaryTarget: context.dictionaryTarget,
    isMonolingual: context.isMonolingual,
  }
}
