/**
 * Combined AI prompt builder — single call returns both Lookup and Core data.
 *
 * Architecture: The AI receives one prompt and returns JSON with two top-level
 * keys: "lookup" (understand-mode data) and "core" (native-mind data).
 * This guarantees natural context linkage between the two views and fixes
 * Chinese input by making the translation intent unambiguous.
 *
 * Schema: { "lookup": { ...AiFullResult fields }, "core": { ...AiFullResult fields } }
 */

export interface CombinedPromptOptions {
  lookupModules: Array<{ id: string; enabled: boolean }>
  coreModules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  monolingualWord?: boolean
}

export interface CombinedPhrasePromptOptions {
  lookupModules: Array<{ id: string; enabled: boolean }>
  coreModules: Array<{ id: string; enabled: boolean }>
  lang?: string
  webSearchResults?: string
  isFull?: boolean
  triLingual?: boolean
  isMono?: boolean
  queryType?: 'phrase' | 'sentence'
}

function mod(modules: Array<{ id: string; enabled: boolean }>, id: string): boolean {
  return modules.some((m) => m.id === id && m.enabled)
}

// ── Word prompt ───────────────────────────────────────────────────────────────

export function buildCombinedWordPrompt({
  lookupModules,
  coreModules,
  lang = 'en',
  webSearchResults,
  isFull = true,
  triLingual = false,
  monolingualWord = false,
}: CombinedPromptOptions): string {
  const isMono = monolingualWord && lang === 'en'
  const isZh = lang === 'zh'
  const isForeign = lang !== 'en' && lang !== 'zh'

  // ── LOOKUP schema ─────────────────────────────────────────────────────────
  const lookupMeaningsDesc = isMono
    ? "English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'"
    : isZh
      ? '该英文候选与中文输入的细微差别（中文，1句）'
      : '（情景前缀）中文释义'
  const lookupEnDesc = isZh ? 'English candidate word/phrase' : 'English definition'
  const sceneLabel = isMono ? '2-4 word English context tag' : '2-4字情景标签'
  const sceneDesc = isMono
    ? '1-3 sentences in English: when this meaning occurs, tone, and how it differs'
    : '1-3句口语化中文，解释这个含义在什么情境下使用'
  const exZh = isMono ? 'English meaning / explanation' : '中文翻译'

  let lookupSchema = `"correctForm": "corrected spelling (fix typos if any)",
    "phonetic": "IPA for English, Kana/Romaji for Japanese, etc.",
    "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)",
    "coreConcept": {
      "image": "${isMono ? '1 short sentence: vivid core image for memory' : '1句画面感核心意象（记忆锚点）'}",
      "explanation": "${isMono ? '1 short sentence unifying main senses for memory' : '1句统领主要义项，帮助记住（轻量）'}"
    }`

  if (isZh) {
    // Chinese reverse lookup: short English candidates only
    lookupSchema += `,
    "meanings": [{ "zh": "${lookupMeaningsDesc}", "en": "${lookupEnDesc}", "pos": "part of speech" }]`
  } else {
    lookupSchema += `,
    "meanings": [
      {
        "zh": "${lookupMeaningsDesc}",
        "en": "${lookupEnDesc}",
        "pos": "specific part of speech",
        "scene": { "label": "${sceneLabel}", "description": "${sceneDesc}" },
        "imageQuery": "a 3-6 word English noun phrase for image search"
      }
    ]`
  }

  if (isFull && mod(lookupModules, 'etymology') && !isZh) {
    const partMeaning = isMono ? 'meaning in English' : '含义'
    const anchorNote = isMono
      ? '1 sentence in English: how this anchor word embodies the root meaning'
      : '1句话中文：此词如何体现词根，帮助联想'
    const storyDesc = isMono ? 'in English' : '1-2句话说明词根词缀/来源'
    lookupSchema += `,
    "etymology": {
      "parts": [{ "segment": "morpheme", "meaning": "${partMeaning}", "sourceForm": "original Latin/Greek root", "anchor": "common word with same root", "anchorNote": "${anchorNote}" }],
      "story": "${storyDesc}",
      "derivedWords": [{ "word": "derived word", "pos": "pos", "meaning": "${isMono ? 'meaning in English' : '含义'}" }]
    }`
  }

  if (isFull && mod(lookupModules, 'synonyms')) {
    const dist = isMono ? 'English nuance explanation' : '与主词的差异'
    const whenToUse = isMono
      ? '1 sentence in English: when and why native speakers choose this specific word'
      : '1句中文：母语者在何时及为何使用该词'
    lookupSchema += `,
    "synonyms": [{ "word": "synonym", "distinction": "${dist}", "tone": "positive|negative|neutral|informal", "whenToUse": "${whenToUse}" }],
    "antonyms": [{ "word": "antonym", "distinction": "${dist}" }]`
  }

  if (mod(lookupModules, 'examples') && !isZh) {
    if (isForeign && triLingual) {
      lookupSchema += `,
    "examples": [{ "original": "Example in target language", "en": "English translation", "zh": "中文翻译" }]`
    } else {
      lookupSchema += `,
    "examples": [{ "en": "Example sentence", "zh": "${exZh}" }]`
    }
  }

  // ── CORE schema ───────────────────────────────────────────────────────────
  const feelDesc = isMono
    ? '1 short line: sensory feel / atmosphere (NOT a full scene; do not repeat explanation)'
    : '1句短感觉锚：氛围/体感即可，禁止写成长场景，勿重复 explanation'
  const emotionDesc = isMono
    ? '1 short line: emotional tone when natives use this word'
    : '1句情绪底色：母语者用此词时的情感态度'
  const coreConceptExpl = isMono
    ? '2-4 sentences: how this image guides REAL USAGE branches — when/why natives extend it this way'
    : '2-4句：意象如何导向真实用法分支——母语者何时/为何这样延伸（偏「怎么用」）'

  let coreSchema = `"correctForm": "same as lookup.correctForm",
    "phonetic": "same as lookup.phonetic",
    "pos": "same as lookup.pos",
    "coreConcept": {
      "image": "${isMono ? '1-2 sentences: core physical/metaphorical image' : '1-2句核心意象'}",
      "explanation": "${coreConceptExpl}",
      "feelAnchor": "${feelDesc}",
      "emotionalTone": "${emotionDesc}"
    }`

  if (isZh) {
    // Chinese → Core shows the best English match with native-mind analysis
    coreSchema += `,
    "meanings": [{ "zh": "该英文候选与中文输入的细微差别（1句）", "en": "best English word/phrase", "pos": "part of speech" }]`
  } else {
    coreSchema += `,
    "meanings": []`
  }

  const wantCoreSynonyms = isFull && mod(coreModules, 'synonyms')
  if (wantCoreSynonyms) {
    const dist = isMono ? 'English nuance explanation' : '与主词的差异'
    const whenToUse = isMono
      ? '1 sentence: when and why native speakers choose this word'
      : '1句：母语者何时及为何使用该词'
    coreSchema += `,
    "synonyms": [{ "word": "near-synonym", "distinction": "${dist}", "tone": "positive|negative|neutral|informal", "whenToUse": "${whenToUse}" }],
    "antonyms": [{ "word": "antonym", "distinction": "${dist}" }]`
  }

  if (mod(coreModules, 'wordChoice')) {
    const vsDesc = isMono
      ? 'near-synonym word (prefer ones listed in synonyms[])'
      : '近义词（优先使用 synonyms[] 中出现的词）'
    const reasonDesc = isMono
      ? '1 sentence: when to still pick the HEADWORD over this near-synonym'
      : '1句：何时仍选主词而非该近义词'
    coreSchema += `,
    "wordChoiceContrast": [{ "vs": "${vsDesc}", "reason": "${reasonDesc}" }]`
  }

  const wantChunks = isFull && mod(coreModules, 'chunks')
  const wantCollocations = isFull && mod(coreModules, 'collocations')
  if (wantChunks || wantCollocations) {
    const note = isMono ? 'REQUIRED: clear English meaning' : '必填：中文释义'
    const spatial = isMono
      ? 'For prep phrases: briefly explain the preposition role; omit if none'
      : '介词语组必填：点明介词在搭配里的空间/逻辑角色'
    const chunksPart = wantChunks
      ? `"chunks": [{ "chunk": "COMMON PREPOSITIONAL phrase only", "note": "${note}", "spatialExtension": "${spatial}" }]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [{ "chunk": "OTHER common phrase WITHOUT prep focus", "note": "${note}" }]`
      : `"collocations": []`
    coreSchema += `,
    "collocations": { ${chunksPart}, ${colloPart} }`
  }

  if (isFull && mod(coreModules, 'usageScenes')) {
    const usLabel = isMono ? '2-4 word English scene tag' : '2-4字场景标签'
    const usDesc = isMono
      ? '1-2 sentences: when natives use this word, what communicative job it does'
      : '1-2句：母语者何时用、完成什么交际任务、典型句式'
    coreSchema += `,
    "usageScenes": [{ "label": "${usLabel}", "description": "${usDesc}" }]`
  }

  if (isFull && mod(coreModules, 'wordGraph')) {
    const exMeaning = isMono ? 'REQUIRED: clear English meaning' : '必填：中文释义'
    const exMind = isMono
      ? 'REQUIRED: how a native links this to the root core'
      : '必填：母语者如何从根意象延伸到这个用法（1句）'
    coreSchema += `,
    "conceptGraph": {
      "rootCore": "${isMono ? '1-3 word core concept label' : '1-3字核心归纳'}",
      "branches": [{
        "category": "${isMono ? 'Domain category (e.g. Physical Motion, Business)' : '延伸领域分类 (如: 物理运动, 经营管理)'}",
        "explanation": "${isMono ? '1 sentence: why this branch derives from rootCore' : '1句话：该分支领域为何从 Core 衍生出来'}",
        "examples": [{ "phrase": "typical phrase", "meaning": "${exMeaning}", "mindHint": "${exMind}" }]
      }]
    }`
  }

  if (isFull && mod(coreModules, 'culture')) {
    if (isForeign) {
      coreSchema += `,
    "culturalLore": { "title": "文化渊源标签", "content": "1-3句中文，文化背景", "subculture": "来源", "register": "formal|informal|slang|technical|neutral" }`
    } else {
      const cultureContent = isMono
        ? "1-2 sentences in English: register or cultural nuance"
        : "1-2句中文：词的文化来源、语域或值得注意的用法演变"
      coreSchema += `,
    "culturalLore": { "title": "${isMono ? '2-4 word English tag' : '2-4字标签'}", "content": "${cultureContent}", "register": "formal|informal|slang|technical|neutral" }`
    }
  }

  // ── Full prompt ───────────────────────────────────────────────────────────
  const langLabel = lang === 'en' ? 'English' : lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'

  const roleIntro = isMono
    ? `You are an expert English learning coach. You combine a clear vocabulary analyst (for understanding) and a native-speaker cognitive coach (for using). Return analysis in TWO complementary sections.`
    : `你是英语学习双轨教练：在同一次回答中同时完成「理解记忆」（Lookup）和「母语用法」（Core）分析。`

  const chineseInputRule = isZh ? `
CRITICAL — CHINESE INPUT RULE (read this first):
The user typed Chinese. This is a Chinese→English translation request from an English learner.
- They want to FIND and LEARN the natural English word/phrase for this Chinese concept.
- Do NOT analyze the Chinese word itself.
- lookup.correctForm: the best single English word/phrase equivalent.
- lookup.meanings: 2-5 English candidates with nuance notes in Chinese.
- core.correctForm: same as lookup.correctForm (the English word).
- core section: teach the learner how to USE that English word natively — mental image, feel, when natives reach for it.
- core.meanings: the top 1-2 English candidates with brief nuance note.
` : ''

  const prompt = `${roleIntro}

Given a ${langLabel} input, return ONE JSON object with EXACTLY two top-level keys: "lookup" and "core".
${webSearchResults ? `\nADDITIONAL CONTEXT (Web Search):\n${webSearchResults}\nUse this to ensure accuracy.\n` : ''}
Return ONLY a valid JSON object. No markdown. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "lookup": {
    ${lookupSchema}
  },
  "core": {
    ${coreSchema}
  }
}

Rules:
${chineseInputRule}
- BOTH sections share the same input word — they are two perspectives on the SAME word.
- lookup = "understand & remember": focus on meanings, etymology, examples, light core concept.
- core = "use it natively": focus on mental image, feel/emotion, usage branches, when/why natives choose it. Do NOT add a dictionary meanings wall (meanings: [] for English input in core).
- core.correctForm and core.phonetic and core.pos: copy from lookup (they must match).
- Do NOT invent nativeMindModel (legacy). Put feel into core.coreConcept.feelAnchor and emotion into core.coreConcept.emotionalTone.
- core.coreConcept.explanation: RICH — how the image guides when/how to use the word. feelAnchor must NOT repeat this.
- Do NOT dump concrete scenes into core.coreConcept.explanation — concrete scenes belong in core.usageScenes.
${mod(coreModules, 'wordGraph') ? '- core.conceptGraph: REQUIRED. Examples MUST be { phrase, meaning, mindHint }; never bare strings or N/A.' : ''}
${mod(coreModules, 'wordChoice') ? '- core.wordChoiceContrast: REQUIRED 3-5 rows. reason = when to still pick the headword.' : ''}
${wantChunks ? `- core.collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases ONLY.` : ''}
${wantCollocations ? `- core.collocations.collocations: 4-6 OTHER common phrases (no prep focus).` : ''}
${isFull && mod(coreModules, 'usageScenes') ? '- core.usageScenes: 3-5 native usage scenes — not a translation example wall.' : ''}
${isFull && mod(lookupModules, 'etymology') && !isZh ? `- lookup.etymology.parts: cover ALL meaningful morphemes. For ROOT morphemes fill sourceForm, anchor, anchorNote.` : ''}
${isFull && mod(lookupModules, 'synonyms') ? '- lookup.synonyms: 3-5 with tone + whenToUse; antonyms: 3-5.' : ''}
${mod(lookupModules, 'examples') && !isZh ? '- lookup.examples: 3-5 learner-friendly sentences.' : ''}
${isForeign ? '- For foreign language input: prioritize culturalLore in core section with deep subculture/ACG context.' : ''}
${isMono ? '- ALL output text must be in English only. No Chinese characters anywhere.' : ''}
- Keep everything concise. Never output anything outside the JSON object.`

  return prompt
}

