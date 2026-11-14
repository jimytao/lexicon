/**
 * 网页选区 → 待查文本的归一化。
 *
 * 刻意零依赖：content script 会把它内联进注入每个网页的 IIFE，
 * 不能顺带拖进 platform / chrome 封装等模块。
 *
 * 上限的作用：用户全选一篇长文再点按钮时，不把整篇原样塞进 AI prompt
 * （`detectQueryType` 会判成 sentence）。早期的 300 字符连一个正常段落都装不下，
 * 而且 content script 里还有一份硬切 300 的副本，会把单词切成半截（"slammed" → "sla"）。
 * 现在只保留这一份常量，content script 与 SW 共用。
 */
export const MAX_SELECTION_LENGTH = 2000

/** 句末标点（含中文）后面紧跟空白或文本结尾，视为句子边界。 */
const SENTENCE_END = /[.!?。！？…]["'”’)\]]*(?=\s|$)/g

/**
 * 压空白、去首尾；超长时依次尝试在「句子边界 → 词边界」截断，
 * 都落在前 60% 以内才退回硬切（例如一整段没有空格的 CJK 文本）。
 */
export function normalizeSelection(raw: string, max: number = MAX_SELECTION_LENGTH): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max) return collapsed

  const window = collapsed.slice(0, max)
  const floor = max * 0.6

  let sentenceEnd = -1
  for (const m of window.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].length
    if (end <= max) sentenceEnd = end
  }
  if (sentenceEnd > floor) return window.slice(0, sentenceEnd).trim()

  // 下一个字符是空格时，window 本身就停在词边界上
  if (collapsed[max] === ' ') return window.trim()
  const lastSpace = window.lastIndexOf(' ')
  if (lastSpace > floor) return window.slice(0, lastSpace).trim()

  return window.trim()
}
