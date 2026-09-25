import {
  resolveLearnerLanguagePolicy,
  type DictionaryRoutingSettings,
  type MainDictionary,
} from '../services/dictionaryContext'
import { detectLanguage } from '../stores/searchStore'
import type { LearningDirection, LearningRoute } from '../types'

const FOREIGN_LATIN_MARKS = /[äöüßéèêëàâçîïôùûÿœæñ¿¡]/i

const FOREIGN_FUNCTION_WORDS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['der', 'die', 'das', 'und', 'nicht', 'ich', 'ist', 'eine', 'einen', 'guten', 'morgen', 'danke', 'bitte', 'geht', 'wie']),
  new Set(['bonjour', 'comment', 'allez', 'vous', 'avec', 'pour', 'une', 'est', 'pas', 'merci', 'dans', 'nous']),
  new Set(['hola', 'como', 'está', 'estas', 'usted', 'gracias', 'para', 'una', 'que', 'los', 'las', 'por']),
  new Set(['buongiorno', 'come', 'grazie', 'sono', 'una', 'per', 'con', 'non', 'che', 'gli']),
]

const VIETNAMESE_DISTINCTIVE_MARKS = /[ăđơưĂĐƠƯảãạẳẵặẩẫậẻẽẹểễệỉĩịỏõọổỗộởỡợủũụửữựỷỹỵ]/
const VIETNAMESE_FUNCTION_WORDS = new Set([
  'anh', 'ban', 'bạn', 'cach', 'cách', 'cho', 'cua', 'của', 'dieu', 'điều', 'dien', 'diễn',
  'dat', 'đạt', 'em', 'khong', 'không', 'la', 'là', 'muon', 'muốn', 'nay', 'này', 'noi', 'nói',
  'toi', 'tôi', 'trong', 'va', 'và', 'voi', 'với', 'xin',
])
const VIETNAMESE_STRONG_ACCENTED_WORDS = new Set([
  'chúng', 'của', 'điều', 'được', 'không', 'muốn', 'này', 'người', 'những', 'nói', 'tôi', 'với',
])

type LearningDictionarySource = MainDictionary | DictionaryRoutingSettings

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

function asRoutingSettings(source: LearningDictionarySource): DictionaryRoutingSettings {
  return typeof source === 'string'
    ? {
        mainDictionary: source,
        monolingualWord: false,
        monolingualPhrase: false,
        monolingualSentence: false,
      }
    : source
}

function looksLikeVietnameseText(input: string): boolean {
  if (VIETNAMESE_DISTINCTIVE_MARKS.test(input)) return true
  const tokens = input.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  if (tokens.some((token) => VIETNAMESE_STRONG_ACCENTED_WORDS.has(token))) return true
  return tokens.filter((token) => VIETNAMESE_FUNCTION_WORDS.has(token)).length >= 2
}

function profileLanguageOf(input: string): 'en' | 'zh' | 'vi' | 'other' {
  const language = detectLanguage(input)
  if (language === 'zh') return 'zh'
  if (language === 'ja' || language === 'ko' || language === 'other') return 'other'
  if (looksLikeVietnameseText(input)) return 'vi'
  if (language === 'vi' || looksLikeForeignLatinText(input)) return 'other'
  return 'en'
}

export function resolveLearningRoute(
  query: string,
  selectedDirection: LearningDirection,
  dictionarySource: LearningDictionarySource,
): LearningRoute {
  const trimmed = query.trim()
  if (!trimmed) return 'irrelevant'

  const settings = asRoutingSettings(dictionarySource)
  const supportLanguage = resolveLearnerLanguagePolicy(trimmed, settings).supportLanguage
  const language = profileLanguageOf(trimmed)

  if (supportLanguage && language === supportLanguage) return selectedDirection
  if (language !== 'en') return 'irrelevant'
  return selectedDirection
}
