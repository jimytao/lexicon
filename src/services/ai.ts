import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, EvaluationResult, ChatMessage } from '../types'

interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
}

function getConfig(): AiConfig {
  try {
    const stored = JSON.parse(localStorage.getItem('lexicon-settings') ?? '{}') as {
      state?: {
        aiProvider?: string
        aiEndpoint?: string
        aiModel?: string
        aiApiKeys?: Record<string, string>
      }
    }
    const s = stored.state ?? {}
    const providerId = s.aiProvider ?? ''
    return {
      endpoint: s.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || '',
      model: s.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
      apiKey: s.aiApiKeys?.[providerId] || import.meta.env.VITE_AI_API_KEY || '',
    }
  } catch {
    return {
      endpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      model: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      apiKey: import.meta.env.VITE_AI_API_KEY ?? '',
    }
  }
}

const SYSTEM_PROMPT = `You are a professional English vocabulary analyst for Chinese native speakers.

Given an English word and its basic Chinese translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "meanings": [
    {
      "zh": "（情景前缀）中文释义",
      "scene": {
        "label": "2-4字的情景标签",
        "description": "1-3句话，用口语化中文解释这种含义在什么情境下发生、是什么感觉、和其他含义有何区别"
      }
    }
  ],
  "etymology": {
    "parts": [
      { "segment": "词根或词缀", "meaning": "中文含义（来源语言）" }
    ],
    "story": "1-2句话，说明字面意义如何演变成现在的含义",
    "derivedWords": [
      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "中文含义" }
    ]
  },
  "synonyms": [
    {
      "word": "近义词",
      "distinction": "1句话，说明与主词的情感色彩、使用场景或强度差异"
    }
  ]
}

Rules:
- meanings array length must match the number of meanings provided in the user message
- scene.description must be conversational Chinese, 1-3 sentences, NOT dictionary-style
- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)
- etymology.story: 1-2 sentences max
- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)
- synonyms: provide 3-5 words, ordered from closest to most distant in meaning
- synonyms distinction: 1 sentence each
- If the word has only one meaning, meanings array has one item
- Keep the entire response concise and compact
- Never output anything outside the JSON object`

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
        { role: 'system', content: SYSTEM_PROMPT },
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

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    signal,
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
  // Extract content from code fences if present (handles text before/after fences too)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return fenceMatch ? fenceMatch[1].trim() : raw.trim()
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

const AI_FULL_LOOKUP_PROMPT = `You are a professional English vocabulary analyst for Chinese native speakers.

Given an English word that is NOT in the dictionary (could be slang, abbreviation, neologism, etc.), provide a complete analysis.

Return ONLY a valid JSON object. No markdown code fences. No explanation.

{
  "correctForm": "the correct spelling of this word (fix typos if any)",
  "phonetic": "IPA phonetic transcription (e.g. /wɜːrd/)",
  "pos": "part of speech (noun/verb/adj/adv/abbr/etc.)",
  "meanings": [
    {
      "zh": "中文释义",
      "en": "English definition",
      "scene": {
        "label": "2-4字情景标签",
        "description": "1-3句口语化中文，解释这个含义在什么情境下使用"
      }
    }
  ],
  "etymology": {
    "parts": [{ "segment": "词根或词缀或缩写来源", "meaning": "含义（来源）" }],
    "story": "1-2句话说明来源或演变",
    "derivedWords": [{ "word": "相关词", "pos": "词性", "meaning": "含义" }]
  },
  "synonyms": [{ "word": "近义词", "distinction": "与主词的差异" }],
  "examples": [
    { "en": "English example sentence", "zh": "中文翻译" }
  ]
}

Rules:
- For abbreviations (e.g. RAG, OOC), explain what each letter stands for in etymology.parts
- correctForm: if the user misspelled the word, provide the correct spelling; if correct, just echo the word back
- Provide 1-5 meanings, 3-5 synonyms, 3-5 examples
- Keep everything concise`

export async function aiFullLookup(
  word: string,
  signal?: AbortSignal
): Promise<AiFullResult> {
  const cleaned = await callApi(
    AI_FULL_LOOKUP_PROMPT,
    `Word: ${word}\n\nAnalyze this word and return the JSON.`,
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

const AI_PHRASE_PROMPT = `You are a professional English language analyst for Chinese native speakers.

Given an English phrase or sentence, provide a complete analysis.

Return ONLY a valid JSON object. No markdown code fences. No explanation.

{
  "correctForm": "the correct/standard form of this phrase (fix grammar, preposition, or spelling errors if any)",
  "meaning": "中文释义/翻译",
  "usageScenes": [
    {
      "label": "2-4字场景标签",
      "description": "1-3句口语化中文，说明在什么情景下使用这个表达，语气和感觉如何"
    }
  ],
  "examples": [
    { "en": "Example sentence using this phrase", "zh": "中文翻译" }
  ],
  "exercises": [
    { "scenario": "中文场景描述，让学习者用这个表达造句" }
  ]
}

Rules:
- correctForm: if the user's phrase has errors (wrong preposition, grammar, spelling), provide the corrected standard form; if correct, echo the phrase back
- If the input is a phrase/collocation, focus on its idiomatic meaning and correct usage
- If it looks like the user may have the phrase slightly wrong (e.g. wrong preposition), still analyze the CORRECT form but mention the error in usageScenes
- Provide 2-4 usage scenes, 2-4 examples, 2-3 exercises
- Keep everything concise`

export async function aiPhraseQuery(
  phrase: string,
  signal?: AbortSignal
): Promise<PhraseResult> {
  const cleaned = await callApi(
    AI_PHRASE_PROMPT,
    `Phrase/Sentence: ${phrase}\n\nAnalyze and return the JSON.`,
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

// ── 图片翻译 ──

const IMAGE_TRANSLATE_PROMPT = `You are a professional manga/image text detector and translator.

Given an image, detect ALL text regions, classify them, and translate them.

Return ONLY a valid JSON object. No markdown code fences. No explanation.

{
  "blocks": [
    {
      "original": "detected text in original language",
      "translation": "translated text in target language",
      "type": "bubble",
      "direction": "vertical",
      "bbox": { "x": 0.12, "y": 0.05, "w": 0.25, "h": 0.08 }
    }
  ]
}

type must be one of:
- "bubble": text inside a speech/thought bubble or text box with a clear background (white, solid color)
- "sfx": sound effects, onomatopoeia, action text drawn directly on the artwork (no bubble background)
- "caption": small labels, character names, narrator text, or UI-like annotations

direction must be one of:
- "vertical": text is laid out top-to-bottom (common in Japanese/Chinese manga)
- "horizontal": text is laid out left-to-right

Rules:
- bbox coordinates are normalized 0-1 (relative to image width/height)
- x,y is the top-left corner of the text region
- bbox should tightly fit the text, NOT extend beyond the speech bubble boundary
- For bubble type: bbox must stay WITHIN the bubble border, do not include the bubble outline
- Detect ALL visible text including speech bubbles, sound effects, captions, labels
- Keep translations natural and contextual, preserve tone and style
- For manga/comics sound effects, provide a short translation/description (e.g. "ゴゴゴ" → "隆隆隆")
- Order blocks top-to-bottom, left-to-right
- If no text is found, return {"blocks": []}
- Never output anything outside the JSON object`

export async function aiImageTranslate(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal
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
        { role: 'system', content: IMAGE_TRANSLATE_PROMPT },
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

  let parsed: { blocks: import('../types').TextBlock[] }
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

  return parsed.blocks ?? []
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
