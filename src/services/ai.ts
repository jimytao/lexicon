import { detectLanguage } from '../stores/searchStore'
import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, EvaluationResult, ChatMessage } from '../types'

interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
  modules: Array<{ id: string; enabled: boolean }>
  webSearchEnabled: boolean
  tavilyApiKey: string
  triLingualExamples: boolean
}

function getConfig(): AiConfig {
  const defaultModules = [
    { id: 'dictionary', enabled: true },
    { id: 'semantic', enabled: true },
    { id: 'synonyms', enabled: true },
    { id: 'etymology', enabled: true },
    { id: 'mnemonic', enabled: true },
    { id: 'examples', enabled: true },
    { id: 'related', enabled: true },
    { id: 'practice', enabled: true },
    { id: 'culture', enabled: true },
    { id: 'chat', enabled: true },
  ]
  try {
    const stored = JSON.parse(localStorage.getItem('lexicon-settings') ?? '{}') as {
      state?: {
        aiProvider?: string
        aiEndpoint?: string
        aiModel?: string
        aiApiKeys?: Record<string, string>
        aiModels?: Record<string, string>
        modules?: Array<{ id: string; enabled: boolean }>
        webSearchEnabled?: boolean
        tavilyApiKey?: string
        triLingualExamples?: boolean
      }
    }
    const s = stored.state ?? {}
    const providerId = s.aiProvider ?? ''
    return {
      endpoint: s.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || '',
      model: s.aiModels?.[providerId] || s.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
      apiKey: s.aiApiKeys?.[providerId] || import.meta.env.VITE_AI_API_KEY || '',
      modules: s.modules || defaultModules,
      webSearchEnabled: s.webSearchEnabled ?? false,
      tavilyApiKey: s.tavilyApiKey ?? '',
      triLingualExamples: s.triLingualExamples ?? false,
    }
  } catch {
    return {
      endpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      model: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
      modules: defaultModules,
      webSearchEnabled: false,
      tavilyApiKey: '',
      triLingualExamples: false,
    }
  }
}

function getSystemPrompt(modules: Array<{ id: string; enabled: boolean }>, includeExamples: boolean = false): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  const includeSemantic = isEnabled('semantic')
  const includeExampleSchema = includeExamples && isEnabled('examples')

  let schema = `{\n  "meanings": [\n    {\n      "zh": "（情景前缀）中文释义",\n      "pos": "该义项对应的词性 (noun/verb/adj/adv/phrase)"${includeSemantic ? `,\n      "scene": {\n        "label": "2-4字的情景标签",\n        "description": "1-3句话，用口语化中文解释这种含义在什么情境下发生、是什么感觉、和其他含义有何区别"\n      }` : ''}\n    }\n  ]`
  
  if (isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "词根或词缀（对应原词中的实际字母片段）",\n        "meaning": "中文含义（来源语言）",\n        "sourceForm": "（仅词根）原始拉丁/希腊语形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词，e.g. select",\n        "anchorNote": "（仅词根）1句话中文：此锚点词如何体现词根含义，帮助联想记忆"\n      }\n    ],\n    "story": "1-2句话，说明字面意义如何演变成现在的含义",\n    "derivedWords": [\n      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "中文含义" }\n    ]\n  }`
  }
  
  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [\n    {\n      "word": "近义词",\n      "distinction": "1句话，说明与主词的情感色彩、使用场景或强度差异"\n    }\n  ],\n  "antonyms": [\n    {\n      "word": "反义词",\n      "distinction": "1句话，说明与主词的对比含义、使用场景或词义强弱差异"\n    }\n  ]`
  }
  if (includeExampleSchema) {
    schema += `,\n  "examples": [\n    { "en": "Example sentence using this word", "zh": "中文翻译" }\n  ]`
  }
  
  schema += `\n}`

  return `You are a professional English vocabulary analyst for Chinese native speakers.

Given an English word and its basic Chinese translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- meanings array length must match the number of meanings provided in the user message
${includeSemantic ? '- scene.description must be conversational Chinese, 1-3 sentences, NOT dictionary-style' : ''}
${isEnabled('etymology') ? '- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)\n- For each ROOT morpheme: fill sourceForm (original Latin/Greek root form, e.g. "legere"), anchor (a common word the learner likely knows sharing this root, e.g. "select" for -lect-), anchorNote (1 Chinese sentence: how the anchor word embodies the root meaning)\n- For pure prefixes/suffixes (e.g. in-, -tion, -ual): omit sourceForm, anchor, anchorNote\n- etymology.story: 1-2 sentences max\n- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)' : ''}
${isEnabled('synonyms') ? '- synonyms: provide 3-5 words, ordered from closest to most distant in meaning\n- synonyms distinction: 1 sentence each\n- antonyms: provide 3-5 words, ordered from most direct contrast to weaker contrast\n- antonyms distinction: 1 sentence each' : ''}
${includeExampleSchema ? '- examples: provide 3-5 natural, common, learner-friendly sentences' : ''}
- If the word has only one meaning, meanings array has one item
- Keep the entire response concise and compact
- Never output anything outside the JSON object`
}

