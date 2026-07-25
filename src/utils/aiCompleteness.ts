import type { AiFullResult, CollocationData, CollocationEntry, ConceptGraph, ConceptGraphExample } from '../types'

function useful(text?: string): boolean {
  if (!text) return false
  const t = text.trim()
  return t.length > 0 && t !== 'N/A' && t !== 'null' && t !== '-' && t !== '常用'
}

export function collocationEntryNeedsNote(entry: CollocationEntry): boolean {
  return !useful(entry.note)
}

export function collocationsNeedFill(data?: CollocationData | null): boolean {
  if (!data) return false
  const items = [...(data.chunks ?? []), ...(data.collocations ?? [])]
  return items.some(collocationEntryNeedsNote)
}

export function conceptExampleNeedsFill(ex: string | ConceptGraphExample): boolean {
  if (typeof ex === 'string') return true
  return !useful(ex.meaning) || !useful(ex.mindHint)
}

export function conceptGraphNeedsFill(graph?: ConceptGraph | null): boolean {
  if (!graph?.branches?.length) return false
  return graph.branches.some((b) => (b.examples ?? []).some(conceptExampleNeedsFill))
}

export interface AiFullFillOptions {
  /** Pure Core：wordGraph 模组是否开启；开启且完全无图时触发静默重试 */
  wordGraphEnabled?: boolean
}

/** Full-word AI result missing required learner-facing explanations. */
export function aiFullNeedsExplanationFill(
  result: AiFullResult,
  cognitive: 'lookup' | 'core',
  opts?: AiFullFillOptions
): boolean {
  if (collocationsNeedFill(result.collocations)) return true
  if (cognitive === 'core') {
    if (!result.nativeMindModel?.mentalPicture?.trim()) return true
    const wordGraphOn = opts?.wordGraphEnabled !== false
    if (wordGraphOn) {
      if (!result.conceptGraph?.branches?.length) return true
      if (conceptGraphNeedsFill(result.conceptGraph)) return true
    } else if (conceptGraphNeedsFill(result.conceptGraph)) {
      return true
    }
  }
  return false
}
