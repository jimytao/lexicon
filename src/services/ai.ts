import { detectLanguage, detectQueryType } from '../stores/searchStore'
import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, EvaluationResult, ChatMessage, PrepSpatialData, PrepSpatialItem } from '../types'

interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
  modules: Array<{ id: string; enabled: boolean }>
  webSearchEnabled: boolean
  tavilyApiKey: string
  triLingualExamples: boolean
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
}

function getConfig(): AiConfig {
  const defaultModules = [
    { id: 'dictionary', enabled: true },
    { id: 'collocations', enabled: true },
    { id: 'synonyms', enabled: true },
    { id: 'etymology', enabled: true },
    { id: 'mnemonic', enabled: true },
    { id: 'examples', enabled: true },
    { id: 'related', enabled: true },
    { id: 'practice', enabled: true },
    { id: 'culture', enabled: true },
    { id: 'chat', enabled: true },
    { id: 'preposition', enabled: true },
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
        monolingualWord?: boolean
        monolingualPhrase?: boolean
        monolingualSentence?: boolean
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
      monolingualWord: s.monolingualWord ?? false,
      monolingualPhrase: s.monolingualPhrase ?? false,
      monolingualSentence: s.monolingualSentence ?? false,
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
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
    }
  }
}

function getIsMono(query: string, config: AiConfig): boolean {
  const lang = detectLanguage(query)
  if (lang !== 'en') return false
  const qType = detectQueryType(query)
  if (qType === 'sentence') return config.monolingualSentence
  if (qType === 'phrase') return config.monolingualPhrase
  return config.monolingualWord
}

function getSystemPrompt(
  modules: Array<{ id: string; enabled: boolean }>,
  includeExamples: boolean = false,
  monolingualWord: boolean = false
): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  const includeSemantic = isEnabled('dictionary')
  const includeExampleSchema = includeExamples && isEnabled('examples')

  const meaningsZhDescription = monolingualWord 
    ? "English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'"
    : "（情景前缀）中文释义"
  const sceneLabel = monolingualWord ? "2-4 word English context tag" : "2-4字的情景标签"
  const sceneDesc = monolingualWord 
    ? "1-3 sentences in English: when this meaning occurs, tone, and how it differs"
    : "1-3句话，用口语化中文解释这种含义在什么情境下发生、是什么感觉、和其他含义有何区别"
  const partMeaning = monolingualWord ? "meaning in English" : "中文含义（来源语言）"
  const anchorNote = monolingualWord 
    ? "1 sentence in English: how this anchor word embodies the root meaning, helping association"
    : "1句话中文：此锚点词如何体现词根含义，帮助联想记忆"
  const storyDesc = monolingualWord ? "in English" : "1-2句话，说明字面意义如何演变成现在的含义"
  const derivedMeaning = monolingualWord ? "meaning in English" : "中文含义"
  const synonymDistinction = monolingualWord ? "English nuance explanation" : "1句话，说明与主词的情感色彩、使用场景或强度差异"
  const antonymDistinction = monolingualWord ? "English nuance explanation" : "1句话，说明与主词的对比含义、使用场景或词义强弱差异"

  let schema = `{\n  "meanings": [\n    {\n      "zh": "${meaningsZhDescription}",\n      "pos": "该义项对应的词性 (noun/verb/adj/adv/phrase)"${includeSemantic ? `,\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "一个用于搜图的具体英文名词或名词短语描述（3-6个英文单词，如 'person running business in office'）"` : ''}\n    }\n  ]`
  
  if (isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "词根或词缀（对应原词中的实际字母片段）",\n        "meaning": "${partMeaning}",\n        "sourceForm": "（仅词根）原始拉丁/希腊语形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词，e.g. select",\n        "anchorNote": "（仅词根）${anchorNote}"\n      }\n    ],\n    "story": "${storyDesc}",\n    "derivedWords": [\n      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "${derivedMeaning}" }\n    ]\n  }`
  }
  
  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [\n    {\n      "word": "近义词",\n      "distinction": "${synonymDistinction}"\n    }\n  ],\n  "antonyms": [\n    {\n      "word": "反义词",\n      "distinction": "${antonymDistinction}"\n    }\n  ]`
  }

  if (isEnabled('collocations')) {
    const collocationsNote = monolingualWord ? "English usage note" : "中文使用说明"
    schema += `,\n  "collocations": {\n    "chunks": [\n      { "chunk": "Verb/prep pattern using the word (语块)", "note": "${collocationsNote}" }\n    ],\n    "collocations": [\n      { "chunk": "Natural word combination (搭配)", "note": "${collocationsNote}" }\n    ]\n  }`
  }

  if (includeExampleSchema) {
    const exampleZh = monolingualWord ? "English meaning / explanation" : "中文翻译"
    schema += `,\n  "examples": [\n    { "en": "Example sentence using this word", "zh": "${exampleZh}" }\n  ]`
  }

  if (isEnabled('culture')) {
    const cultureContent = monolingualWord
      ? "1-2 sentences in English: the word's cultural origin, register (formal/informal/slang/technical), or notable usage shift"
      : "1-2句中文：词的文化来源、语域（正式/口语/俚语/专业）或值得注意的用法演变"
    schema += `,\n  "culturalLore": {\n    "title": "${monolingualWord ? '2-4 word English tag (e.g. Gen-Z Slang, Legal Jargon)' : '2-4字标签（如 网络用语、医学术语）'}",\n    "content": "${cultureContent}",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
  }
  
  schema += `\n}`

  const roleDescription = monolingualWord
    ? "You are a professional English vocabulary analyst for learners who prefer English-only monolingual explanations."
    : "You are a professional English vocabulary analyst for Chinese native speakers."

  let prompt = `${roleDescription}