const EXERCISES_SYSTEM_PROMPT = `You are a language practice exercise designer for Chinese learners.

Given a word/phrase in a specific language and its meanings, generate practice scenarios.

Return ONLY a valid JSON array. No markdown. No explanation.

[
  { "scenario": "中文场景描述，具体的日常情境，让学习者用目标词造句" }
]

Rules:
- The learner should be expected to use the target word/phrase in its original language.
- Prioritize the most COMMON and PRACTICAL meanings/usages.
- Never output anything outside the JSON array`

const EVAL_SYSTEM_PROMPT = `You are a language writing coach for Chinese learners.

Evaluate whether the student's sentence correctly uses the given word/phrase in the given scenario.

Return ONLY a valid JSON object. No markdown. No explanation.

{
  "correct": true or false,
  "feedback": "具体错误说明（中文），correct 为 true 时输出空字符串",
  "correction": "纠正后的句子，correct 为 true 时输出空字符串"
}

Rules:
- Mark correct ONLY if BOTH the meaning AND grammar are right.
- Grammar errors in the target language must be marked incorrect.
- feedback must be in Chinese, explain the specific rule that was violated.
- correction must be a natural, corrected version of the student's sentence.
- Never output anything outside the JSON object.`

function buildUserPrompt(word: string, meanings: Array<{ zh: string; en: string }>, includeExamples: boolean = false): string {
  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  return `Word: ${word}\n\nMeanings from dictionary:\n${meaningsText}${includeExamples ? '\n\nThe dictionary has no example sentences for this word. Generate examples in the JSON.' : ''}\n\nAnalyze this word and return the JSON.`
}

export async function analyzeWord(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  includeExamples: boolean = false,
  signal?: AbortSignal
): Promise<AiAnalysis> {
  const config = getConfig()

  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const userPrompt = buildUserPrompt(word, meanings, includeExamples)

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: getSystemPrompt(config.modules, includeExamples) },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''

  // Use the same robust cleaning as callApi
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(cleaned) as AiAnalysis
  } catch { /* fall through */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as AiAnalysis
    } catch { /* fall through */ }
  }

  console.error('AI raw response:', raw)
  throw new Error(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`)
}

function combineSignals(userSignal?: AbortSignal, timeoutMs: number = 60000): AbortSignal {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(new DOMException('TimeoutError', 'TimeoutError')), timeoutMs)
  if (userSignal) {
    userSignal.addEventListener('abort', () => {
      clearTimeout(tid)
      ctrl.abort(userSignal.reason)
    }, { once: true })
  }
  return ctrl.signal
}

async function callApi(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  // 60s hard cap so requests never hang indefinitely
  const merged = combineSignals(signal, 60000)

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal: merged,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  
  // Extract content from code fences if present
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  } else {
    // If no fences, try to find the first '{' and last '}' to extract JSON
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }
  }
  return cleaned
}

export async function performWebSearch(query: string, signal?: AbortSignal): Promise<string> {
  const config = getConfig()
  if (!config.webSearchEnabled || !config.tavilyApiKey) return ''

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.tavilyApiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
      }),
    })

    if (!response.ok) return ''
    const data = await response.json() as { results: Array<{ content: string; title: string }> }
    return data.results.map(r => `[${r.title}]: ${r.content}`).join('\n\n')
  } catch (e) {
    console.error('Web search failed:', e)
    return ''
  }
}

export async function generateExercises(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  count: number,
  signal?: AbortSignal
): Promise<Exercise[]> {
  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  const lang = detectLanguage(word)
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'the target language'

  const userPrompt = `Language: ${langName}\nTarget Word/Phrase: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practice scenarios for learning this ${langName} expression.`
  const cleaned = await callApi(EXERCISES_SYSTEM_PROMPT, userPrompt, signal)

  // Primary parse
  try {
    return JSON.parse(cleaned) as Exercise[]
  } catch { /* fall through */ }

  // Fallback: extract first [...] array found anywhere in the response
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as Exercise[]
    } catch { /* fall through */ }
  }

  console.error('generateExercises raw response:', cleaned)
  throw new Error(`AI returned invalid JSON for exercises`)
}

export async function evaluateAnswer(
  word: string,
  scenario: string,
  userAnswer: string,
  signal?: AbortSignal
): Promise<EvaluationResult> {
  const userPrompt = `Word: ${word}\nScenario: ${scenario}\nStudent's answer: "${userAnswer}"\n\nEvaluate the answer.`
  const cleaned = await callApi(EVAL_SYSTEM_PROMPT, userPrompt, signal)

  try {
    return JSON.parse(cleaned) as EvaluationResult
  } catch { /* fall through */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as EvaluationResult
    } catch { /* fall through */ }
  }

  console.error('evaluateAnswer raw response:', cleaned)
  throw new Error(`AI returned invalid JSON for evaluation`)
}

