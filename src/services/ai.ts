import { detectLanguage } from '../stores/searchStore'
import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, EvaluationResult, ChatMessage } from '../types'

interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
  modules: Array<{ id: string; enabled: boolean }>
  webSearchEnabled: boolean
  tavilyApiKey: string
}

function getConfig(): AiConfig {
  const defaultModules = [
    { id: 'dictionary', enabled: true },
    { id: 'synonyms', enabled: true },
    { id: 'etymology', enabled: true },
    { id: 'mnemonic', enabled: true },
    { id: 'examples', enabled: true },
    { id: 'practice', enabled: true },
    { id: 'chat', enabled: true },
  ]
  try {
    const stored = JSON.parse(localStorage.getItem('lexicon-settings') ?? '{}') as {
      state?: {
        aiProvider?: string
        aiEndpoint?: string
        aiModel?: string
        aiApiKeys?: Record<string, string>
        modules?: Array<{ id: string; enabled: boolean }>
        webSearchEnabled?: boolean
        tavilyApiKey?: string
      }
    }
    const s = stored.state ?? {}
    const providerId = s.aiProvider ?? ''
    return {
      endpoint: s.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || '',
      model: s.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
      apiKey: s.aiApiKeys?.[providerId] || import.meta.env.VITE_AI_API_KEY || '',
      modules: s.modules || defaultModules,
      webSearchEnabled: s.webSearchEnabled ?? false,
      tavilyApiKey: s.tavilyApiKey ?? '',
    }
  } catch {
    return {
      endpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      model: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
      modules: defaultModules,
      webSearchEnabled: false,
      tavilyApiKey: '',
    }
  }
}

function getSystemPrompt(modules: Array<{ id: string; enabled: boolean }>): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  let schema = `{\n  "meanings": [\n    {\n      "zh": "（情景前缀）中文释义",\n      "pos": "该义项对应的词性 (noun/verb/adj/adv/phrase)",\n      "scene": {\n        "label": "2-4字的情景标签",\n        "description": "1-3句话，用口语化中文解释这种含义在什么情境下发生、是什么感觉、和其他含义有何区别"\n      }\n    }\n  ]`
  
  if (isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      { "segment": "词根或词缀", "meaning": "中文含义（来源语言）" }\n    ],\n    "story": "1-2句话，说明字面意义如何演变成现在的含义",\n    "derivedWords": [\n      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "中文含义" }\n    ]\n  }`
  }
  
  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [\n    {\n      "word": "近义词",\n      "distinction": "1句话，说明与主词的情感色彩、使用场景或强度差异"\n    }\n  ]`
  }
  
  schema += `\n}`

  return `You are a professional English vocabulary analyst for Chinese native speakers.

Given an English word and its basic Chinese translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- meanings array length must match the number of meanings provided in the user message
- scene.description must be conversational Chinese, 1-3 sentences, NOT dictionary-style
${isEnabled('etymology') ? '- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)\n- etymology.story: 1-2 sentences max\n- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)' : ''}
${isEnabled('synonyms') ? '- synonyms: provide 3-5 words, ordered from closest to most distant in meaning\n- synonyms distinction: 1 sentence each' : ''}
- If the word has only one meaning, meanings array has one item
- Keep the entire response concise and compact
- Never output anything outside the JSON object`
}

const EXERCISES_SYSTEM_PROMPT = `You are an English practice exercise designer for Chinese learners.

Given an English word and its meanings, generate practice scenarios.

Return ONLY a valid JSON array. No markdown. No explanation.

[
  { "scenario": "中文场景描述，具体的日常情境，让学习者用目标词造句" }
]

Rules:
- Each scenario must be a concrete, everyday Chinese-language situation
- Prioritize the most COMMON and PRACTICAL meanings/usages of the word (not rare or academic ones)
- Scenarios should require the learner to use the target word or one of its common forms
- Vary scenarios across different meanings if the word has multiple meanings
- Never output anything outside the JSON array`

