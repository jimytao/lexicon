import type { AiAnalysis, AiFullResult } from '../types'

/** Map combined/full Lookup half onto ResultView's incremental AiAnalysis shape. */
export function aiFullToAnalysis(full: AiFullResult): AiAnalysis {
  return {
    coreConcept: full.coreConcept,
    meanings: (full.meanings ?? []).map((m) => ({
      zh: m.zh,
      pos: m.pos,
      scene: m.scene,
      imageQuery: m.imageQuery,
    })),
    etymology: full.etymology ?? { parts: [], story: '', derivedWords: [] },
    synonyms: full.synonyms ?? [],
    antonyms: full.antonyms,
    mnemonic: full.mnemonic,
    examples: full.examples,
    collocations: full.collocations,
    culturalLore: full.culturalLore
      ? {
          title: full.culturalLore.title,
          content: full.culturalLore.content,
          register: (full.culturalLore as { register?: string }).register,
        }
      : undefined,
    conceptGraph: full.conceptGraph,
  }
}