// ── AI 全量查词（词库无结果时） ──

function getFullLookupPrompt(modules: Array<{ id: string; enabled: boolean }>, lang: string = 'en', webSearchResults?: string, isFull: boolean = true, triLingual: boolean = false): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  let schema = `{\n  "correctForm": "the correct spelling of this word (fix typos if any)",\n  "phonetic": "phonetic transcription (IPA for English, Kana/Romaji for Japanese, etc.)",\n  "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)",\n  "meanings": [\n    {\n      "zh": "中文释义",\n      "en": "English definition (or original language equivalent)",\n      "pos": "specific part of speech",\n      "scene": {\n        "label": "2-4字情景标签",\n        "description": "1-3句口语化中文，解释这个含义在什么情境下使用"\n      }\n    }\n  ]`

  // For foreign languages, etymology is less about roots/affixes and more about composition or origin
  if (isFull && isEnabled('etymology')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    const etymLabel = isForeign ? '词汇构成/来源' : '词根词缀/来源'
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "构词成分（对应原词实际字母片段）",\n        "meaning": "含义",\n        "sourceForm": "（仅词根）原始词根形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词",\n        "anchorNote": "（仅词根）1句话中文：此词如何体现词根，帮助联想"\n      }\n    ],\n    "story": "1-2句话说明${etymLabel}",\n    "derivedWords": [{ "word": "相关词", "pos": "词性", "meaning": "含义" }]\n  }`
  }
  if (isFull && isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [{ "word": "近义词", "distinction": "与主词的差异" }],\n  "antonyms": [{ "word": "反义词", "distinction": "与主词的对比差异" }]`
  }
  if (isEnabled('examples')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "中文翻译" }\n  ]`
    } else {
      schema += `,\n  "examples": [\n    { "en": "Example sentence in original language (or target language)", "zh": "中文翻译" }\n  ]`
    }
  }
  
  if (isFull && lang !== 'en' && lang !== 'zh') {
    schema += `,\n  "culturalLore": {\n    "title": "趣味背景/文化渊源标签",\n    "content": "1-3句中文，介绍这个词的历史、文化背景、流行原因等",\n    "subculture": "如果是二次元、游戏圈、网络流行语，请说明其来源和圈内含义"\n  }`
  }

  schema += `\n}`

  const basePrompt = `You are a professional English vocabulary analyst for Chinese native speakers.`
  const multiLangPrompt = `You are a professional multi-language translator and cultural analyst. Your core mission is NOT just translation, but "Cultural Interpretation" — explaining the social, historical, and subculture context behind foreign words.`

  return `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} word, provide a complete analysis.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- For abbreviations, explain what each letter stands for.
- If the input is CHINESE: 
  - correctForm: provide the best English word.
  - meanings: provide 2-5 English alternatives with nuances.
- If the input is a FOREIGN LANGUAGE (not English/Chinese):
  - PRIORITY: Provide deep cultural/subculture context in "culturalLore". 
  - Explain the specific historical or social context behind the word.
  - For ACG (Anime/Comic/Games) or internet terms, specify the source and why it is popular.