const EVAL_SYSTEM_PROMPT = `You are an English writing coach for Chinese learners.

Evaluate whether the student's English sentence correctly uses the given word in the given scenario.

Return ONLY a valid JSON object. No markdown. No explanation.

{
  "correct": true or false,
  "feedback": "具体错误说明（中文），correct 为 true 时输出空字符串",
  "correction": "纠正后的句子，correct 为 true 时输出空字符串"
}

Rules:
- Mark correct ONLY if BOTH the meaning AND grammar are right
- Grammar errors (wrong verb form, wrong preposition, wrong sentence structure) must be marked incorrect — do not overlook them
- The word must appear in a grammatically correct construction, not just be present in the sentence
- Acceptable to ignore: minor typos in other words, capitalization, punctuation
- NOT acceptable to ignore: wrong verb pattern (e.g. "dangerous playing" instead of "dangerous to play"), wrong tense, subject-verb agreement errors, missing articles when they change meaning, unnatural or incorrect sentence structure
- feedback must be in Chinese, explain the specific grammar rule that was violated
- correction must be a natural, corrected version of the student's sentence
- Never output anything outside the JSON object`

function buildUserPrompt(word: string, meanings: Array<{ zh: string; en: string }>): string {
  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  return `Word: ${word}\n\nMeanings from dictionary:\n${meaningsText}\n\nAnalyze this word and return the JSON.`
}

