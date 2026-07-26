/**
 * Phrase / sentence AI prompt builder.
 * Field ownership: short phrases keep meaning as a gloss;
 * situational / native-mind content goes to usageIntro + usageScenes.
 */

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
      ? '1-2 short sentences: a clear English gloss of WHAT it means only (short gloss). FORBID origin, register, slang geography, when-to-use essays, or native-mind scenes in this field.'
      : '1-2句短释义（一行释义即可，可首行【主题概括】一句）。只写「是什么意思」。禁止在 meaning 写来源/语域/俚语地域/情景/何时用/母语者心智长文。')
    : (isMono
      ? 'English definition or complete line-by-line translation in simple terms. For multi-sentence or long paragraphs, you MUST provide full translation for ALL sentences, NOT just a summary.'
      : '中文释义与准确翻译。若输入为多句子或长段落文章，必须包含针对所有句子的完整全文翻译（可首行放一句话【主题概括】，但后文必须接全文本的逐句完整翻译），绝对不可仅给出一句简短概括。')

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

  const correctionNoteDesc = isMono
    ? "If correctForm differs from input: 1-2 sentences in English explaining why — e.g. 'The original is understandable but unnatural; native speakers say X instead.' or 'Minor grammar error: subject-verb agreement.' Focus on the most important issue only. Skip trivial capitalization/punctuation unless it changes meaning. Omit this field if no change was made."
    : '如果 correctForm 与原文不同，用1-2句中文简要说明改动原因，分类标注（能理解但不地道 / 能理解但更通畅 / 语法或搭配有误 / 无实质性错误微调），仅提及最关键的问题。大小写/标点等只在影响意思时才提及。无改动时省略此字段。'

  const unnaturalDesc = isMono
    ? `{ "chineseThought": "how a Chinese-thinking learner would frame this", "nativeConcept": "how a native speaker actually conceptualizes it", "reusablePrinciple": "a reusable principle for future speaking/writing" }`
    : `{ "chineseThought": "中文母语者的直译/迁移思维", "nativeConcept": "英语母语者真实心智映射", "reusablePrinciple": "可复用到其他表达的原则" }`

  let schema = `{\n  "correctForm": "the corrected/standard form — fix real grammar, preposition, or spelling errors ONLY. CRITICAL: do NOT shorten, summarize, or truncate the input. If input is a long sentence or multi-sentence paragraph, keep ALL content intact and only fix actual errors. correctForm is the proofread original, not a rewrite.",\n  "correctionNote": "${correctionNoteDesc}",\n  "unnaturalMindModel": ${unnaturalDesc},\n  "meaning": "${meaningDesc}"`

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

  if (isCore && isEnabled('wordChoice')) {
    const vsDesc = isMono
      ? 'near-synonym or alternate wording'
      : '近义说法或替代表达'
    const reasonDesc = isMono
      ? '1 sentence: when to still pick THIS wording'
      : '1句：何时仍选这个表达'
    schema += `,\n  "wordChoiceContrast": [{ "vs": "${vsDesc}", "reason": "${reasonDesc}" }]`
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
    : `- CRITICAL — meaning completeness: For long text or multi-sentence paragraphs, "meaning" MUST contain a complete, line-by-line / sentence-by-sentence full translation of ALL content. You may put a brief 1-sentence topic summary at the very beginning (e.g., "【主题概括】..."), but you MUST follow with the full translation of every sentence. DO NOT output only a summary!`

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
${isEnabled('wordChoice') ? '- wordChoiceContrast: REQUIRED 2-4 structured vs/reason rows (not a long whyChoose essay).' : ''}
- PRIORITY order for Pure Core: feelAnchor/emotionalTone > unnaturalMindModel (if any)${wantUsage ? ' > usageIntro/usageScenes' : ''} > wordChoiceContrast > meaning. Keep meaning accurate but secondary to cognitive remodeling.
${wantUsage ? '- usageScenes in Core mode must emphasize native communicative intent (what job the phrase does), not just textbook situations.' : '- usageIntro/usageScenes omitted (module off) — do not invent those fields.'}` : `- Focus on clear meaning, practical usage scenes, and correction quality. nativeMindModel / wordChoiceContrast are NOT required for Lookup mode.`}
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
- Keep everything concise.
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

  return prompt
}