${isFull && isEnabled('etymology') ? '- etymology.parts: each segment must correspond to the actual letters in the target word\n- For each ROOT morpheme: fill sourceForm (original Latin/Greek form), anchor (a common word the learner likely knows sharing this root), anchorNote (1 Chinese sentence connecting anchor → root meaning)\n- For pure prefixes/suffixes: omit sourceForm, anchor, anchorNote' : ''}
- Provide 3-5 ${isFull ? 'synonyms, 3-5 antonyms, and 3-5 examples' : 'examples'}.
- Keep everything concise.`
}

export async function aiFullLookup(
  word: string,
  isFull: boolean = true,
  signal?: AbortSignal
): Promise<AiFullResult> {
  const config = getConfig()
  const lang = detectLanguage(word)
  
  // Perform web search if enabled
  const webResults = await performWebSearch(word, signal)
  
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const cleaned = await callApi(
    getFullLookupPrompt(config.modules, lang, webResults, isFull, config.triLingualExamples),
    `${langName}: ${word}\n\nAnalyze this word and return the JSON.`,
    signal
  )
  try {
    return JSON.parse(cleaned) as AiFullResult
  } catch { /* fall through */ }
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as AiFullResult } catch { /* fall through */ }
  }
  throw new Error(`AI returned invalid JSON for full lookup`)
}

// ── AI 词组/句子查询 ──

function getPhrasePrompt(modules: Array<{ id: string; enabled: boolean }>, lang: string = 'en', webSearchResults?: string, isFull: boolean = true, triLingual: boolean = false): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  let schema = `{\n  "correctForm": "the correct/standard form of this phrase (fix grammar, preposition, or spelling errors if any)",\n  "meaning": "中文释义/翻译",\n  "usageScenes": [\n    {\n      "label": "2-4字场景标签",\n      "description": "1-3句口语化中文，说明在什么情景下使用这个表达，语气和感觉如何"\n    }\n  ]`

  if (isEnabled('examples')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "中文翻译" }\n  ]`
    } else {
      schema += `,\n  "examples": [\n    { "en": "Example sentence using this phrase", "zh": "中文翻译" }\n  ]`
    }
  }
  
  if (isFull && lang !== 'en' && lang !== 'zh') {
    schema += `,\n  "culturalLore": {\n    "title": "趣味背景/文化渊源标签",\n    "content": "1-3句中文，介绍这句话或词的历史、文化背景、流行原因等",\n    "subculture": "如果是二次元、游戏圈、网络流行语，请说明其来源 and 圈内含义"\n  }`
  }

  schema += `\n}`

  const basePrompt = `You are a professional English language analyst for Chinese native speakers.`
  const multiLangPrompt = `You are a professional multi-language translator and cultural analyst. You specialize in "Cultural Interpretation" — explaining the social, historical, and subculture (especially ACG/Internet) context behind foreign expressions.`

  return `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} phrase or sentence, provide a complete analysis.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- If input is CHINESE (targeting English):
  - correctForm: the most natural English translation.
  - usageScenes: explain when to use this translation vs others.
- If input is a FOREIGN LANGUAGE (not English/Chinese):
  - meaning: accurate and natural Chinese translation.
  - usageScenes: explain the specific feeling or tone of the original expression.
  - culturalLore: PRIORITY: Provide deep cultural/subculture context. Specify historical origins or social context if applicable.
- Provide 2-4 usage scenes, 2-4 examples.
- Keep everything concise.`
}

export async function aiPhraseQuery(
  phrase: string,
  isFull: boolean = true,
  signal?: AbortSignal
): Promise<PhraseResult> {
  const config = getConfig()
  const lang = detectLanguage(phrase)

  // Perform web search if enabled
  const webResults = await performWebSearch(phrase, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const cleaned = await callApi(
    getPhrasePrompt(config.modules, lang, webResults, isFull, config.triLingualExamples),
    `${langName}: ${phrase}\n\nAnalyze and return the JSON.`,
    signal
  )
  let parsed: Omit<PhraseResult, 'phrase'>
  try {
    parsed = JSON.parse(cleaned) as Omit<PhraseResult, 'phrase'>
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]) as Omit<PhraseResult, 'phrase'> } catch {
        throw new Error(`AI returned invalid JSON for phrase query`)
      }
    } else {
      throw new Error(`AI returned invalid JSON for phrase query`)
    }
  }
  return { phrase, ...parsed }
}

// ── AI 问答 ──

