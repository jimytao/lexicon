/**
 * Phrase / sentence AI prompt builder.
 * Field ownership: short phrases keep meaning as a gloss;
 * situational / native-mind content goes to usageIntro + usageScenes.
 */

import { buildProfilePromptContext } from './profile'

export type PhrasePromptQueryType = 'phrase' | 'sentence'

export interface BuildPhrasePromptOptions {
  modules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  isMono?: boolean
  cognitive?: 'lookup' | 'core'
  /** phrase = short idiom/collocation; sentence = clause / multi-sentence text */
  queryType?: PhrasePromptQueryType
}

function moduleEnabled(modules: Array<{ id: string; enabled: boolean }>, id: string): boolean {
  return modules.some((m) => m.id === id && m.enabled)
}

export function buildPhrasePrompt({
  modules,
  lang = 'en',
  webSearchResults,
  isFull = true,
  triLingual = false,
  isMono = false,
  cognitive = 'lookup',
  queryType = 'phrase',
}: BuildPhrasePromptOptions): string {
  const isEnabled = (id: string) => moduleEnabled(modules, id)
  const isCore = cognitive === 'core'
  const isShortPhrase = queryType === 'phrase'
  const wantUsage = !isCore || isEnabled('usageScenes')

  const meaningDesc = isShortPhrase
    ? (isMono
      ? 'LEXICAL English gloss only: equivalents + one short sense nucleus, e.g. "self-aware; uneasy about appearance — overly aware of oneself". FORBID origin, register, slang geography, when-to-use essays, or native-mind scenes.'
      : '词典式中文对译：等价词 + 一句义核，如「难为情的；自觉的 — 过分在意别人怎么看自己」。只写「是什么意思」。禁止在 meaning 写来源/语域/俚语地域/情景/何时用/母语者心智长文。')
    : (isMono
      ? 'FAITHFUL FULL TRANSLATION of the entire input, sentence by sentence, in the original order. Keep every clause, hedge, modifier, name and number. Never summarize, condense, merge or drop anything. This field holds the translation only — no commentary.'
      : '整段输入的忠实全文翻译：逐句翻译每一个句子，顺序与原文完全一致，保留每个从句、修饰语、语气词、人名与数字。禁止概括、压缩、合并或省略任何内容。此字段只放译文，不写解读或总结。')

  const usageIntroDesc = isMono
    ? (isCore
      ? '1-3 sentences: opening blurb for Usage Contexts — native communicative intent, register/slang note, when speakers reach for this (NOT a dictionary gloss)'
      : '1-3 sentences: opening blurb for Usage Contexts — situation, register/origin note, tone (NOT a dictionary gloss)')
    : (isCore
      ? '1-3句口语化中文：Usage Contexts 开场白——母语者选用意图、语域/俚语背景、何时会想到这个说法（不是词典释义）'
      : '1-3句口语化中文：Usage Contexts 开场白——使用情景、语域/来源提示、语气（不是词典释义）')

  const sceneDesc = isMono
    ? (isCore
      ? '1-3 sentences in English: WHEN a native speaker reaches for this expression, what communicative job it does, and what feeling it carries'
      : '1-3 sentences in English, explaining when to use this expression, tone, and feeling')
    : (isCore
      ? '1-3句口语化中文：母语者在什么意图下会选用这个表达、它完成什么交际任务、带什么语气感觉'
      : '1-3句口语化中文，说明在什么情景下使用这个表达，语气和感觉如何')

  const nativeFormDesc = isMono
    ? 'Polished native or formal rephrasing: how a native speaker or professional writer would naturally elevate or frame this sentence.'
    : '地道/正式表达建议：母语者或专业书面表达中更自然、地道的句式改写。'

  const nativeRationaleDesc = isMono
    ? '1-2 sentences explaining WHY native speakers prefer this specific phrase, word choice, or preposition in nativeForm over the literal wording.'
    : '1-2句说明为何母语者更倾向选用 nativeForm 中的短语、介词或搭配（地道意象与用词剖析）。'

  const correctionNoteDesc = isMono
    ? "If correctForm differs from input: explain why correctForm differs from input. When there are multiple changes (tense, collocation, typos, articles), MUST provide an itemized list using bullet points ('• original -> corrected: reason'). Skip trivial capitalization unless necessary. Omit if no change."
    : '如果 correctForm 与原文不同，说明改动原因。当有多处修改（如语法错误、介词误用、用词不当/搭配错误、拼写/大小写等）时，必须使用项目符号逐条列出（格式：• 原始词句 -> 修正词句：详细改动原因），仅在最重要或有影响时提及细节，禁止概括为模糊的单句抽象总结。无改动时省略。'

  const unnaturalDesc = isMono
    ? `{ "chineseThought": "how a Chinese-thinking learner would frame this", "nativeConcept": "how a native speaker actually conceptualizes it", "reusablePrinciple": "a reusable principle for future speaking/writing" }`
    : `{ "chineseThought": "中文母语者的直译/迁移思维", "nativeConcept": "英语母语者真实心智映射", "reusablePrinciple": "可复用到其他表达的原则" }`

  let schema = `{\n  "correctForm": "Minimal Fix version — fix actual grammar errors, preposition misuses, word misuses (incorrect word choice), and typos ONLY. Preserve user's original sentence structure and wording as much as possible.",\n  "correctionNote": "${correctionNoteDesc}",\n  "nativeForm": "${nativeFormDesc}",\n  "nativeRationale": "${nativeRationaleDesc}",\n  "unnaturalMindModel": ${unnaturalDesc},\n  "meaning": "${meaningDesc}"`

  // Lookup：场景始终要；Core：跟 corePhraseModules.usageScenes 开关
  if (wantUsage) {
    schema += `,\n  "usageIntro": "${usageIntroDesc}",\n  "usageScenes": [\n    {\n      "label": "${isMono ? '2-4 word English context tag' : '2-4字场景标签'}",\n      "description": "${sceneDesc}"\n    }\n  ]`
  }

  if (isCore) {
    const feelDesc = isMono
      ? '1 short line: sensory feel / atmosphere (not a long scene)'
      : '1句短感觉锚（氛围/体感，勿写长场景）'
    const emotionDesc = isMono
      ? '1 short line: emotional / social stance'
      : '1句情绪底色/社交态度'
    schema += `,\n  "feelAnchor": "${feelDesc}",\n  "emotionalTone": "${emotionDesc}"`
  }

  if (isEnabled('examples')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "中文翻译" }\n  ]`
    } else {
      schema += `,\n  "examples": [\n    { "en": "Example sentence using this phrase", "zh": "${isMono ? 'English explanation/meaning' : '中文翻译'}" }\n  ]`
    }
  }

  if (isFull && isEnabled('culture')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign) {
      schema += `,\n  "culturalLore": {\n    "title": "趣味背景/文化渊源标签",\n    "content": "1-3句中文，介绍这句话或词的历史、文化背景、流行原因等",\n    "subculture": "如果是二次元、游戏圈、网络流行语，请说明其来源 and 圈内含义",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    } else {
      const cultureContent = isMono
        ? "1-2 sentences in English: the phrase's register (formal/informal/slang/technical) or any cultural nuance worth knowing"
        : '1-2句中文：这个表达的语域（正式/口语/俚语/专业）或值得知道的文化背景'
      schema += `,\n  "culturalLore": {\n    "title": "${isMono ? '2-4 word English tag' : '2-4字标签'}",\n    "content": "${cultureContent}",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    }
  }

  schema += `\n}`

  const basePrompt = isCore
    ? (isMono
      ? `You are a native-speaker cognitive coach for English learners. Your job is NOT dictionary lookup — it is to remodel how learners THINK about an expression so they can use it the way natives do (mental picture, emotional stance, cultural fit, when/why to choose it).`
      : `你是面向中文母语者的「母语者心智教练」。你的任务不是传统词典释义，而是帮助学习者用母语者的心智模式理解表达：脑中画面、情感立场、文化得体性，以及何时/为何选用这个说法。`)
    : (isMono
      ? `You are a professional English language analyst for learners who prefer English-only monolingual explanations.`
      : `You are a professional English language analyst for Chinese native speakers.`)
  const multiLangPrompt = isCore
    ? `You are a cultural-cognitive coach for foreign expressions. Prioritize how natives conceptualize the phrase — social meaning, subculture nuance, and when it is the right choice.`
    : `You are a professional multi-language translator and cultural analyst. You specialize in "Cultural Interpretation" — explaining the social, historical, and subculture (especially ACG/Internet) context behind foreign expressions.`

  const fieldOwnership = wantUsage
    ? (isMono
      ? `- FIELD OWNERSHIP (critical):
  - "meaning" = dictionary gloss / translation only.
  - Do NOT put origin, register, slang geography, when-to-use essays, or native-mind scenes into "meaning".
  - Put that situational / native-intent content into "usageIntro" (opening blurb) and "usageScenes" (concrete scene cards).
  - feelAnchor / emotionalTone (Core) = short sensory/emotion lines — not essays that belong in usageIntro.`
      : `- 字段职责 FIELD OWNERSHIP（关键）：
  - "meaning" = 词典短释义 / 翻译，只回答「是什么意思」。
  - 勿把来源、语域、俚语地域、情景长文、何时用、母语者心智写进 "meaning"。
  - 上述情景/心智内容放进 "usageIntro"（Usage Contexts 开场白）与 "usageScenes"（具体场景卡）。
  - Core 的 feelAnchor / emotionalTone = 短感觉/情绪句，不要写成 usageIntro 长文。`)
    : (isMono
      ? `- FIELD OWNERSHIP (critical):
  - "meaning" = dictionary gloss / translation only.
  - Do NOT put origin, register, slang geography, when-to-use essays, or native-mind scenes into "meaning".
  - usageIntro/usageScenes are omitted (module off); keep meaning as a short gloss only.`
      : `- 字段职责 FIELD OWNERSHIP（关键）：
  - "meaning" = 词典短释义 / 翻译，只回答「是什么意思」。
  - 勿把来源、语域、俚语地域、情景长文、何时用、母语者心智写进 "meaning"。
  - usageIntro/usageScenes 已关闭，勿输出这些字段；meaning 仍保持短释义。`)

  const meaningCompletenessRule = isShortPhrase
    ? (wantUsage
      ? (isMono
        ? `- For short phrases/idioms: keep "meaning" to a short gloss (1-2 sentences max). Situational essays belong in usageIntro/usageScenes.`
        : `- 短词组/习语：meaning 只保留短释义（最多 1-2 句）。情景/俚语/心智长文必须放进 usageIntro / usageScenes。`)
      : (isMono
        ? `- For short phrases/idioms: keep "meaning" to a short gloss (1-2 sentences max).`
        : `- 短词组/习语：meaning 只保留短释义（最多 1-2 句）。`))
    : `- CRITICAL — "meaning" is a FAITHFUL TRANSLATION, NEVER a summary. Translate like a literal, obedient translator, not like an editor writing an abstract:
  - Go SENTENCE BY SENTENCE in the original order. Every sentence of the input must produce its own translated sentence in "meaning" — same sentence count, same order.
  - Carry over EVERY clause, modifier, hedge, intensifier, politeness marker, name, number and connective (e.g. "I don't usually...", "especially", "really", "but", "because"). Nothing may be dropped as redundant.
  - FORBIDDEN in "meaning": gist/abstract/paraphrase, topic-summary lines, merging two sentences into one, commentary, analysis, or "this passage is about...". If your draft has fewer sentences than the input, you are summarizing — redo it.
  - Do NOT invent numbering, bullets or headings that the source does not have. Reproduce the source's own markers verbatim (e.g. a leading thread marker like "1/2" stays "1/2"; it is NOT list item 1).
  - Keep the original register and sentence shape as closely as the target language allows. A plain, slightly literal translation is BETTER than an elegant compressed one.
  - Length sanity check: the translation must be roughly as long as the input. A translation that is a fraction of the input's length is a failure.
  - Interpretation, tone and "what the speaker is really doing" belong in usageIntro / usageScenes — never in "meaning".`

  let prompt = `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} phrase or sentence, provide a complete analysis${isCore ? ' with native-mind priority' : ''}.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