export async function analyzeWord(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  signal?: AbortSignal
): Promise<AiAnalysis> {
  const config = getConfig()

  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const userPrompt = buildUserPrompt(word, meanings)

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
        { role: 'system', content: getSystemPrompt(config.modules) },
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

async function callApi(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  // 60s hard cap so requests never hang indefinitely
  const timeout = AbortSignal.timeout(60000)
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout

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

  const userPrompt = `Word: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practice scenarios.`
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

function getFullLookupPrompt(modules: Array<{ id: string; enabled: boolean }>, lang: string = 'en', webSearchResults?: string): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  let schema = `{\n  "correctForm": "the correct spelling of this word (fix typos if any)",\n  "phonetic": "phonetic transcription (IPA for English, Kana/Romaji for Japanese, etc.)",\n  "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)",\n  "meanings": [\n    {\n      "zh": "中文释义",\n      "en": "English definition (or original language equivalent)",\n      "pos": "specific part of speech",\n      "scene": {\n        "label": "2-4字情景标签",\n        "description": "1-3句口语化中文，解释这个含义在什么情境下使用"\n      }\n    }\n  ]`

  // For foreign languages, etymology is less about roots/affixes and more about composition or origin
  if (isEnabled('etymology')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    const etymLabel = isForeign ? '词汇构成/来源' : '词根词缀/来源'
    schema += `,\n  "etymology": {\n    "parts": [{ "segment": "构词成分或缩写来源", "meaning": "含义" }],\n    "story": "1-2句话说明${etymLabel}",\n    "derivedWords": [{ "word": "相关词", "pos": "词性", "meaning": "含义" }]\n  }`
  }
  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [{ "word": "近义词", "distinction": "与主词的差异" }]`
  }
  if (isEnabled('examples')) {
    schema += `,\n  "examples": [\n    { "en": "Example sentence in original language", "zh": "中文翻译" }\n  ]`
  }
  
  if (lang !== 'en' && lang !== 'zh') {
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
- Provide 3-5 synonyms, 3-5 examples.
- Keep everything concise.`
}

export async function aiFullLookup(
  word: string,
  signal?: AbortSignal
): Promise<AiFullResult> {
  const config = getConfig()
  const lang = detectLanguage(word)
  
  // Perform web search if enabled
  const webResults = await performWebSearch(word, signal)
  
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const cleaned = await callApi(
    getFullLookupPrompt(config.modules, lang, webResults),
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

function getPhrasePrompt(modules: Array<{ id: string; enabled: boolean }>, lang: string = 'en', webSearchResults?: string): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  let schema = `{\n  "correctForm": "the correct/standard form of this phrase (fix grammar, preposition, or spelling errors if any)",\n  "meaning": "中文释义/翻译",\n  "usageScenes": [\n    {\n      "label": "2-4字场景标签",\n      "description": "1-3句口语化中文，说明在什么情景下使用这个表达，语气和感觉如何"\n    }\n  ]`

  if (isEnabled('examples')) {
    schema += `,\n  "examples": [\n    { "en": "Example sentence using this phrase", "zh": "中文翻译" }\n  ]`
  }
  
  if (lang !== 'en' && lang !== 'zh') {
    schema += `,\n  "culturalLore": {\n    "title": "趣味背景/文化渊源标签",\n    "content": "1-3句中文，介绍这句话或词的历史、文化背景、流行原因等",\n    "subculture": "如果是二次元、游戏圈、网络流行语，请说明其来源 and 圈内含义"\n  }`
  }

  if (isEnabled('practice')) {
    schema += `,\n  "exercises": [\n    { "scenario": "中文场景描述，让学习者用这个表达造句" }\n  ]`
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
- Provide 2-4 usage scenes, 2-4 examples, 2-3 exercises.
- Keep everything concise.`
}

export async function aiPhraseQuery(
  phrase: string,
  signal?: AbortSignal
): Promise<PhraseResult> {
  const config = getConfig()
  const lang = detectLanguage(phrase)

  // Perform web search if enabled
  const webResults = await performWebSearch(phrase, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const cleaned = await callApi(
    getPhrasePrompt(config.modules, lang, webResults),
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
const MNEMONIC_SYSTEM_PROMPT = `You are a creative English mnemonic expert. Your goal is to evaluate and provide the most effective memory aid for a given word.

Evaluate THREE main approaches and score each (0-100) based on its "potential to help a student remember the word permanently":

1. PHILOLOGY (词源逻辑):
   - Symbolic letter shapes (A=sharp, V=valley).
   - Root evolution and letter interchanges (d/t, ac/acg).
   - Variations of common words.
   - High score if the word has a clear, deep logical connection.

2. STORY (趣味故事):
   - Chinese homophones (scorpion -> 死抠屁眼, pest -> 拍死它).
   - Absurd, vivid, or humorous stories.
   - High score if the word sounds like a funny Chinese phrase.

3. SMART (智能联想):
   - A hybrid approach or a completely unique association (e.g., visual cues, connection to pop culture, or breaking the word into recognizable "mini-words" that aren't strictly roots).
   - Use this if the other two methods feel forced or weak.

JSON Output Schema:
{
  "type": "philology" | "story" | "smart",
  "content": "The actual mnemonic text in Chinese.",
  "score": 85,
  "allScores": {
    "philology": 90,
    "story": 30,
    "smart": 60
  },
  "reason": "Brief explanation in Chinese why this method was chosen as the best."
}

Rules:
- Content should be 1-3 sentences.
- Priority: Philology > Story > Smart (if scores are close).
- Scores must be honest. If a word is extremely hard to remember, scores should reflect that.
- Return ONLY the JSON object.`

// ── AI 词组助记生成 ──
const PHRASE_MNEMONIC_SYSTEM_PROMPT = `You are an English phrasal verb and idiom expert. Your goal is to help students understand the "why" behind phrases, especially those involving prepositions.

Explain phrases from a NATIVE SPEAKER'S perspective using these approaches:

1. CORE IMAGE (核心意象 - Preferred for prepositions):
   - Explain the root image of the preposition (e.g., 'in' is entering a space, 'up' is completeness/arrival, 'off' is detachment).
   - Use vivid metaphors (e.g., "pop in" is like a quick head-pop into a room through a window).
   - Show how the combination creates a logical "mental movie".

2. STORY (趣味故事 - For idioms):
   - Use the historical origin or a modern humorous scenario to link the words.

JSON Output Schema:
{
  "type": "philology" | "story" | "smart",
  "content": "The actual mnemonic text in Chinese, explaining the native logic.",
  "score": 85,
  "allScores": { "philology": 90, "story": 30, "smart": 60 },
  "reason": "Brief explanation in Chinese."
}

Rules:
- Focus on the "Native Thinking" (母语者思维).
- Explain the logic of prepositions clearly.
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

export async function generateMnemonicForType(
  word: string,
  type: 'philology' | 'story' | 'smart',
  signal?: AbortSignal
): Promise<import('../types').Mnemonic> {
  const typeLabel = type === 'philology' ? 'PHILOLOGY (词源逻辑)' : type === 'story' ? 'STORY (趣味故事)' : 'SMART (智能联想)'
  const cleaned = await callApi(
    MNEMONIC_SYSTEM_PROMPT,
    `Word: ${word}\n\nYou MUST use the ${typeLabel} approach. Set type="${type}" in the JSON output. Generate a mnemonic and return the JSON.`,
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
- Order blocks top-to-bottom, left-to-right
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
3. Never assign one region's text to another region's coordinates
4. For polygon shapes: trace ONLY the inner smooth boundary, ignore decorative spikes

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
- visualReference: brief description using grid position for verification
- Order regions top-to-bottom, then left-to-right
- If no text found: {"regions": []}
- Never output anything outside of JSON object`

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

  const langHint = sourceLang === 'auto' ? '' : ` The source language is ${sourceLang}.`
  const userContent = [
    { type: 'image_url' as const, image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}` } },
    { type: 'text' as const, text: `Detect all text in this image and translate to ${targetLang}.${langHint} Return the JSON.` },
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
        { role: 'system', content: prompt },
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