export async function askQuestion(
  context: string,
  history: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const systemPrompt = `You are a helpful English learning assistant for Chinese native speakers.
The user is currently studying: "${context}".
Answer their questions in Chinese, with English examples where appropriate.
Keep answers concise and practical.`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.5,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

// ── AI 助记生成 ──
const MNEMONIC_SYSTEM_PROMPT = `You are a creative English mnemonic expert. Your goal is to evaluate and provide the most effective memory aids for a given word.

Generate mnemonics for ALL THREE approaches and score each (0-100) based on its "potential to help a student remember the word permanently":

1. PHILOLOGY (词源逻辑):
   GOAL: Write a vivid, flowing NARRATIVE — NOT a factual etymology list. The learner already sees a structured breakdown of roots/affixes elsewhere; here you must turn that knowledge into a durable mental image.
   HOW:
   - Open with an anchor word the learner likely already knows that shares the same root (e.g. "你已经知道 select / collect"), then use it as a bridge: show HOW the shared root connects to the target word's meaning.
   - Describe a concrete scene, metaphor, or action that makes the root meaning visceral and memorable (e.g. a Roman scholar picking books, a river flowing through/splitting).
   - End by snapping back to the target word — why the image *is* the word's meaning.
   - Symbolic letter shapes (A=sharp top, V=valley) and letter interchanges (d↔t, v↔b) can be woven in if they add insight.
   - High score if the root connection is clear and the scene is vivid enough to replay in memory.

2. STORY (趣味故事):
   - Chinese homophones (scorpion -> 死抠屁眼, pest -> 拍死它).
   - Absurd, vivid, or humorous stories.
   - High score if the word sounds like a funny Chinese phrase.

3. SMART (智能联想):
   - A hybrid approach or a completely unique association (e.g., visual cues, connection to pop culture, or breaking the word into recognizable "mini-words" that aren't strictly roots).
   - Use this if the other two methods feel forced or weak.

JSON Output Schema:
{
  "philology": {
    "content": "Mnemonic narrative in Chinese, 2-4 sentences.",
    "score": 90,
    "reason": "Brief explanation of why this method works well or poorly."
  },
  "story": {
    "content": "Mnemonic text in Chinese.",
    "score": 30,
    "reason": "Brief explanation."
  },
  "smart": {
    "content": "Mnemonic text in Chinese.",
    "score": 60,
    "reason": "Brief explanation."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- philology.content MUST be a narrative paragraph, NOT a bullet list or etymology fact-dump. It should read like a mini story or vivid metaphor, 2-4 sentences.
- story.content and smart.content: 1-3 sentences each.
- bestType must indicate the approach with the highest score. If scores are close, prioritize: Philology > Story > Smart.
- Scores must be honest. If a word is extremely hard to remember, scores should reflect that.
- Return ONLY the JSON object.`

// ── AI 词组助记生成 ──
const PHRASE_MNEMONIC_SYSTEM_PROMPT = `You are an English phrasal verb and idiom expert. Your goal is to help students understand the "why" behind phrases, especially those involving prepositions.

Explain phrases from a NATIVE SPEAKER'S perspective, providing mnemonics for these approaches:

1. CORE IMAGE (核心意象 - mapped to "philology"):
   - Explain the root image of the preposition (e.g., 'in' is entering a space, 'up' is completeness/arrival, 'off' is detachment).
   - Use vivid metaphors (e.g., "pop in" is like a quick head-pop into a room through a window).
   - Show how the combination creates a logical "mental movie".

2. STORY (趣味故事 - mapped to "story"):
   - Use the historical origin or a modern humorous scenario to link the words.

3. SMART (智能联想 - mapped to "smart"):
   - Other intuitive ways to remember the phrase, or practical usage cues.

JSON Output Schema:
{
  "philology": {
    "content": "Core image explanation in Chinese.",
    "score": 90,
    "reason": "Why this core image makes sense."
  },
  "story": {
    "content": "Story or origin explanation in Chinese.",
    "score": 30,
    "reason": "Why this story helps."
  },
  "smart": {
    "content": "Smart association in Chinese.",
    "score": 60,
    "reason": "Why this association is useful."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- Focus on the "Native Thinking" (母语者思维).
- Explain the logic of prepositions clearly.
- bestType must be the highest scoring one.
- Never output anything outside the JSON object.`

export async function generatePhraseMnemonic(
  phrase: string,
  signal?: AbortSignal
): Promise<import('../types').Mnemonic> {
  const cleaned = await callApi(
    PHRASE_MNEMONIC_SYSTEM_PROMPT,
    `Phrase: ${phrase}\n\nGenerate a mnemonic from a native speaker's perspective and return the JSON.`,
    signal
  )
  try {
    return JSON.parse(cleaned) as import('../types').Mnemonic
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as import('../types').Mnemonic } catch {
        throw new Error('AI returned invalid JSON for phrase mnemonic')
      }
    }
  }
  throw new Error('AI returned invalid JSON for phrase mnemonic')
}