${fieldOwnership}
${meaningCompletenessRule}
- CRITICAL — correctForm integrity: Do NOT delete, shorten, summarize, or truncate any part of the input. If input is a long sentence or multi-sentence paragraph, correctForm must preserve ALL sentences and content — only fix actual errors word by word. correctForm is a proofread copy, NOT a rewrite or summary.
- If the input has NO real errors, set correctForm exactly equal to the input (copy it verbatim). Only change what is genuinely wrong.
- correctionNote: Only include when correctForm differs from the input. Classify the change as one of: (a) understandable but unnatural/not idiomatic, (b) understandable but can flow better, (c) actual grammar/collocation error, (d) no real error, minor polish only. Mention capitalization/punctuation ONLY if it changes meaning or is a serious mistake. Omit correctionNote entirely if correctForm == input.
- unnaturalMindModel: When input sounds unnatural, un-idiomatic, or reflects Chinese-to-English translation mindset, fill unnaturalMindModel with detailed cognitive breakdown (chineseThought, nativeConcept, reusablePrinciple). Omit if input is already natural.
${isCore ? `- Do NOT invent nativeMindModel (legacy). Fill feelAnchor + emotionalTone instead.
- Do NOT invent wordChoiceContrast.
- PRIORITY order for Pure Core: feelAnchor/emotionalTone > unnaturalMindModel (if any)${wantUsage ? ' > usageIntro/usageScenes' : ''} > meaning (lexical gloss still required and accurate).
${wantUsage ? '- usageScenes in Core mode must emphasize native communicative intent (what job the phrase does), not just textbook situations.' : '- usageIntro/usageScenes omitted (module off) — do not invent those fields.'}` : `- Focus on clear lexical meaning, practical usage scenes, and correction quality. nativeMindModel / wordChoiceContrast are NOT required for Lookup mode.`}
- If input is CHINESE (targeting English):
  - correctForm: the most natural, complete English translation of the full input — do NOT omit any part of the Chinese.
  - correctionNote: omit (translation, not correction).
