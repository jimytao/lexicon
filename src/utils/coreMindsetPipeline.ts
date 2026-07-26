import type { CollocationData, ConceptGraph, CoreConcept, NativeMindModel } from '../types'

/** L2 选用对照：主词 vs 近义（或近似说法） */
export interface WordChoiceContrastItem {
  vs: string
  reason: string
}

/** Pure Core 单词出厂模组 id 顺序（P1） */
export const CORE_WORD_MODULE_P1_IDS = [
  'coreConcept',
  'wordGraph',
  'chunks',
  'collocations',
  'synonyms',
  'wordChoice',
  'usageScenes',
  'culture',
  'practice',
  'chat',
] as const

export type CoreWordModuleId = (typeof CORE_WORD_MODULE_P1_IDS)[number]

export interface ResolvedCoreConcept extends CoreConcept {
  feelAnchor?: string
  emotionalTone?: string
}

export interface MigratedCoreMindset {
  coreConcept?: ResolvedCoreConcept
  wordChoiceContrast?: WordChoiceContrastItem[]
  /** 旧 whyChooseThisWord 散文，仅在无结构化对照时作过渡展示 */
  whyChooseFallback?: string
}

function useful(text?: string): text is string {
  if (!text) return false
  const t = text.trim()
  return t.length > 0 && t !== 'N/A' && t !== 'null' && t !== '-'
}

/**
 * 将旧 nativeMindModel 映射进 Core Image + 选用对照。
 * 新字段已有值时不覆盖。
 */
export function migrateNativeMindToCoreFields(input: {
  coreConcept?: CoreConcept & { feelAnchor?: string; emotionalTone?: string }
  nativeMindModel?: NativeMindModel
  wordChoiceContrast?: WordChoiceContrastItem[]
}): MigratedCoreMindset {
  const mind = input.nativeMindModel
  const hasContrast = Array.isArray(input.wordChoiceContrast) && input.wordChoiceContrast.length > 0

  const feelAnchor = useful(input.coreConcept?.feelAnchor)
    ? input.coreConcept!.feelAnchor!.trim()
    : useful(mind?.mentalPicture)
      ? mind!.mentalPicture.trim()
      : undefined

  const emotionalTone = useful(input.coreConcept?.emotionalTone)
    ? input.coreConcept!.emotionalTone!.trim()
    : useful(mind?.emotionalStance)
      ? mind!.emotionalStance.trim()
      : undefined

  let coreConcept: ResolvedCoreConcept | undefined
  if (input.coreConcept || feelAnchor || emotionalTone) {
    coreConcept = {
      image: input.coreConcept?.image ?? '',
      explanation: input.coreConcept?.explanation ?? '',
      ...(feelAnchor ? { feelAnchor } : {}),
      ...(emotionalTone ? { emotionalTone } : {}),
    }
  }

  const result: MigratedCoreMindset = {}
  if (coreConcept) result.coreConcept = coreConcept
  if (hasContrast) {
    result.wordChoiceContrast = input.wordChoiceContrast
  } else if (useful(mind?.whyChooseThisWord)) {
    result.whyChooseFallback = mind!.whyChooseThisWord.trim()
  }

  return result
}

/** 概念树是否有可展示内容（root 或任一 branch） */
export function conceptGraphHasVisibleContent(graph?: ConceptGraph | null): boolean {
  if (!graph) return false
  if (useful(graph.rootCore)) return true
  return Array.isArray(graph.branches) && graph.branches.length > 0
}

/**
 * wordGraph 模组开启且无可见图时，应渲染空态（禁止静默 return null）。
 */
export function shouldShowConceptGraphEmptyState(opts: {
  wordGraphEnabled: boolean
  conceptGraph?: ConceptGraph | null
}): boolean {
  if (!opts.wordGraphEnabled) return false
  return !conceptGraphHasVisibleContent(opts.conceptGraph)
}

/** 关近义时，选用对照是否仍应尝试展示（F1） */
export function shouldShowWordChoiceWhenSynonymsOff(opts: {
  wordChoiceEnabled: boolean
  synonymsEnabled: boolean
  hasContrast: boolean
  hasFallback: boolean
}): boolean {
  if (!opts.wordChoiceEnabled) return false
  return opts.hasContrast || opts.hasFallback
}

/** 搭配区是否有可展示条目（AI 对 innit 类词可返回空数组） */
export function collocationDataHasVisibleItems(data?: CollocationData | null): boolean {
  if (!data) return false
  return (data.chunks?.length ?? 0) > 0 || (data.collocations?.length ?? 0) > 0
}