export async function generateMnemonic(
  word: string,
  signal?: AbortSignal
): Promise<import('../types').Mnemonic> {
  const cleaned = await callApi(
    MNEMONIC_SYSTEM_PROMPT,
    `Word: ${word}\n\nGenerate a mnemonic for this word and return the JSON.`,
    signal
  )
  try {
    return JSON.parse(cleaned) as import('../types').Mnemonic
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as import('../types').Mnemonic } catch {
        throw new Error('AI returned invalid JSON for mnemonic')
      }
    }
  }
  throw new Error('AI returned invalid JSON for mnemonic')
}

// ── 图片翻译 ──

// ── Fast prompt: OCR + translate only, no bbox (for translation list view) ──
const IMAGE_TRANSLATE_FAST_PROMPT = `You are a professional manga/image text detector and translator.

Detect ALL text regions and translate them. Do NOT calculate bounding boxes.

Return ONLY a valid JSON object. No markdown code fences. No explanation.

{
  "blocks": [
    {
      "original": "detected text in original language",
      "translation": "translated text in target language",
      "type": "bubble",
      "direction": "vertical"
    }
  ]
}

type: "bubble" | "sfx" | "caption"
direction: "vertical" | "horizontal"

Rules:
- Detect ALL visible text
- Keep translations natural, preserve tone and style
- For sfx: provide short description (e.g. "ゴゴゴ" → "隆隆隆")
- READING ORDER: First classify the image type, then choose the ordering rule.
  Step 1 — Classify the image:
    • MANGA: clear panel grid, speech bubbles with tails, illustrated artwork, comic-style layout
    • CHAT/MESSAGING: conversation interface where messages alternate between left and right sides (e.g. messaging apps, LINE, WeChat, iMessage, chat software screenshots). Key indicators: clean UI chrome, avatar icons, timestamps, plain rounded chat bubbles WITHOUT artistic tails/pointers. This takes priority over MANGA even if the source language is Japanese.
    • OTHER: tweet/social media screenshot, photo, sign, document, novel page, mixed real-world content
  Step 2 — Apply the rule:
    • MANGA with Japanese source → RIGHT-TO-LEFT panel columns, TOP-TO-BOTTOM rows.
      The rightmost column of panels is read first, leftmost last.
      Within each panel, follow the natural bubble sequence (top to bottom).
    • CHAT/MESSAGING → Order STRICTLY by vertical position (top-to-bottom) regardless of left/right placement and regardless of source language (including Japanese).
      Left/right alignment indicates only who sent the message, NOT reading order.
      Interleave left and right bubbles in the exact order they appear vertically, like a real conversation.
    • EVERYTHING ELSE (including Japanese tweets, photos, signs, Korean manhwa, Western comics) → TOP-TO-BOTTOM, LEFT-TO-RIGHT.
  Key insight: RTL ordering applies ONLY to the Japanese manga panel grid. A Japanese chat app screenshot is NOT manga — use CHAT/MESSAGING rule instead.
- If no text found, return {"blocks": []}
- Never output anything outside the JSON object`