${wantUsage ? '  - usageIntro/usageScenes: explain when to use this translation vs others.' : ''}
${isCore ? '  - feelAnchor/emotionalTone: how an English native would feel/stance the translated expression.\n  - unnaturalMindModel: if a literal Chinese-style English would be tempting, contrast that transfer error with the native concept.' : ''}
- If input is a FOREIGN LANGUAGE (not English/Chinese):
  - meaning: accurate and natural translation (gloss / full translation by query length — still FIELD OWNERSHIP).
${wantUsage ? '  - usageIntro/usageScenes: explain the specific feeling or tone of the original expression.' : ''}
  - culturalLore: PRIORITY: Provide deep cultural/subculture context. Specify historical origins or social context if applicable.
${wantUsage ? `- Provide usageIntro (1 blurb) + 2-4 usage scenes${isCore ? '' : ', 2-4 examples'}.` : `- Do not output usageIntro/usageScenes (module off)${isCore ? '' : '; still provide 2-4 examples if examples enabled'}.`}
- Keep everything concise${isShortPhrase ? '' : ' — EXCEPT "meaning" for sentence/paragraph input, where completeness always beats brevity'}.
- Never output anything outside the JSON object.`

  if (isMono) {
    prompt += `
- ALL output text must be in English only. No Chinese characters anywhere.
- Use simple, learner-friendly English vocabulary (CEFR B1–B2 level max). Avoid idioms or advanced expressions in explanations. Your readers are learners, not native speakers.`
  }
  if (isFull && isEnabled('culture')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign) {
      prompt += `\n- culturalLore: PRIORITY for foreign phrases. Provide deep cultural/subculture context.`
    } else {
      prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: 1-2 sentences on register or cultural nuance only. Keep it distinct from usageScenes.`
    }
  }

  if (queryType === 'sentence') {
    prompt += buildProfilePromptContext()
  }

  return prompt
}