Given an English word and its basic Chinese translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- meanings array length must match the number of meanings provided in the user message
${includeSemantic ? (monolingualWord ? '- scene.description must be conversational English, 1-3 sentences' : '- scene.description must be conversational Chinese, 1-3 sentences, NOT dictionary-style') : ''}
${isEnabled('etymology') ? `- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)
- For each ROOT morpheme: fill sourceForm (original Latin/Greek root form, e.g. "legere"), anchor (a common word the learner likely knows sharing this root, e.g. "select" for -lect-), anchorNote (1 ${monolingualWord ? 'English' : 'Chinese'} sentence: how the anchor word embodies the root meaning)
- For pure prefixes/suffixes (e.g. in-, -tion, -ual): omit sourceForm, anchor, anchorNote
- etymology.story: 1-2 sentences max
- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)` : ''}
${isEnabled('synonyms') ? `- synonyms: provide 3-5 words, ordered from closest to most distant in meaning
- synonyms distinction: 1 sentence each
- antonyms: provide 3-5 words, ordered from most direct contrast to weaker contrast
- antonyms distinction: 1 sentence each` : ''}
${isEnabled('collocations') ? `- collocations.chunks: provide 4-6 common verb+noun or prep+noun patterns using this word (语块)
- collocations.collocations: provide 4-6 natural word combinations (adj+noun, noun+verb)
- collocations notes: 1 brief note explaining the usage/combination, in ${monolingualWord ? 'English only' : 'Chinese'}` : ''}
${includeExampleSchema ? `- examples: provide 3-5 natural, common, learner-friendly sentences` : ''}
- If the word has only one meaning, meanings array has one item
- Keep the entire response concise and compact
- Never output anything outside the JSON object`

  if (monolingualWord) {
    prompt += `\n- ALL output text must be in English only. No Chinese characters anywhere.`
  }
  if (isEnabled('culture')) {
    prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: focus on what makes this word culturally interesting — register, origin, or shift in usage. Do NOT repeat etymology.`
  }

  return prompt
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

