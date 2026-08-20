import type { Scene } from '../types'

export interface AlignableMeaning {
  senseIndex?: number
  zh?: string
  en?: string
  scene?: Scene
  imageQuery?: string
}

/**
 * 将 AI 返回的 meanings（含 scene / imageQuery 等）按照本地词库的义项顺序重新配对对齐。
 *
 * 彻底解决多语言/英英/中英词典兼容性问题：
 * 1. 【主匹配】：依据 AI 返回的 `senseIndex` (1, 2, 3...) 与本地词库 1-indexed 序号（i + 1）精准配对。
 * 2. 【次级 Fallback】（针对未返回 senseIndex 的模型）：
 *    同时进行英文（en）与中文（zh）双轨文本相似度匹配，绝不依赖单一中文正则，全面兼容纯英英词典与双语词典。
 * 3. 【保底 Fallback】：按下标 [i] 对应。
 */
export function alignAiMeanings<T extends AlignableMeaning>(
  dbMeanings: Array<{ zh: string; en?: string }>,
  aiMeanings: T[]
): Array<T | undefined> {
  if (!aiMeanings || aiMeanings.length === 0) {
    return dbMeanings.map(() => undefined)
  }

  const usedAiIndices = new Set<number>()
  const result: Array<T | undefined> = []

  // 阶段 1：校验 AI 是否完美返回了 senseIndex
  const hasSenseIndices = aiMeanings.some(m => typeof m.senseIndex === 'number' && m.senseIndex > 0)

  if (hasSenseIndices) {
    // 建立 senseIndex -> aiMeaning 的映射
    const indexMap = new Map<number, { item: T; idx: number }>()
    aiMeanings.forEach((item, idx) => {
      if (typeof item.senseIndex === 'number' && item.senseIndex > 0) {
        indexMap.set(item.senseIndex, { item, idx })
      }
    })

    for (let di = 0; di < dbMeanings.length; di++) {
      const targetSenseIndex = di + 1
      const match = indexMap.get(targetSenseIndex)
      if (match && !usedAiIndices.has(match.idx)) {
        usedAiIndices.add(match.idx)
        result.push(match.item)
      } else {
        result.push(undefined)
      }
    }

    // 如果全部匹配（或大部分匹配），直接返回结果
    const matchedCount = result.filter(Boolean).length
    if (matchedCount > 0) {
      // 补全未配对的条目
      for (let di = 0; di < dbMeanings.length; di++) {
        if (!result[di]) {
          // 找一个未使用的最靠近的 aiMeaning
          const unusedIdx = aiMeanings.findIndex((_, idx) => !usedAiIndices.has(idx))
          if (unusedIdx >= 0) {
            usedAiIndices.add(unusedIdx)
            result[di] = aiMeanings[unusedIdx]
          } else if (di < aiMeanings.length) {
            result[di] = aiMeanings[di]
          }
        }
      }
      return result
    }
  }

  // 阶段 2：如果 AI 没有返回 senseIndex，启动【双语文本相似度 (zh + en)】匹配
  for (let di = 0; di < dbMeanings.length; di++) {
    const dbItem = dbMeanings[di]
    let bestIdx = -1
    let bestScore = -1

    for (let ai = 0; ai < aiMeanings.length; ai++) {
      if (usedAiIndices.has(ai)) continue
      const aiItem = aiMeanings[ai]

      const scoreZh = similarityZh(dbItem.zh, aiItem.zh ?? '')
      const scoreEn = similarityEn(dbItem.en ?? '', aiItem.en ?? '')
      const score = Math.max(scoreZh, scoreEn)

      if (score > bestScore) {
        bestScore = score
        bestIdx = ai
      }
    }

    if (bestIdx >= 0 && bestScore >= 0.25) {
      usedAiIndices.add(bestIdx)
      result.push(aiMeanings[bestIdx])
    } else {
      // Fallback: 按 index 对应
      const fallbackIdx = di < aiMeanings.length ? di : -1
      if (fallbackIdx >= 0 && !usedAiIndices.has(fallbackIdx)) {
        usedAiIndices.add(fallbackIdx)
        result.push(aiMeanings[fallbackIdx])
      } else {
        result.push(undefined)
      }
    }
  }

  return result
}

/** 提取对齐后的 scene 数组 */
export function alignScenes(
  dbMeanings: Array<{ zh: string; en?: string }>,
  aiMeanings: Array<AlignableMeaning>
): Array<Scene | undefined> {
  return alignAiMeanings(dbMeanings, aiMeanings).map(m => m?.scene)
}

/** 中文相似度计算 */
function similarityZh(a: string, b: string): number {
  if (!a || !b) return 0
  const normA = cleanZh(a)
  const normB = cleanZh(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 1.0

  if (normA.includes(normB) || normB.includes(normA)) return 0.85

  const setA = new Set(normA.split(''))
  const setB = new Set(normB.split(''))
  const intersection = [...setA].filter(c => setB.has(c)).length
  const union = new Set([...setA, ...setB]).size
  return union > 0 ? intersection / union : 0
}

/** 英文文本 Token 级相似度计算（兼顾纯英英词典与单语言模式） */
function similarityEn(a: string, b: string): number {
  if (!a || !b) return 0
  const tokensA = cleanEnTokens(a)
  const tokensB = cleanEnTokens(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const strA = tokensA.join(' ')
  const strB = tokensB.join(' ')
  if (strA === strB) return 1.0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return union > 0 ? intersection / union : 0
}

function cleanZh(s: string): string {
  return s
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function cleanEnTokens(s: string): string[] {
  // 提取长度>=2的英文字母单词，排除通用停用词
  const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'or', 'and', 'is', 'be'])
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
}
