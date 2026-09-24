import type { MainDictionary } from '../services/dictionaryContext'
import { detectLanguage } from '../stores/searchStore'
import type { LearningDirection, LearningRoute } from '../types'

const FOREIGN_LATIN_MARKS = /[äöüßéèêëàâçîïôùûÿœæñ¿¡]/i

const FOREIGN_FUNCTION_WORDS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['der', 'die', 'das', 'und', 'nicht', 'ich', 'ist', 'eine', 'einen', 'guten', 'morgen', 'danke', 'bitte', 'geht', 'wie']),
  new Set(['bonjour', 'comment', 'allez', 'vous', 'avec', 'pour', 'une', 'est', 'pas', 'merci', 'dans', 'nous']),
  new Set(['hola', 'como', 'está', 'estas', 'usted', 'gracias', 'para', 'una', 'que', 'los', 'las', 'por']),
  new Set(['buongiorno', 'come', 'grazie', 'sono', 'una', 'per', 'con', 'non', 'che', 'gli']),
]

/**
 * Script detection already catches CJK/Korean/Vietnamese. This conservative helper
 * catches common Latin-script foreign sentences without turning one ambiguous word
 * into a confident language claim.
 */
export function looksLikeForeignLatinText(input: string): boolean {
  if (FOREIGN_LATIN_MARKS.test(input)) return true
  const tokens = input.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  if (tokens.length < 2) return false
  return FOREIGN_FUNCTION_WORDS.some((words) => tokens.filter((token) => words.has(token)).length >= 2)
}

function learnerSupportLanguage(mainDictionary: MainDictionary): 'zh' | 'vi' {
  return mainDictionary === 'en-vi' ? 'vi' : 'zh'
}

export function resolveLearningRoute(
  query: string,
  selectedDirection: LearningDirection,
  mainDictionary: MainDictionary,
): LearningRoute {
  const trimmed = query.trim()
  if (!trimmed) return 'irrelevant'

  const language = detectLanguage(trimmed)
  const supportLanguage = learnerSupportLanguage(mainDictionary)

  if (language === supportLanguage) return 'out'
  if (language !== 'en') return 'irrelevant'
  if (looksLikeForeignLatinText(trimmed)) return 'irrelevant'
  return selectedDirection
}

/** True when language routing, rather than the user's IN/OUT choice, owns the route. */
export function isLearningRouteForced(query: string, mainDictionary: MainDictionary): boolean {
  const fromIn = resolveLearningRoute(query, 'in', mainDictionary)
  const fromOut = resolveLearningRoute(query, 'out', mainDictionary)
  return fromIn !== 'irrelevant' && fromIn === fromOut
}