function buildUserPrompt(word: string, meanings: Array<{ zh: string; en: string }>, includeExamples: boolean = false, monolingualWord: boolean = false): string {
  const meaningsText = meanings
    .map((m, i) => monolingualWord ? `${i + 1}. EN: ${m.en}` : `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
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

  const userPrompt = buildUserPrompt(word, meanings, includeExamples, config.monolingualWord)

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
        { role: 'system', content: getSystemPrompt(config.modules, includeExamples, config.monolingualWord) },
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

export async function searchTavilyImage(query: string, signal?: AbortSignal): Promise<string | null> {
  const config = getConfig()
  if (!config.tavilyApiKey) return null

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.tavilyApiKey,
        query: `${query} photo`,
        include_images: true,
        max_results: 1,
      }),
    })

    if (!response.ok) return null
    const data = await response.json() as { images?: string[] }
    return data.images?.[0] || null
  } catch (e) {
    console.error('Tavily image search failed:', e)
    return null
  }
}

function getExercisesSystemPrompt(isMono: boolean): string {
  if (isMono) {
    return `You are a language practice exercise designer for English learners.

Given a word/phrase and its meanings, generate practice scenarios.

Return ONLY a valid JSON array. No markdown. No explanation.

[
  { "scenario": "Scenario description in simple English, creating a concrete everyday context for the learner to write a sentence using the target word/phrase." }
]

Rules:
- The scenario MUST be written entirely in simple, learner-friendly English (CEFR B1-B2 level).
- The learner should be expected to use the target word/phrase in their response.
- Prioritize the most COMMON and PRACTICAL meanings/usages.
- Never output anything outside the JSON array.`
  }

  return EXERCISES_SYSTEM_PROMPT
}

function getEvalSystemPrompt(isMono: boolean): string {
  if (isMono) {
    return `You are a language writing coach for English learners.

Evaluate whether the student's sentence correctly uses the given word/phrase in the given scenario.

Return ONLY a valid JSON object. No markdown. No explanation.

{
  "correct": true or false,
  "feedback": "Specific feedback/explanation in English. If correct is true, output an empty string.",
  "correction": "The corrected sentence. If correct is true, output an empty string."
}

Rules:
- Mark correct ONLY if BOTH the meaning AND grammar are right.
- Grammar errors in the target language must be marked incorrect.
- feedback must be in simple English, explaining the specific rule or usage nuance that was violated.
- correction must be a natural, corrected version of the student's sentence.
- Never output anything outside the JSON object.`
  }

  return EVAL_SYSTEM_PROMPT
}

export async function generateExercises(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  count: number,
  signal?: AbortSignal
): Promise<Exercise[]> {
  const config = getConfig()
  const isMono = getIsMono(word, config)

  const meaningsText = meanings
    .map((m, i) => isMono ? `${i + 1}. EN: ${m.en}` : `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  const lang = detectLanguage(word)
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'the target language'

  const userPrompt = `Language: ${langName}\nTarget Word/Phrase: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practice scenarios for learning this ${langName} expression.`
  const cleaned = await callApi(getExercisesSystemPrompt(isMono), userPrompt, signal)

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
  const config = getConfig()
  const isMono = getIsMono(word, config)
  const userPrompt = `Word: ${word}\nScenario: ${scenario}\nStudent's answer: "${userAnswer}"\n\nEvaluate the answer.`
  const cleaned = await callApi(getEvalSystemPrompt(isMono), userPrompt, signal)

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

function getFullLookupPrompt(
  modules: Array<{ id: string; enabled: boolean }>,
  lang: string = 'en',
  webSearchResults?: string,
  isFull: boolean = true,
  triLingual: boolean = false,
  monolingualWord: boolean = false
): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false
  const isMono = monolingualWord && lang === 'en'

  const meaningsZhDescription = isMono ? "English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'" : "中文释义"
  const meaningsEnDescription = "English definition (or original language equivalent)"
  const sceneLabel = isMono ? "2-4 word English context tag" : "2-4字情景标签"
  const sceneDesc = isMono ? "1-3 sentences in English: when this meaning occurs, tone, and how it differs" : "1-3句口语化中文，解释这个含义在什么情境下使用"
  const partMeaning = isMono ? "meaning in English" : "含义"
  const anchorNote = isMono ? "1 sentence in English: how this anchor word embodies the root meaning, helping association" : "1句话中文：此词如何体现词根，帮助联想"
  const storyDesc = isMono ? "in English" : `1-2句话说明${lang !== 'en' && lang !== 'zh' ? '词汇构成/来源' : '词根词缀/来源'}`
  const derivedMeaning = isMono ? "meaning in English" : "含义"
  const synonymDistinction = isMono ? "English nuance explanation" : "与主词的差异"
  const antonymDistinction = isMono ? "English nuance explanation" : "与主词的对比差异"

  let schema = `{\n  "correctForm": "the correct spelling of this word (fix typos if any)",\n  "phonetic": "phonetic transcription (IPA for English, Kana/Romaji for Japanese, etc.)",\n  "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)",\n  "coreConcept": {\n    "image": "${isMono ? '1-2 sentences describing the core physical image or underlying metaphor' : '1-2句描述单词的物理或逻辑核心意象 (Core Image)'}",\n    "explanation": "${isMono ? 'how this core image unifies and derives various meanings' : '核心意象如何统领和演变出各个具体分项释义'}"\n  },\n  "meanings": [\n    {\n      "zh": "${meaningsZhDescription}",\n      "en": "${meaningsEnDescription}",\n      "pos": "specific part of speech",\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "一个用于搜图的具体英文名词描述（3-6个英文单词，如 'person running business in office'）"\n    }\n  ]`

  // For foreign languages, etymology is less about roots/affixes and more about composition or origin
  if (isFull && isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "构词成分（对应原词实际字母片段）",\n        "meaning": "${partMeaning}",\n        "sourceForm": "（仅词根）原始词根形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词",\n        "anchorNote": "（仅词根）${anchorNote}"\n      }\n    ],\n    "story": "${storyDesc}",\n    "derivedWords": [{ "word": "相关词", "pos": "词性", "meaning": "${derivedMeaning}" }]\n  }`
  }
  if (isFull && isEnabled('synonyms')) {
    const whenToUseDesc = isMono ? "1 sentence in English: when and why native speakers choose this specific word" : "1句中文：母语者在何时及为何使用该词 (如: slim -> 表示夸奖优雅的瘦)"
    schema += `,\n  "synonyms": [{ "word": "近义词", "distinction": "${synonymDistinction}", "tone": "one of: positive | negative | neutral | informal", "whenToUse": "${whenToUseDesc}" }],\n  "antonyms": [{ "word": "反义词", "distinction": "${antonymDistinction}" }]`
  }

  if (isFull && isEnabled('collocations')) {
    const collocationsNote = isMono ? "English usage note" : "中文使用说明"
    const spatialDesc = isMono ? "1 short spatial or logical metaphor (e.g. take off -> control + detach = fly/succeed)" : "空间/逻辑意象延伸 (如: take off -> 掌控 + 脱离 = 飞离/突然成功)"
    schema += `,\n  "collocations": {\n    "chunks": [\n      { "chunk": "Verb/prep pattern using the word (语块)", "note": "${collocationsNote}", "spatialExtension": "${spatialDesc}" }\n    ],\n    "collocations": [\n      { "chunk": "Natural word combination (搭配)", "note": "${collocationsNote}" }\n    ]\n  }`
  }

  if (isEnabled('examples')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "中文翻译" }\n  ]`
    } else {
      const exampleZh = isMono ? "English meaning / explanation" : "中文翻译"
      schema += `,\n  "examples": [\n    { "en": "Example sentence in original language (or target language)", "zh": "${exampleZh}" }\n  ]`
    }
  }
  
  if (isFull && isEnabled('culture')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign) {
      // Foreign words: keep deep subculture/ACG focus
      schema += `,\n  "culturalLore": {\n    "title": "趣味背景/文化渊源标签",\n    "content": "1-3句中文，介绍这个词的历史、文化背景、流行原因等",\n    "subculture": "如果是二次元、游戏圈、网络流行语，说明其来源 and 圈内含义",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    } else {
      // English / Chinese words: focus on register + cultural note
      const cultureContent = isMono
        ? "1-2 sentences in English: the word's cultural origin, register (formal/informal/slang/technical), or notable usage shift"
        : "1-2句中文：词的文化来源、语域（正式/口语/俚语/专业）或值得注意的用法演变"
      schema += `,\n  "culturalLore": {\n    "title": "${isMono ? '2-4 word English tag (e.g. Gen-Z Slang, Legal Jargon)' : '2-4字标签（如 网络用语、医学术语）'}",\n    "content": "${cultureContent}",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    }
  }

  schema += `,\n  "conceptGraph": {\n    "rootCore": "${isMono ? '1-3 word core concept label' : '1-3字核心归纳'}",\n    "branches": [\n      {\n        "category": "${isMono ? 'Domain category (e.g. Physical Motion, Machines, Business)' : '延伸领域分类 (如: 物理运动, 机器运转, 经营管理)'}",\n        "examples": ["${isMono ? 'phrase or example 1' : '典型表达/短语 1'}", "${isMono ? 'phrase or example 2' : '典型表达/短语 2'}"]\n      }\n    ]\n  }`

  schema += `\n}`

  const basePrompt = isMono
    ? `You are a professional English vocabulary analyst for learners who prefer English-only monolingual explanations.`
    : `You are a professional English vocabulary analyst for Chinese native speakers.`
  const multiLangPrompt = `You are a professional multi-language translator and cultural analyst. Your core mission is NOT just translation, but "Cultural Interpretation" — explaining the social, historical, and subculture context behind foreign words.`

  let prompt = `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} word, provide a complete analysis.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- meanings: provide the most common and practical meanings (typically 2-8, ordered strictly by frequency).
- For abbreviations, explain what each letter stands for.
- If the input is CHINESE: 
  - correctForm: provide the best English word.
  - meanings: provide 2-5 English alternatives with nuances.
- If the input is a FOREIGN LANGUAGE (not English/Chinese):
  - PRIORITY: Provide deep cultural/subculture context in "culturalLore". 
  - Explain the specific historical or social context behind the word.
  - For ACG (Anime/Comic/Games) or internet terms, specify the source and why it is popular.
${isFull && isEnabled('etymology') ? `- etymology.parts: each segment must correspond to the actual letters in the target word
- For each ROOT morpheme: fill sourceForm (original Latin/Greek form), anchor (a common word the learner likely knows sharing this root), anchorNote (1 ${isMono ? 'English' : 'Chinese'} sentence connecting anchor → root meaning)
- For pure prefixes/suffixes: omit sourceForm, anchor, anchorNote` : ''}
${isFull && isEnabled('collocations') ? `- collocations.chunks: provide 4-6 common verb+noun or prep+noun patterns using this word (语块)
- collocations.collocations: provide 4-6 natural word combinations (adj+noun, noun+verb)
- collocations notes: 1 brief note explaining the usage/combination, in ${isMono ? 'English only' : 'Chinese'}` : ''}
- Provide 3-5 ${isFull ? 'synonyms, 3-5 antonyms, and 3-5 examples' : 'examples'}.
- Keep everything concise.`

  if (isMono) {
    prompt += `\n- ALL output text must be in English only. No Chinese characters anywhere.`
  }
  if (isFull && isEnabled('culture')) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign) {
      prompt += `\n- culturalLore: PRIORITY for foreign words. Provide deep cultural/subculture context. Specify ACG source, historical origin, or social context.`
    } else {
      prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: focus on register, cultural origin, or usage shift. Do NOT repeat etymology.`
    }
  }

  return prompt
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
    getFullLookupPrompt(config.modules, lang, webResults, isFull, config.triLingualExamples, config.monolingualWord),
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

function getPhrasePrompt(
  modules: Array<{ id: string; enabled: boolean }>,
  lang: string = 'en',
  webSearchResults?: string,
  isFull: boolean = true,
  triLingual: boolean = false,
  isMono: boolean = false
): string {
  const isEnabled = (id: string) => modules.find(m => m.id === id)?.enabled !== false

  const meaningDesc = isMono
    ? "English definition or complete line-by-line translation in simple terms. For multi-sentence or long paragraphs, you MUST provide full translation for ALL sentences, NOT just a summary."
    : "中文释义与准确翻译。若输入为多句子或长段落文章，必须包含针对所有句子的完整全文翻译（可首行放一句话【主题概括】，但后文必须接全文本的逐句完整翻译），绝对不可仅给出一句简短概括。"
  const sceneDesc = isMono ? "1-3 sentences in English, explaining when to use this expression, tone, and feeling" : "1-3句口语化中文，说明在什么情景下使用这个表达，语气和感觉如何"

  const correctionNoteDesc = isMono
    ? "If correctForm differs from input: 1-2 sentences in English explaining why — e.g. 'The original is understandable but unnatural; native speakers say X instead.' or 'Minor grammar error: subject-verb agreement.' Focus on the most important issue only. Skip trivial capitalization/punctuation unless it changes meaning. Omit this field if no change was made."
    : "如果 correctForm 与原文不同，用1-2句中文简要说明改动原因，分类标注（能理解但不地道 / 能理解但更通畅 / 语法或搭配有误 / 无实质性错误微调），仅提及最关键的问题。大小写/标点等只在影响意思时才提及。无改动时省略此字段。"

  let schema = `{\n  "correctForm": "the corrected/standard form — fix real grammar, preposition, or spelling errors ONLY. CRITICAL: do NOT shorten, summarize, or truncate the input. If input is a long sentence or multi-sentence paragraph, keep ALL content intact and only fix actual errors. correctForm is the proofread original, not a rewrite.",\n  "correctionNote": "${correctionNoteDesc}",\n  "meaning": "${meaningDesc}",\n  "usageScenes": [\n    {\n      "label": "${isMono ? '2-4 word English context tag' : '2-4字场景标签'}",\n      "description": "${sceneDesc}"\n    }\n  ]`

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
        : "1-2句中文：这个表达的语域（正式/口语/俚语/专业）或值得知道的文化背景"
      schema += `,\n  "culturalLore": {\n    "title": "${isMono ? '2-4 word English tag' : '2-4字标签'}",\n    "content": "${cultureContent}",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    }
  }

  schema += `\n}`

  const basePrompt = isMono
    ? `You are a professional English language analyst for learners who prefer English-only monolingual explanations.`
    : `You are a professional English language analyst for Chinese native speakers.`
  const multiLangPrompt = `You are a professional multi-language translator and cultural analyst. You specialize in "Cultural Interpretation" — explaining the social, historical, and subculture (especially ACG/Internet) context behind foreign expressions.`

  let prompt = `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} phrase or sentence, provide a complete analysis.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- CRITICAL — meaning completeness: For long text or multi-sentence paragraphs, "meaning" MUST contain a complete, line-by-line / sentence-by-sentence full translation of ALL content. You may put a brief 1-sentence topic summary at the very beginning (e.g., "【主题概括】..."), but you MUST follow with the full translation of every sentence. DO NOT output only a summary!
- CRITICAL — correctForm integrity: Do NOT delete, shorten, summarize, or truncate any part of the input. If input is a long sentence or multi-sentence paragraph, correctForm must preserve ALL sentences and content — only fix actual errors word by word. correctForm is a proofread copy, NOT a rewrite or summary.
- If the input has NO real errors, set correctForm exactly equal to the input (copy it verbatim). Only change what is genuinely wrong.
- correctionNote: Only include when correctForm differs from the input. Classify the change as one of: (a) understandable but unnatural/not idiomatic, (b) understandable but can flow better, (c) actual grammar/collocation error, (d) no real error, minor polish only. Mention capitalization/punctuation ONLY if it changes meaning or is a serious mistake. Omit correctionNote entirely if correctForm == input.
- unnaturalMindModel: When input sounds unnatural, un-idiomatic, or reflects Chinese-to-English translation mindset, fill unnaturalMindModel with detailed cognitive breakdown (chineseThought, nativeConcept, reusablePrinciple). Omit if input is already natural.
- If input is CHINESE (targeting English):
  - correctForm: the most natural, complete English translation of the full input — do NOT omit any part of the Chinese.
  - correctionNote: omit (translation, not correction).
  - usageScenes: explain when to use this translation vs others.
- If input is a FOREIGN LANGUAGE (not English/Chinese):
  - meaning: accurate and natural translation.
  - usageScenes: explain the specific feeling or tone of the original expression.
  - culturalLore: PRIORITY: Provide deep cultural/subculture context. Specify historical origins or social context if applicable.
- Provide 2-4 usage scenes, 2-4 examples.
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

  const qType = detectQueryType(phrase)
  const isMono = qType === 'sentence'
    ? config.monolingualSentence
    : config.monolingualPhrase  // phraseQuery only handles phrase/sentence; fallback is phrase, not word

  const cleaned = await callApi(
    getPhrasePrompt(config.modules, lang, webResults, isFull, config.triLingualExamples, isMono),
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
  signal?: AbortSignal,
  richContext?: string
): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const isMono = getIsMono(context, config)
  const richSection = richContext
    ? `\n\nHere is the analysis already displayed to the user for reference:\n${richContext}\n\nAnswer based on this context where relevant.`
    : ''
  const systemPrompt = isMono
    ? `You are a helpful English learning assistant for learners who prefer English-only monolingual explanations.\nThe user is currently studying: "${context}".${richSection}\nAnswer their questions in clear, simple, learner-friendly English (CEFR B1-B2 level), with English examples where appropriate.\nKeep answers concise and practical.`
    : `You are a helpful English learning assistant for Chinese native speakers.\nThe user is currently studying: "${context}".${richSection}\nAnswer their questions in Chinese, with English examples where appropriate.\nKeep answers concise and practical.`

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

function getMnemonicSystemPrompt(isMono: boolean): string {
  if (isMono) {
    return `You are a creative English mnemonic expert. Your goal is to evaluate and provide the most effective memory aids for a given word.

Generate mnemonics for ALL THREE approaches and score each (0-100) based on its "potential to help a student remember the word permanently":

1. PHILOLOGY:
   GOAL: Write a vivid, flowing NARRATIVE — NOT a factual etymology list. The learner already sees a structured breakdown of roots/affixes elsewhere; here you must turn that knowledge into a durable mental image.
   HOW:
   - Open with an anchor word the learner likely already knows that shares the same root (e.g. "If you know select or collect..."), then use it as a bridge: show HOW the shared root connects to the target word's meaning.
   - Describe a concrete scene, metaphor, or action that makes the root meaning visceral and memorable (e.g., a scholar picking books, a river flowing through).
   - End by snapping back to the target word — why the image *is* the word's meaning.
   - High score if the root connection is clear and the scene is vivid.

2. STORY:
   - Absurd, vivid, or humorous stories in English.
   - You can use English wordplay, rhyming words, spelling mnemonics, or puns (e.g., "hear" has "ear", "d-e-s-s-e-r-t" has double "s" because you want Sweet Stuff, "desert" has one "s" because it's Sandy).
   - High score if the association is memorable and funny.

3. SMART:
   - A hybrid approach or a unique association (e.g., visual cues based on letter shapes like V representing a valley, connection to pop culture, or breaking the word into recognizable "mini-words" that aren't strictly roots).
   - Use this if the other two methods feel forced or weak.

JSON Output Schema:
{
  "philology": {
    "content": "Mnemonic narrative in English, 2-4 sentences.",
    "score": 90,
    "reason": "Brief explanation of why this method works well or poorly, in English."
  },
  "story": {
    "content": "Mnemonic text in English, 1-3 sentences.",
    "score": 30,
    "reason": "Brief explanation in English."
  },
  "smart": {
    "content": "Mnemonic text in English, 1-3 sentences.",
    "score": 60,
    "reason": "Brief explanation in English."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- philology.content MUST be a narrative paragraph, NOT a bullet list or etymology fact-dump. It should read like a mini story or vivid metaphor, 2-4 sentences.
- bestType must indicate the approach with the highest score. If scores are close, prioritize: Philology > Story > Smart.
- Scores must be honest.
- ALL output text must be in English only. No Chinese characters anywhere. Use clear, learner-friendly English.
- Return ONLY the JSON object.`
  }

  return MNEMONIC_SYSTEM_PROMPT
}

function getPhraseMnemonicSystemPrompt(isMono: boolean): string {
  if (isMono) {
    return `You are an English phrasal verb and idiom expert. Your goal is to help students understand the "why" behind phrases, especially those involving prepositions.

Explain phrases from a NATIVE SPEAKER'S perspective, providing mnemonics for these approaches:

1. CORE IMAGE (mapped to "philology"):
   - Explain the root image of the preposition in English (e.g., 'in' is entering a space, 'up' is completeness/arrival, 'off' is detachment).
   - Use vivid metaphors (e.g., "pop in" is like a quick head-pop into a room through a window).
   - Show how the combination creates a logical "mental movie".

2. STORY (mapped to "story"):
   - Use the historical origin or a modern humorous scenario in English to link the words.

3. SMART (mapped to "smart"):
   - Other intuitive ways to remember the phrase, or practical usage cues in English.

JSON Output Schema:
{
  "philology": {
    "content": "Core image explanation in English.",
    "score": 90,
    "reason": "Why this core image makes sense, in English."
  },
  "story": {
    "content": "Story or origin explanation in English.",
    "score": 30,
    "reason": "Why this story helps, in English."
  },
  "smart": {
    "content": "Smart association in English.",
    "score": 60,
    "reason": "Why this association is useful, in English."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- Focus on the "Native Thinking" (母语者思维).
- Explain the logic of prepositions clearly.
- bestType must be the highest scoring one.
- ALL output text must be in English only. No Chinese characters anywhere. Use clear, learner-friendly English.
- Never output anything outside the JSON object.`
  }

  return PHRASE_MNEMONIC_SYSTEM_PROMPT
}

function getSingleMnemonicPrompt(isMono: boolean): string {
  if (isMono) {
    return `You are a creative English mnemonic expert. Your goal is to generate or refine a single mnemonic of a specific type for a given English word or phrase.

There are three types of mnemonics:
1. PHILOLOGY (词源逻辑 / 核心意象):
   - For words: Write a vivid, flowing narrative paragraph (2-4 sentences) connecting the word's root/affix to its meaning using an anchor word the learner likely knows (e.g. collect/select). Describe a concrete scene/metaphor. DO NOT output a bullet list or factual etymology dump.
   - For phrases: Explain the core image of the preposition/verb combination (e.g., 'in' is entering space, 'up' is completion) with vivid metaphors and a logical "mental movie".
2. STORY (趣味故事):
   - Use English wordplay, rhyming words, puns, spelling tricks, or absurd, vivid, or humorous stories in English (1-3 sentences).
3. SMART (智能联想):
   - A hybrid approach or a completely unique association in English (e.g., visual letter shapes, pop culture, breaking the word into recognizable "mini-words") (1-3 sentences).

Input parameters:
- Word/Phrase: The target expression.
- Type: The requested mnemonic type (philology | story | smart).
- Current Mnemonic Content: The current mnemonic of this type that the user wants to change. YOU MUST generate a completely different one. Do not repeat or slightly rephrase the current one.
- User's Mnemonic Idea (optional): An idea or related word proposed by the user.

If User's Mnemonic Idea is provided:
1. Carefully check/verify the idea. Is it correct, helpful, and logical for remembering the word?
2. If it is viable and helpful, adopt and expand it into a fully formed mnemonic of the requested type.
3. If it is NOT viable or misleading:
   - Generate a new, correct mnemonic of the requested type.
   - In the "reason" field, explain gently in English why the user's idea might not be the best fit and explain the logic of the new mnemonic.

Output format MUST be a valid JSON object:
{
  "content": "Mnemonic text in English.",
  "score": 0-100 score representing memory effectiveness,
  "reason": "Brief explanation in English. If the user provided an idea, explain if it was adopted/why or why not."
}

Rules:
- ALL output text must be in English only. No Chinese characters anywhere. Use clear, learner-friendly English.
- Return ONLY the JSON object. No markdown code fences. No extra text.`
  }

  return `You are a creative English mnemonic expert. Your goal is to generate or refine a single mnemonic of a specific type for a given English word or phrase.

There are three types of mnemonics:
1. PHILOLOGY (词源逻辑 / 核心意象):
   - For words: Write a vivid, flowing narrative paragraph (2-4 sentences) connecting the word's root/affix to its meaning using an anchor word the learner likely knows (e.g. collect/select). Describe a concrete scene/metaphor. DO NOT output a bullet list or factual etymology dump.
   - For phrases: Explain the core image of the preposition/verb combination (e.g., 'in' is entering space, 'up' is completion) with vivid metaphors and a logical "mental movie".
2. STORY (趣味故事):
   - Use Chinese homophones, absurd, vivid, or humorous stories (1-3 sentences).
3. SMART (智能联想):
   - A hybrid approach or a completely unique association (e.g., visual letter shapes, pop culture, breaking the word into recognizable "mini-words") (1-3 sentences).

Input parameters:
- Word/Phrase: The target expression.
- Type: The requested mnemonic type (philology | story | smart).
- Current Mnemonic Content: The current mnemonic of this type that the user wants to change. YOU MUST generate a completely different one. Do not repeat or slightly rephrase the current one.
- User's Mnemonic Idea (optional): An idea or related word proposed by the user.

If User's Mnemonic Idea is provided:
1. Carefully check/verify the idea. Is it correct, helpful, and logical for remembering the word?
2. If it is viable and helpful, adopt and expand it into a fully formed mnemonic of the requested type.
3. If it is NOT viable or misleading:
   - Generate a new, correct mnemonic of the requested type.
   - In the "reason" field, explain gently in Chinese why the user's idea might not be the best fit (e.g., "您的想法挺有趣，不过该词跟...可能更有关系...") and explain the logic of the new mnemonic.

Output format MUST be a valid JSON object:
{
  "content": "Mnemonic text in Chinese.",
  "score": 0-100 score representing memory effectiveness,
  "reason": "Brief explanation in Chinese. If the user provided an idea, explain if it was adopted/why or why not."
}

Rules:
- Return ONLY the JSON object. No markdown code fences. No extra text.`
}

export async function generatePhraseMnemonic(
  phrase: string,
  signal?: AbortSignal
): Promise<import('../types').Mnemonic> {
  const config = getConfig()
  const isMono = getIsMono(phrase, config)
  const cleaned = await callApi(
    getPhraseMnemonicSystemPrompt(isMono),
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
  const config = getConfig()
  const isMono = getIsMono(word, config)
  const cleaned = await callApi(
    getMnemonicSystemPrompt(isMono),
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

export async function generateSingleMnemonic(
  word: string,
  type: 'philology' | 'story' | 'smart',
  isPhrase: boolean,
  currentMnemonicContent?: string,
  userIdea?: string,
  signal?: AbortSignal
): Promise<import('../types').MnemonicItem> {
  const currentPrompt = currentMnemonicContent ? `Current mnemonic content of this type: "${currentMnemonicContent}"` : ''
  const ideaPrompt = userIdea ? `User's proposed idea/word: "${userIdea}"` : ''

  const userPrompt = `Target Expression: ${word}
Mnemonic Type: ${type}
Is Phrase/Sentence: ${isPhrase ? 'Yes' : 'No'}
${currentPrompt}
${ideaPrompt}

Please generate or refine the mnemonic for this type based on the instructions.`

  const config = getConfig()
  const isMono = getIsMono(word, config)

  const cleaned = await callApi(
    getSingleMnemonicPrompt(isMono),
    userPrompt,
    signal
  )

  try {
    return JSON.parse(cleaned) as import('../types').MnemonicItem
  } catch { /* fall through */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as import('../types').MnemonicItem
    } catch { /* fall through */ }
  }

  console.error('generateSingleMnemonic raw response:', cleaned)
  throw new Error(`AI returned invalid JSON for single mnemonic`)
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

// ── Trilingual prompt: OCR + translate to target lang + English (for trilingual mode) ──
const IMAGE_TRANSLATE_TRILINGUAL_PROMPT = `You are a professional manga/image text detector and translator.

Detect ALL text regions and translate them. Do NOT calculate bounding boxes.

Return ONLY a valid JSON object. No markdown code fences. No explanation.

{
  "blocks": [
    {
      "original": "detected text in original language",
      "translation": "translated text in target language",
      "translationEn": "natural English translation of the original text",
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
- For sfx: provide short description (e.g. "ゴゴゴ" → "隆隆隆" / "Rumble")
- "translation" MUST be in the specified target language
- "translationEn" MUST always be in natural English, regardless of target language
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

  let parsed: { blocks?: import('../types').TextBlock[] }
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

/** Fast: OCR + translate only, no bbox. Use for translation list view.
 *  When triLingualExamples is enabled and source is a foreign language (non-Chinese/English),
 *  uses the trilingual prompt to also return an English translation in `translationEn`.
 */
export async function aiImageTranslateFast(
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<import('../types').TextBlock[]> {
  const config = getConfig()
  const isForeign = sourceLang !== '中文' && sourceLang !== '英语'
  const useTriLingual = config.triLingualExamples && isForeign && targetLang === '中文'
  const prompt = useTriLingual ? IMAGE_TRANSLATE_TRILINGUAL_PROMPT : IMAGE_TRANSLATE_FAST_PROMPT
  return callImageTranslateAPI(imageBase64, sourceLang, targetLang, prompt, signal)
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

export async function generatePrepImagery(
  phrase: string,
  prepositions: string[],
  signal?: AbortSignal
): Promise<PrepSpatialData> {
  const config = getConfig()
  const isMono = getIsMono(phrase, config)

  const coreIdeaPlaceholder = isMono
    ? 'Increase · Completion · Creation'
    : '增加 · 完成 · 创造'
  const phraseExplanationPlaceholder = isMono
    ? "2-3 sentences in English explaining how the preposition's imagery applies to this phrase"
    : '2-3句中文，说明该介词的空间意象具体如何塑造了此短语的含义'
  const smartAssocPlaceholder = isMono
    ? '1-sentence quick visual summary in English (can use emoji or → notation)'
    : '1句中文趣味联想/记忆线索 (可使用 emoji 或 → 符号)'

  const languageRule = isMono
    ? 'All explanation text (coreIdea, phraseExplanation, smartAssoc) MUST be in English only. No Chinese characters.'
    : 'All explanation text (coreIdea, phraseExplanation, smartAssoc) MUST be in clear, learner-friendly Chinese.'

  const userPrompt = `Phrase: "${phrase}"\nPrepositions to explain: ${prepositions.join(', ')}\n\nReturn the JSON.`
  
  const systemPrompt = `You are an expert in English preposition spatial imagery and phrasal verb analysis.

REFERENCE — Core spatial imagery for common prepositions:
UP: Increase · Completion · Improvement · Creation (something moving upward, becoming more complete)
OUT: Reveal · Remove · Exhaust · Distribute (moving from inside to outside)
OFF: Separation · Removal · Disconnection (taking something away or losing connection)
ON: Connection · Continuation · Activation (attaching or keeping something running)
OVER: Transfer · Review · Repetition · Completion (crossing from one side to another)
IN: Entering · Inclusion · Participation (entering a space or group)
INTO: Transformation · Entry (entering and changing state)
DOWN: Reduction · Recording · Stabilisation (moving lower, settling, writing something permanent)
BACK: Return · Response (going back to a previous state or replying)
THROUGH: Completion Through Difficulty (persisting to the end of a challenge)
AWAY: Distance · Continuous Action (moving or continuing action at a distance)
AROUND: Movement Without Direct Progress · Flexibility (circling, exploring, not committed to one direction)
FOR: Purpose · Seeking (directed toward a goal)

NOTE: For any preposition NOT in this list, apply your own spatial reasoning based on native-speaker intuition.

For the given phrase and its prepositions, explain:
1. The core spatial/conceptual image of each preposition
2. How that image specifically shapes the meaning of this phrase
3. A concise smart association

Return ONLY valid JSON. No markdown, no extra text.

Schema:
{
  "items": [
    {
      "preposition": "UP",
      "coreIdea": "${coreIdeaPlaceholder}",
      "phraseExplanation": "${phraseExplanationPlaceholder}",
      "smartAssoc": "${smartAssocPlaceholder}"
    }
  ]
}

Rules:
- items must contain ONE entry PER preposition in the input list, in the same order
- phraseExplanation must reference the specific phrase, not just the preposition in isolation
- smartAssoc should be a memorable one-liner
- ${languageRule}
- Return ONLY the JSON object.`

  const cleaned = await callApi(systemPrompt, userPrompt, signal)
  try {
    return JSON.parse(cleaned) as PrepSpatialData
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as PrepSpatialData
      } catch { /* fall through */ }
    }
  }
  throw new Error('AI returned invalid JSON for preposition spatial imagery')
}

export async function regenerateSinglePrepItem(
  phrase: string,
  preposition: string,
  currentContent?: string,
  signal?: AbortSignal
): Promise<PrepSpatialItem> {
  const config = getConfig()
  const isMono = getIsMono(phrase, config)

  const coreIdeaPlaceholder = isMono
    ? 'Increase · Completion · Creation'
    : '增加 · 完成 · 创造'
  const phraseExplanationPlaceholder = isMono
    ? "2-3 sentences in English explaining how this preposition's imagery applies to this specific phrase"
    : '2-3句中文，说明该介词的空间意象具体如何塑造了此短语的含义'
  const smartAssocPlaceholder = isMono
    ? '1-sentence quick visual summary in English (can use emoji or → notation)'
    : '1句中文趣味联想/记忆线索 (可使用 emoji 或 → 符号)'

  const languageRule = isMono
    ? 'All explanation text (coreIdea, phraseExplanation, smartAssoc) MUST be in English only. No Chinese characters.'
    : 'All explanation text (coreIdea, phraseExplanation, smartAssoc) MUST be in clear, learner-friendly Chinese.'

  const currentPrompt = currentContent ? `Current explanation content to change: "${currentContent}"` : ''
  const userPrompt = `Phrase: "${phrase}"\nPreposition to explain: ${preposition}\n${currentPrompt}\n\nReturn the JSON.`

  const systemPrompt = `You are an expert in English preposition spatial imagery and phrasal verb analysis.

Your goal is to generate or refine a single preposition's spatial explanation for a given phrase.

REFERENCE — Core spatial imagery for common prepositions:
UP: Increase · Completion · Improvement · Creation (something moving upward, becoming more complete)
OUT: Reveal · Remove · Exhaust · Distribute (moving from inside to outside)
OFF: Separation · Removal · Disconnection (taking something away or losing connection)
ON: Connection · Continuation · Activation (attaching or keeping something running)
OVER: Transfer · Review · Repetition · Completion (crossing from one side to another)
IN: Entering · Inclusion · Participation (entering a space or group)
INTO: Transformation · Entry (entering and changing state)
DOWN: Reduction · Recording · Stabilisation (moving lower, settling, writing something permanent)
BACK: Return · Response (going back to a previous state or replying)
THROUGH: Completion Through Difficulty (persisting to the end of a challenge)
AWAY: Distance · Continuous Action (moving or continuing action at a distance)
AROUND: Movement Without Direct Progress · Flexibility (circling, exploring, not committed to one direction)
FOR: Purpose · Seeking (directed toward a goal)

NOTE: For any preposition NOT in this list, apply your own spatial reasoning based on native-speaker intuition.

If "Current explanation content to change" is provided, you MUST generate a completely different explanation and association. Do not repeat or slightly rephrase the current one.

Return ONLY valid JSON. No markdown, no extra text.

Schema:
{
  "preposition": "${preposition}",
  "coreIdea": "${coreIdeaPlaceholder}",
  "phraseExplanation": "${phraseExplanationPlaceholder}",
  "smartAssoc": "${smartAssocPlaceholder}"
}

Rules:
- phraseExplanation must reference the specific phrase, not just the preposition in isolation
- smartAssoc should be a memorable one-liner
- ${languageRule}
- Return ONLY the JSON object.`

  const cleaned = await callApi(systemPrompt, userPrompt, signal)
  try {
    return JSON.parse(cleaned) as PrepSpatialItem
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as PrepSpatialItem
      } catch { /* fall through */ }
    }
  }
  throw new Error('AI returned invalid JSON for single preposition item')
}