// ── Full prompt: OCR + translate + bbox (for embed/inlay mode) ──
const IMAGE_TRANSLATE_FULL_PROMPT = `You are a professional manga/comic localization expert specializing in precise text region detection and translation.

POSITIONING REFERENCE SYSTEM:
- Imagine a 3x3 grid overlay on the image (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right)
- Use this grid to describe and verify text positions
- Always include visual reference like "top-left speech bubble" or "center caption box"

CRITICAL RULES FOR ACCURATE POSITIONING:
1. First, scan entire image and COUNT all distinct text regions
2. For each region: 
   - Identify its grid position (e.g., "top-left area", "center-right area")
   - Read ONLY the text visible at that exact location
   - Verify: "The text at [grid position] is [text]" before proceeding
   - Bounding boxes (detectedBbox) MUST tightly enclose ONLY the dialogue bubble or text block, leaving no excessive outer margins.
3. Recommend the optimal 'detectedMaskShape' based on these rules:
   - 'ellipse': Best for standard round, oval, or elliptical speech bubbles. This is the default.
   - 'circle': Best for perfectly round or circular bubbles.
   - 'capsule': Best for narrow, vertically elongated, or horizontally elongated capsules.
   - 'rect': Best for sharp rectangular signs, notes, or square bubbles.
   - 'rounded-rect': Best for captions, narration boxes, or cards with rounded corners.
   - 'diamond': Best for diamond-shaped background patterns or special bubbles.
   - 'burst': Best for highly expressive starbursts, explosions, or action exclamation bubbles.
   - 'none': MUST be chosen for Sound Effects (SFX), graffiti, or text overlays drawn directly over complex artwork/illustrations to avoid erasing and destroying the underlying background illustration.
   - 'polygon': If the bubble has a complex non-geometric outline, recommend 'polygon' and provide clockwise vertices in 'detectedPolygon'.
4. Never assign one region's text to another region's coordinates
5. For polygon shapes: trace ONLY the inner smooth boundary, ignore decorative spikes

Return ONLY a valid JSON object. No markdown, no explanation, no extra text.

{
  "regions": [
    {
      "id": "region_1",
      "original": "detected text in source language",
      "translation": "translated text",
      "type": "bubble",
      "direction": "vertical",
      "detectedBbox": { "x": 0.12, "y": 0.05, "w": 0.25, "h": 0.18 },
      "detectedPolygon": [{"x": 0.11, "y": 0.09}, {"x": 0.18, "y": 0.05}, {"x": 0.30, "y": 0.05}, {"x": 0.37, "y": 0.10}, {"x": 0.35, "y": 0.20}, {"x": 0.18, "y": 0.23}],
      "detectedMaskShape": "ellipse",
      "visualReference": "top-left speech bubble with spiky tail"
    }
  ]
}

Field rules:
- id: unique identifier (region_1, region_2, etc.)
- type: "bubble" | "sfx" | "caption"
- direction: "vertical" | "horizontal"
- detectedBbox: normalized 0-1 coordinates of where text is actually located
- detectedPolygon: clockwise vertices of inner boundary for bubble/caption only
- detectedMaskShape: "ellipse" | "rect" | "rounded-rect" | "circle" | "capsule" | "diamond" | "burst" | "polygon" | "none"
- visualReference: brief description using grid position for verification
- Order regions by natural reading order based on image type:
  • MANGA (Japanese): right-to-left panel columns, top-to-bottom rows
  • CHAT/MESSAGING (alternating left/right bubbles): strictly top-to-bottom by vertical position, interleaving left and right bubbles as they appear
  • ALL OTHER: top-to-bottom, then left-to-right
- If no text found: {"regions": []}
- Never output anything outside of JSON object`

const LANG_DISPLAY: Record<string, string> = {
  '中文': 'Chinese (Simplified)',
  '英语': 'English',
  '日语': 'Japanese',
  '韩语': 'Korean',
  '法语': 'French',
}