// ── Phrase prompt ─────────────────────────────────────────────────────────────

export function buildCombinedPhrasePrompt({
  lookupModules,
  coreModules,
  lang = 'en',
  webSearchResults,
  triLingual = false,
  isMono = false,
  queryType = 'phrase',
}: CombinedPhrasePromptOptions): string {
  const isZh = lang === 'zh'
  const isForeign = lang !== 'en' && lang !== 'zh'
  const isShortPhrase = queryType === 'phrase'
  const wantUsage = mod(coreModules, 'usageScenes') || !isShortPhrase

  const meaningDesc = isShortPhrase
    ? (isMono
      ? '1-2 short sentences: a clear English gloss of WHAT it means only. FORBID origin, register, or native-mind scenes here.'
      : '1-2句短释义（只写「是什么意思」）。禁止写来源/语域/情景/何时用。')
    : (isMono
      ? 'English definition or complete line-by-line translation. For multi-sentence input, MUST translate ALL sentences.'
      : '中文释义与准确翻译。若输入为多句子，必须包含针对所有句子的完整逐句翻译。')

  const sceneDesc = isMono
    ? '1-3 sentences in English: WHEN a native speaker reaches for this, what communicative job it does'
    : '1-3句口语化中文：母语者在什么意图下选用这个表达、完成什么交际任务、带什么语气'

  const correctionNoteDesc = isMono
    ? "1-2 sentences in English explaining why correctForm differs from input. Omit if no change."
    : '1-2句中文简要说明改动原因（能理解但不地道 / 语法有误 / 无实质错误微调）。无改动时省略。'

  const unnaturalDesc = isMono
    ? `{ "chineseThought": "how a Chinese-thinking learner would frame this", "nativeConcept": "how a native speaker actually conceptualizes it", "reusablePrinciple": "a reusable principle for future speaking" }`
    : `{ "chineseThought": "中文母语者的直译/迁移思维", "nativeConcept": "英语母语者真实心智映射", "reusablePrinciple": "可复用到其他表达的原则" }`

  // ── SHARED correctForm / unnaturalMindModel (same for both sections) ───────
  const sharedFields = `"correctForm": "corrected/standard form — fix real errors only; for Chinese input = best English translation",
    "correctionNote": "${correctionNoteDesc}",
    "unnaturalMindModel": ${unnaturalDesc},
    "meaning": "${meaningDesc}"`

  // ── LOOKUP section ─────────────────────────────────────────────────────────
  let lookupSchema = sharedFields

  if (wantUsage) {
    const usageIntroDesc = isMono
      ? '1-3 sentences: opening blurb — situation, register, tone (NOT a dictionary gloss)'
      : '1-3句口语化中文：使用情景、语域/来源提示、语气（不是词典释义）'
    lookupSchema += `,
    "usageIntro": "${usageIntroDesc}",
    "usageScenes": [{ "label": "${isMono ? '2-4 word English context tag' : '2-4字场景标签'}", "description": "${sceneDesc}" }]`
  }

  if (mod(lookupModules, 'examples')) {
    if (isForeign && triLingual) {
      lookupSchema += `,
    "examples": [{ "original": "Example in target language", "en": "English translation", "zh": "中文翻译" }]`
    } else {
      lookupSchema += `,
    "examples": [{ "en": "Example sentence using this phrase", "zh": "${isMono ? 'English explanation' : '中文翻译'}" }]`
    }
  }

  // ── CORE section ───────────────────────────────────────────────────────────
  const feelDesc = isMono
    ? '1 short line: sensory feel / atmosphere (not a long scene)'
    : '1句短感觉锚（氛围/体感，勿写长场景）'
  const emotionDesc = isMono
    ? '1 short line: emotional / social stance when using this expression'
    : '1句情绪底色/社交态度'

  let coreSchema = sharedFields

  if (wantUsage) {
    const coreUsageIntro = isMono
      ? '1-3 sentences: opening blurb — native communicative intent, register/slang note, when speakers reach for this'
      : '1-3句口语化中文：母语者选用意图、语域/俚语背景、何时会想到这个说法'
    const coreSceneDesc = isMono
      ? '1-3 sentences: WHEN a native speaker reaches for this, what communicative job it does, and what feeling it carries'
      : '1-3句口语化中文：母语者在什么意图下会选用这个表达、它完成什么交际任务、带什么语气感觉'
    coreSchema += `,
    "usageIntro": "${coreUsageIntro}",
    "usageScenes": [{ "label": "${isMono ? '2-4 word English context tag' : '2-4字场景标签'}", "description": "${coreSceneDesc}" }]`
  }

  coreSchema += `,
    "feelAnchor": "${feelDesc}",
    "emotionalTone": "${emotionDesc}"`

  if (mod(coreModules, 'wordChoice')) {
    const vsDesc = isMono ? 'near-synonym or alternate wording' : '近义说法或替代表达'
    const reasonDesc = isMono ? '1 sentence: when to still pick THIS wording' : '1句：何时仍选这个表达'
    coreSchema += `,
    "wordChoiceContrast": [{ "vs": "${vsDesc}", "reason": "${reasonDesc}" }]`
  }

  // ── Full prompt ───────────────────────────────────────────────────────────
  const langLabel = lang === 'en' ? 'English' : lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'

  const roleIntro = isMono
    ? `You are an expert English learning coach for phrase/sentence analysis. Return TWO complementary views in one JSON.`
    : `你是英语学习双轨教练：对词组/句子同时完成「理解」（Lookup）和「母语用法」（Core）分析，在一次回答中返回。`

  const chineseInputRule = isZh ? `
CRITICAL — CHINESE INPUT RULE:
The user typed Chinese. This is a Chinese→English learning request.
- correctForm (in BOTH lookup and core): the most natural, complete English translation of the full Chinese input. Do NOT omit any part.
- correctionNote: omit (this is translation, not correction).
- lookup: provide English usage context and scenes for the translated expression.
- core: teach the learner how a native speaker FEELS and USES this English expression — feel, emotion, communicative intent.
- unnaturalMindModel: if a literal Chinese-style English would be tempting, contrast that transfer error with the native concept.
` : ''

  const prompt = `${roleIntro}

Given a ${langLabel} phrase or sentence, return ONE JSON object with EXACTLY two top-level keys: "lookup" and "core".
${webSearchResults ? `\nADDITIONAL CONTEXT (Web Search):\n${webSearchResults}\n` : ''}
Return ONLY a valid JSON object. No markdown. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "lookup": {
    ${lookupSchema}
  },
  "core": {
    ${coreSchema}
  }
}

Rules:
${chineseInputRule}
- Both sections analyze the SAME input from different angles.
- lookup = understanding + practical usage context.
- core = native communicative intent, emotional feel, when/why to choose this expression.
- CRITICAL — correctForm integrity: Do NOT shorten or truncate the input. correctForm is a proofread copy, not a rewrite. If input has no real errors, copy it verbatim.
- correctionNote: Only when correctForm differs from input. Omit if no change.
- unnaturalMindModel: Fill when input sounds like Chinese-to-English transfer. Omit if naturally idiomatic.
- FIELD OWNERSHIP: meaning = short gloss only. Put situational/intent content into usageIntro/usageScenes. Put feel/emotion into feelAnchor/emotionalTone.
${isShortPhrase ? '- Short phrases: keep "meaning" to 1-2 sentences max. Essays belong in usageIntro/usageScenes.' : '- CRITICAL — meaning completeness: For multi-sentence input, meaning MUST contain full sentence-by-sentence translation of ALL content.'}
${wantUsage ? '- Provide usageIntro (1 blurb) + 2-4 usage scenes in both sections.' : ''}
${mod(coreModules, 'wordChoice') ? '- core.wordChoiceContrast: 2-4 structured vs/reason rows.' : ''}
${isForeign ? '- For foreign input: prioritize culturalLore with deep subculture/ACG context.' : ''}
${isMono ? '- ALL output text must be in English only. No Chinese characters anywhere.' : ''}
- Keep everything concise. Never output anything outside the JSON object.`

  return prompt
}