async function callImageTranslateAPI(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const targetDisplay = LANG_DISPLAY[targetLang] ?? targetLang
  const sourceDisplay = LANG_DISPLAY[sourceLang] ?? sourceLang
  const langHint = sourceLang === 'auto' ? '' : ` The source language is ${sourceDisplay}.`
  const enrichedPrompt = `CRITICAL LANGUAGE REQUIREMENT: Every "translation" field MUST be in ${targetDisplay}. Never translate to any other language.\n\n${prompt}`
  const userContent = [
    { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}` } },
    { type: 'text' as const, text: `Detect all text in this image and translate everything to ${targetDisplay}.${langHint} Return the JSON.` },
  ]

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: enrichedPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw.trim()

  let parsed: { regions?: import('../types').TextRegion[], blocks?: import('../types').TextBlock[] }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]) } catch {
        throw new Error('AI returned invalid JSON for image translation')
      }
    } else {
      throw new Error('AI returned invalid JSON for image translation')
    }
  }

  // Handle new regions format (with L1/L2 separation)
  if (parsed.regions) {
    return parsed.regions.map(region => ({
      original: region.original,
      translation: region.translation,
      type: region.type,
      direction: region.direction,
      bbox: region.detectedBbox,
      polygon: region.detectedPolygon,
      maskShape: region.detectedMaskShape,
      // Default values for L1/L2 properties
      l1ColorHue: 0,
      l1ColorSaturation: 1,
      l1ColorOpacity: 1,
      colorHue: 0,
      colorSaturation: 1,
      colorOpacity: 1,
      rotation: 0,
    }))
  }

  // Handle legacy blocks format (backward compatibility)
  return parsed.blocks ?? []
}

/** Fast: OCR + translate only, no bbox. Use for translation list view. */
export async function aiImageTranslateFast(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  return callImageTranslateAPI(imageBase64, sourceLang, targetLang, IMAGE_TRANSLATE_FAST_PROMPT, signal)
}

/** @deprecated since v0.6.0 — bbox detection moved to Tesseract.js OCR (src/services/ocr.ts).
 * Phase 2 embed mode no longer calls this function.
 * Use `aiImageTranslateFast` for Phase 1, then `detectTextRegions` + `matchBlocksToOcr` for Phase 2. */
export async function aiImageTranslateFull(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  return callImageTranslateAPI(imageBase64, sourceLang, targetLang, IMAGE_TRANSLATE_FULL_PROMPT, signal)
}

/** @deprecated use aiImageTranslateFast for Phase 1, then OCR for Phase 2 bbox */
export async function aiImageTranslate(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  return callImageTranslateAPI(imageBase64, sourceLang, targetLang, IMAGE_TRANSLATE_FULL_PROMPT, signal)
}

// ── Locate prompt: given known texts, find their bubble positions only ──
const IMAGE_LOCATE_PROMPT = `You are a manga/comic layout analyst. Your ONLY task is to locate speech bubbles and text regions.

You will receive a numbered list of text snippets already known to exist in this image. For EACH snippet, find the containing speech bubble or text region and return its bounding box and shape.

DO NOT translate. DO NOT detect new text. ONLY locate bubbles for the provided list.

Return ONLY a valid JSON object. No markdown, no explanation.

{
  "regions": [
    {
      "index": 1,
      "bbox": { "x": 0.12, "y": 0.05, "w": 0.25, "h": 0.18 },
      "maskShape": "ellipse",
      "polygon": null
    }
  ]
}

Rules:
- index: 1-based, matches the number in the provided text list
- bbox: normalized 0-1, covers the ENTIRE visible balloon or caption box (wider than just the text)
- maskShape — choose the best fit:
  - "ellipse": round/oval speech bubbles (default)
  - "circle": perfectly circular bubbles
  - "capsule": tall or wide elongated capsules
  - "rect": sharp rectangular boxes or signs
  - "rounded-rect": captions or narration boxes with rounded corners
  - "diamond": diamond-shaped bubbles
  - "burst": spiky/explosive action bubbles
  - "polygon": complex non-geometric shapes (must include polygon array)
  - "none": text drawn directly over artwork with no bubble background (SFX, graffiti)
- polygon: clockwise [{x,y}] vertices ONLY when maskShape is "polygon", otherwise null
- Omit entries you cannot locate (do not guess positions)
- Never output anything outside the JSON object`

/** Phase 2 embed: given known translated blocks, locate their bubble bboxes in the image.
 *  Decouples translation (Phase 1) from positional detection (Phase 2).
 *  Falls back to staggered positions for any blocks that could not be located. */
export async function aiImageLocateBubbles(
  imageBase64: string,
  blocks: import('../types').TextBlock[],
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const textList = blocks
    .map((b, i) => `[${i + 1}] ${b.original || b.translation || '(unknown)'}`)
    .join('\n')

  const userContent = [
    { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}` } },
    { type: 'text' as const, text: `Locate the speech bubble or caption region for each of the following ${blocks.length} text snippet(s):\n\n${textList}\n\nReturn the JSON.` },
  ]

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: IMAGE_LOCATE_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw.trim()

  type LocateRegion = { index: number; bbox: import('../types').TextBlock['bbox']; maskShape: string; polygon?: Array<{ x: number; y: number }> | null }
  let parsed: { regions?: LocateRegion[] } = { regions: [] }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    try { parsed = JSON.parse(objMatch?.[0] ?? '{}') } catch { /* fall through to fallback */ }
  }

  const regionMap = new Map<number, LocateRegion>()
  for (const r of parsed.regions ?? []) regionMap.set(r.index, r)

  let fallbackIdx = 0
  return blocks.map((block, i) => {
    const region = regionMap.get(i + 1)
    if (region?.bbox?.w) {
      return {
        ...block,
        bbox: region.bbox,
        maskShape: region.maskShape as import('../types').TextBlock['maskShape'],
        polygon: region.polygon ?? undefined,
      }
    }
    // Fallback: staggered position so the block is still visible
    const fb = { x: 0.05, y: 0.05 + fallbackIdx * 0.09, w: 0.42, h: 0.07 }
    fallbackIdx++
    return { ...block, bbox: fb, maskShape: block.maskShape ?? 'ellipse' as const }
  })
}

export async function testConnection(signal?: AbortSignal): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('未填写 API Key')
  if (!config.endpoint) throw new Error('未填写 Endpoint')

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    const hint =
      response.status === 401 ? 'API Key 无效或无权限' :
      response.status === 404 ? '模型不存在或 Endpoint 有误' :
      response.status === 429 ? '请求过于频繁，稍后重试' :
      text.slice(0, 120)
    throw new Error(hint)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const reply = data.choices?.[0]?.message?.content?.trim() ?? ''
  return reply || '连接成功'
}
