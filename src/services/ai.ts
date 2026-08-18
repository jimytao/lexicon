import { detectLanguage, detectQueryType } from '../stores/searchStore'
import {
  normalizeCoreModules,
  normalizeCorePhraseModules,
  normalizeModules,
  seedCorePhraseModulesFromCore,
  type AppModule,
} from '../stores/settingsStore'
import { combineSignals } from '../utils/abortSignal'
import { remapFetchAbortError } from '../utils/aiRequestErrors'
import { buildPhrasePrompt, type PhrasePromptQueryType } from './aiPhrasePrompt'
import { buildCombinedWordPrompt, buildCombinedPhrasePrompt } from './aiCombinedPrompt'
import { splitCombinedJson, splitCombinedPhraseJson } from '../utils/combinedResult'
import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, MeaningExercise, EvaluationResult, ChatMessage, PrepSpatialData, PrepSpatialItem, CombinedAiResult, CombinedPhraseResult } from '../types'

/** 仅当模组出现在当前模式列表且 enabled 时才请求；不在列表 = 关闭（Lookup/Core 分轨依赖此语义） */
function moduleEnabled(modules: ModuleFlag[], id: string): boolean {
  return modules.some((m) => m.id === id && m.enabled)
}

type ModuleFlag = { id: string; enabled: boolean }

interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
  modules: ModuleFlag[]
  coreModules: ModuleFlag[]
  corePhraseModules: ModuleFlag[]
  webSearchEnabled: boolean
  tavilyApiKey: string
  triLingualExamples: boolean
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
}

const DEFAULT_LOOKUP_MODULES: ModuleFlag[] = [
  { id: 'dictionary', enabled: true },
  { id: 'coreConcept', enabled: true },
  { id: 'etymology', enabled: true },
  { id: 'mnemonic', enabled: true },
  { id: 'examples', enabled: true },
  { id: 'related', enabled: true },
  { id: 'preposition', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const DEFAULT_CORE_MODULE_FLAGS: ModuleFlag[] = [
  { id: 'coreConcept', enabled: true },
  { id: 'wordGraph', enabled: true },
  { id: 'chunks', enabled: true },
  { id: 'collocations', enabled: true },
  { id: 'synonyms', enabled: true },
  { id: 'usageScenes', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

const DEFAULT_CORE_PHRASE_MODULE_FLAGS: ModuleFlag[] = [
  { id: 'usageScenes', enabled: true },
  { id: 'culture', enabled: true },
  { id: 'practice', enabled: true },
  { id: 'chat', enabled: true },
]

function getConfig(): AiConfig {
  try {
    const stored = JSON.parse(localStorage.getItem('lexicon-settings') ?? '{}') as {
      state?: {
        aiProvider?: string
        aiEndpoint?: string
        aiModel?: string
        aiApiKeys?: Record<string, string>
        aiModels?: Record<string, string>
        modules?: ModuleFlag[]
        coreModules?: ModuleFlag[]
        corePhraseModules?: ModuleFlag[]
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
    // 与 settingsStore persist merge 对齐：旧 persist 要拆 chunks、剔 Core dictionary
    const modules = normalizeModules(
      (s.modules?.length ? s.modules : DEFAULT_LOOKUP_MODULES) as AppModule[]
    )
    const coreModules = normalizeCoreModules(
      (s.coreModules?.length ? s.coreModules : DEFAULT_CORE_MODULE_FLAGS) as AppModule[]
    )
    const corePhraseModules = s.corePhraseModules?.length
      ? normalizeCorePhraseModules(s.corePhraseModules as AppModule[])
      : seedCorePhraseModulesFromCore(coreModules)
    return {
      endpoint: s.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || '',
      model: s.aiModels?.[providerId] || s.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
      apiKey: s.aiApiKeys?.[providerId] || import.meta.env.VITE_AI_API_KEY || '',
      modules,
      coreModules,
      corePhraseModules,
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
      modules: normalizeModules(DEFAULT_LOOKUP_MODULES as AppModule[]),
      coreModules: normalizeCoreModules(DEFAULT_CORE_MODULE_FLAGS as AppModule[]),
      corePhraseModules: normalizeCorePhraseModules(DEFAULT_CORE_PHRASE_MODULE_FLAGS as AppModule[]),
      webSearchEnabled: false,
      tavilyApiKey: '',
      triLingualExamples: false,
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
    }
  }
}

/** Core 单词全量读 coreModules；Lookup 读 modules */
function modulesForCognitive(config: AiConfig, cognitive: 'lookup' | 'core'): ModuleFlag[] {
  return cognitive === 'core' ? config.coreModules : config.modules
}

/** Core 词组/句子读 corePhraseModules；Lookup 读 modules */
function modulesForPhraseCognitive(config: AiConfig, cognitive: 'lookup' | 'core'): ModuleFlag[] {
  return cognitive === 'core' ? config.corePhraseModules : config.modules
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
  const isEnabled = (id: string) => moduleEnabled(modules, id)

  const includeSemantic = isEnabled('dictionary')
  const includeExampleSchema = includeExamples && isEnabled('examples')

  const meaningsZhDescription = monolingualWord 
    ? "English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'"
    : "（情景前缀）中文释义"
  const sceneLabel = monolingualWord ? "2-4 word English context tag" : "2-4字的情景标签"
  const sceneDesc = monolingualWord
    ? "2-4 sentences from a native speaker's perspective: what this meaning concretely IS or evokes (a physical thing, place, moment — paint a picture), when/where it naturally appears in real life, and what it feels like or sounds like in context. NOT a grammar note. NOT just 'used when X'."
    : "2-4句中文，以母语者视角写：这个义项具体指的是什么东西或什么场景（画面感，而非字典解释），母语者在什么具体时刻/地点会用到它，以及使用这个词时带着什么感受或氛围。禁止写成纯功能性描述（如'用于表示……的情况'）。"
  const partMeaning = monolingualWord ? "meaning in English" : "中文含义（来源语言）"
  const anchorNote = monolingualWord 
    ? "1 sentence in English: how this anchor word embodies the root meaning, helping association"
    : "1句话中文：此锚点词如何体现词根含义，帮助联想记忆"
  const storyDesc = monolingualWord ? "in English" : "1-2句话，说明字面意义如何演变成现在的含义"
  const derivedMeaning = monolingualWord ? "meaning in English" : "中文含义"
  const synonymDistinction = monolingualWord ? "English nuance explanation" : "1句话，说明与主词的情感色彩、使用场景或强度差异"
  const antonymDistinction = monolingualWord ? "English nuance explanation" : "1句话，说明与主词的对比含义、使用场景或词义强弱差异"

  let schema = `{\n  "meanings": [\n    {\n      "zh": "${meaningsZhDescription}",\n      "pos": "该义项对应的词性 (noun/verb/adj/adv/phrase)"${includeSemantic ? `,\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "一个用于搜图的具体英文名词或名词短语描述（3-6个英文单词，如 'person running business in office'）"` : ''}\n    }\n  ]`

  if (isEnabled('coreConcept')) {
    schema += `,\n  "coreConcept": {\n    "image": "${monolingualWord ? '1 short sentence: vivid core image for memory' : '1句画面感核心意象（记忆锚点）'}",\n    "explanation": "${monolingualWord ? '1 short sentence unifying main senses for memory' : '1句统领主要义项，帮助记住（轻量）'}"\n  }`
  }
  
  if (isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "词根或词缀（对应原词中的实际字母片段）",\n        "meaning": "${partMeaning}",\n        "sourceForm": "（仅词根）原始拉丁/希腊语形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词，e.g. select",\n        "anchorNote": "（仅词根）${anchorNote}"\n      }\n    ],\n    "story": "${storyDesc}",\n    "derivedWords": [\n      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "${derivedMeaning}" }\n    ]\n  }`
  }
  
  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [\n    {\n      "word": "近义词",\n      "distinction": "${synonymDistinction}"\n    }\n  ],\n  "antonyms": [\n    {\n      "word": "反义词",\n      "distinction": "${antonymDistinction}"\n    }\n  ]`
  }

  const wantChunks = isEnabled('chunks')
  const wantCollocations = isEnabled('collocations')
  if (wantChunks || wantCollocations) {
    const collocationsNote = monolingualWord
      ? "REQUIRED: clear English meaning of this phrase (what it means), not just 'common phrase'"
      : "必填：用中文清楚解释这个词组是什么意思（释义），禁止只写「常用」或空话"
    const chunksPart = wantChunks
      ? `"chunks": [\n      { "chunk": "Common PREPOSITIONAL phrase (prep+N, V+prep(+N), phrasal with prep)", "note": "${collocationsNote}" }\n    ]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [\n      { "chunk": "Other common phrase WITHOUT prep focus (adj+N, V+N, N+V)", "note": "${collocationsNote}" }\n    ]`
      : `"collocations": []`
    schema += `,\n  "collocations": {\n    ${chunksPart},\n    ${colloPart}\n  }`
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
${includeSemantic ? (monolingualWord
    ? `- scene is REQUIRED for EVERY meaning — never omit it. scene.description must be a vivid native-speaker mini-picture (2-4 sentences): what the thing/moment IS, where it lives, what it feels like. NOT a grammar usage note. NOT "used when X".`
    : `- scene是每个义项的必填字段，一个都不能省略。scene.description必须是有画面感的母语者视角（2-4句）：这个东西/场景是什么、在哪里出现、带着什么感受。禁止写成功能性用法说明（如"用于……时"）。`) : ''}
${isEnabled('etymology') ? `- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)
- For each ROOT morpheme: fill sourceForm (original Latin/Greek root form, e.g. "legere"), anchor (a common word the learner likely knows sharing this root, e.g. "select" for -lect-), anchorNote (1 ${monolingualWord ? 'English' : 'Chinese'} sentence: how the anchor word embodies the root meaning)
- For pure prefixes/suffixes (e.g. in-, -tion, -ual): omit sourceForm, anchor, anchorNote
- etymology.story: 1-2 sentences max
- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)` : ''}
${isEnabled('synonyms') ? `- synonyms: provide 3-5 words, ordered from closest to most distant in meaning
- synonyms distinction: 1 sentence each
- antonyms: provide 3-5 words, ordered from most direct contrast to weaker contrast
- antonyms distinction: 1 sentence each` : ''}
${wantChunks ? `- collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases only (prep+N, V+prep(+N)). Explain the preposition's role in the note.` : ''}
${wantCollocations ? `- collocations.collocations: 4-6 OTHER common phrases (adj+N, V+N, etc). Do NOT put prepositional phrases here.` : ''}
${(wantChunks || wantCollocations) ? `- CRITICAL — note: EVERY item MUST include a clear meaning in ${monolingualWord ? 'English' : 'Chinese'}. Never use "N/A", "常用", or empty notes.` : ''}
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
  const { signal: merged, dispose } = combineSignals(signal, 60_000)

  try {
    const response = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      signal: merged,
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
  } catch (e) {
    throw remapFetchAbortError(e, merged.reason)
  } finally {
    dispose()
  }
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
  const { signal: merged, dispose } = combineSignals(signal, 60_000)

  try {
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
  } catch (e) {
    throw remapFetchAbortError(e, merged.reason)
  } finally {
    dispose()
  }
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
  if (!config.webSearchEnabled || !config.tavilyApiKey) return null

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

const MEANING_EXERCISES_SYSTEM_PROMPT = `You are a language exercise designer for English learners.

Given a target word/phrase and its dictionary meanings, generate practical example sentences for learning.

Return ONLY a valid JSON array. No markdown. No explanation.

[
  {
    "sentence": "A clear, natural example sentence in the target language containing the target word/phrase.",
    "targetMeaning": "The specific meaning/sense of the target word demonstrated in this sentence.",
    "hint": "Optional short context clue for the learner."
  }
]

Rules:
- The sentence MUST be natural and written in the target language (e.g. English).
- The sentence MUST contain the target word/phrase.
- Prioritize common and practical meanings.
- Never output anything outside the JSON array.`

export async function generateMeaningExercises(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  count: number,
  signal?: AbortSignal
): Promise<MeaningExercise[]> {
  const config = getConfig()
  const isMono = getIsMono(word, config)

  const meaningsText = meanings
    .map((m, i) => isMono ? `${i + 1}. EN: ${m.en}` : `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  const lang = detectLanguage(word)
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'the target language'

  const userPrompt = `Language: ${langName}\nTarget Word/Phrase: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practical example sentences containing '${word}', each demonstrating one of its common meanings in context.`
  const cleaned = await callApi(MEANING_EXERCISES_SYSTEM_PROMPT, userPrompt, signal)

  try {
    return JSON.parse(cleaned) as MeaningExercise[]
  } catch { /* fall through */ }

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as MeaningExercise[]
    } catch { /* fall through */ }
  }

  console.error('generateMeaningExercises raw response:', cleaned)
  throw new Error(`AI returned invalid JSON for meaning exercises`)
}

/** Lookup：核对学习者对词义在例句中的理解（中/英均可），不要求造句 */
export async function evaluateMeaningCheck(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  userGuess: string,
  sentenceContext?: string,
  targetMeaning?: string,
  signal?: AbortSignal
): Promise<{ correct: boolean; feedback: string }> {
  const config = getConfig()
  const isMono = getIsMono(word, config)
  const meaningLines = meanings
    .map((m, i) => `${i + 1}. ${m.zh || ''}${m.en ? ` / ${m.en}` : ''}`.trim())
    .filter(Boolean)
    .join('\n')

  const system = isMono
    ? `You check whether a learner correctly understands the meaning of a word/phrase in a specific example sentence context. Return ONLY JSON: {"correct":true|false,"feedback":"..."}.
If roughly right (core sense in context captured), correct=true and feedback a short confirmation (e.g. "Correct.").
If wrong or incomplete, correct=false and feedback briefly corrects in simple English — do NOT require a full sentence from the learner.`
    : `你核对学习者是否理解了词/词组在特定例句中的含义。只返回 JSON：{"correct":true|false,"feedback":"..."}。
抓住例句中该词的核心意思 → correct=true，feedback 简短确认（如「回答正确！此句中表示...」）。
偏差大或偏离义项 → correct=false，feedback 用中文简短解析该句中的实际释义与用词习惯。不要要求学习者造完整句。`

  const contextPart = sentenceContext ? `Example Sentence: "${sentenceContext}"\nTarget Meaning: ${targetMeaning || 'unspecified'}\n` : ''
  const userPrompt = `Word/phrase: ${word}\n${contextPart}Reference meanings:\n${meaningLines || '(none)'}\nLearner's guess (zh or en OK): "${userGuess}"\n\nEvaluate understanding in context.`
  const cleaned = await callApi(system, userPrompt, signal)

  try {
    return JSON.parse(cleaned) as { correct: boolean; feedback: string }
  } catch { /* fall through */ }
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as { correct: boolean; feedback: string }
    } catch { /* fall through */ }
  }
  throw new Error('AI returned invalid JSON for meaning check')
}


// ── AI 全量查词（词库无结果时） ──

function getFullLookupPrompt(
  modules: Array<{ id: string; enabled: boolean }>,
  lang: string = 'en',
  webSearchResults?: string,
  isFull: boolean = true,
  triLingual: boolean = false,
  monolingualWord: boolean = false,
  cognitive: 'lookup' | 'core' = 'lookup'
): string {
  const isEnabled = (id: string) => moduleEnabled(modules, id)
  const isMono = monolingualWord && lang === 'en'
  const isCore = cognitive === 'core'

  const meaningsZhDescription = isMono ? "English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'" : "中文释义"
  const meaningsEnDescription = "English definition (or original language equivalent)"
  const sceneLabel = isMono ? "2-4 word English context tag" : "2-4字情景标签"
  const sceneDesc = isMono
    ? "2-4 sentences from a native speaker's perspective: what this meaning concretely IS or evokes (a physical thing, place, moment — paint a picture), when/where it naturally appears in real life, and what it feels like or sounds like in context. NOT a grammar note. NOT just 'used when X'."
    : "2-4句中文，以母语者视角写：这个义项具体指的是什么东西或什么场景（画面感，而非字典解释），母语者在什么具体时刻/地点会用到它，以及使用这个词时带着什么感受或氛围。禁止写成纯功能性描述（如'用于表示……的情况'）。"
  const partMeaning = isMono ? "meaning in English" : "含义"
  const anchorNote = isMono ? "1 sentence in English: how this anchor word embodies the root meaning, helping association" : "1句话中文：此词如何体现词根，帮助联想"
  const storyDesc = isMono ? "in English" : `1-2句话说明${lang !== 'en' && lang !== 'zh' ? '词汇构成/来源' : '词根词缀/来源'}`
  const derivedMeaning = isMono ? "meaning in English" : "含义"
  const synonymDistinction = isMono ? "English nuance explanation" : "与主词的差异"
  const antonymDistinction = isMono ? "English nuance explanation" : "与主词的对比差异"

  // Lookup: meanings + light coreConcept. Core: thick usage image + feel/emotion anchors; no dictionary wall.
  let schema = `{\n  "correctForm": "the correct spelling of this word (fix typos if any)",\n  "phonetic": "phonetic transcription (IPA for English, Kana/Romaji for Japanese, etc.)",\n  "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)"`

  const wantCoreConcept = isEnabled('coreConcept') || isEnabled('dictionary') || isCore
  if (wantCoreConcept) {
    if (isCore) {
      const feelDesc = isMono
        ? '1 short line: sensory feel / atmosphere only (NOT a full scene; do not repeat explanation)'
        : '1句短感觉锚：氛围/体感即可，禁止写成长场景，勿重复 explanation'
      const emotionDesc = isMono
        ? '1 short line: emotional tone when natives use this word'
        : '1句情绪底色：母语者用此词时的情感态度'
      schema += `,\n  "coreConcept": {\n    "gloss": "${isMono ? "Short lexical gloss: English equivalents + sense nucleus (NOT a scene essay)" : '短词典对译：中文等价词 + 一句义核（禁止情景散文）'}",\n    "image": "${isMono ? '1-2 sentences: core physical/metaphorical image' : '1-2句核心意象'}",\n    "explanation": "${isMono ? '2-4 sentences: how this image guides REAL USAGE branches — when/why natives extend it this way (richer than a memory tip)' : '2-4句：意象如何导向真实用法分支——母语者何时/为何这样延伸（比记忆锚点更细，偏「怎么用」）'}",\n    "feelAnchor": "${feelDesc}",\n    "emotionalTone": "${emotionDesc}"\n  }`
    } else {
      schema += `,\n  "coreConcept": {\n    "image": "${isMono ? '1 short sentence: vivid core image for memory' : '1句画面感核心意象（记忆锚点）'}",\n    "explanation": "${isMono ? '1 short sentence unifying the main senses for memory' : '1句统领主要义项，帮助记住（轻量）'}"\n  }`
    }
  }

  // Lookup: full meanings. Core EN: no wall. Core ZH reverse lookup: short English candidates.
  if (!isCore) {
    schema += `,\n  "meanings": [\n    {\n      "zh": "${meaningsZhDescription}",\n      "en": "${meaningsEnDescription}",\n      "pos": "specific part of speech",\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "一个用于搜图的具体英文名词描述（3-6个英文单词，如 'person running business in office'）"\n    }\n  ]`
  } else if (lang === 'zh') {
    schema += `,\n  "meanings": [\n    {\n      "zh": "该英文候选与中文输入的细微差别（中文，1句）",\n      "en": "English candidate word/phrase",\n      "pos": "part of speech"\n    }\n  ]`
  } else {
    schema += `,\n  "meanings": []`
  }

  // For foreign languages, etymology is less about roots/affixes and more about composition or origin
  if (isFull && isEnabled('etymology') && !isCore) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "构词成分（对应原词实际字母片段）",\n        "meaning": "${partMeaning}",\n        "sourceForm": "（仅词根）原始词根形式，e.g. legere",\n        "anchor": "（仅词根）含此词根的简单常见词",\n        "anchorNote": "（仅词根）${anchorNote}"\n      }\n    ],\n    "story": "${storyDesc}",\n    "derivedWords": [{ "word": "相关词", "pos": "词性", "meaning": "${derivedMeaning}" }]\n  }`
  }
  if (isFull && isEnabled('synonyms')) {
    const whenToUseDesc = isMono
      ? (isCore
        ? '1 sentence: mental fit — when natives pick THIS near-synonym AND when the HEADWORD fits better'
        : '1 sentence in English: when and why native speakers choose this specific word')
      : (isCore
        ? '1句适用心智：何时用该近义词，以及何时仍应选主词'
        : '1句中文：母语者在何时及为何使用该词 (如: slim -> 表示夸奖优雅的瘦)')
    schema += `,\n  "synonyms": [{ "word": "近义词", "distinction": "${synonymDistinction}", "tone": "one of: positive | negative | neutral | informal", "whenToUse": "${whenToUseDesc}" }],\n  "antonyms": [{ "word": "反义词", "distinction": "${antonymDistinction}" }]`
  }

  const wantChunks = isFull && isEnabled('chunks')
  const wantCollocations = isFull && isEnabled('collocations')
  if (wantChunks || wantCollocations) {
    const collocationsNote = isMono
      ? "REQUIRED: clear English meaning for learners"
      : "必填：中文释义，让学习者不看原文也能懂"
    const spatialDesc = isMono
      ? "For prep phrases: briefly explain the preposition's spatial/logical role; omit if none"
      : "介词语组必填倾向：点明介词在搭配里的空间/逻辑角色；没有则省略字段，勿填 N/A"
    const chunksPart = wantChunks
      ? `"chunks": [\n      { "chunk": "COMMON PREPOSITIONAL phrase only (prep+N, V+prep(+N))", "note": "${collocationsNote}", "spatialExtension": "${spatialDesc}" }\n    ]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [\n      { "chunk": "OTHER common phrase WITHOUT prep focus (adj+N, V+N, N+V)", "note": "${collocationsNote}" }\n    ]`
      : `"collocations": []`
    schema += `,\n  "collocations": {\n    ${chunksPart},\n    ${colloPart}\n  }`
  }

  if (isEnabled('examples') && !isCore) {
    const isForeign = lang !== 'en' && lang !== 'zh'
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "中文翻译" }\n  ]`
    } else {
      const exampleZh = isMono ? "English meaning / explanation" : "中文翻译"
      schema += `,\n  "examples": [\n    { "en": "Example sentence in original language (or target language)", "zh": "${exampleZh}" }\n  ]`
    }
  }

  if (isFull && isEnabled('usageScenes') && isCore) {
    const usLabel = isMono ? '2-4 word English scene tag' : '2-4字场景标签'
    const usDesc = isMono
      ? '1-2 sentences: when natives use this word, communicative job, typical sentence pattern'
      : '1-2句：母语者何时用、完成什么交际任务、典型句式（不是翻译例句墙）'
    schema += `,\n  "usageScenes": [\n    { "label": "${usLabel}", "description": "${usDesc}" }\n  ]`
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

  if (isCore && isEnabled('wordGraph')) {
    const exMeaning = isMono
      ? "REQUIRED: clear English meaning of this phrase"
      : "必填：这个短语/短句的中文释义"
    const exMind = isMono
      ? "REQUIRED: how a native speaker's mental image / why this usage grows from the root core"
      : "必填：母语者心智/意象——为何从根意象延伸出这个用法（1句）"
    schema += `,\n  "conceptGraph": {\n    "rootCore": "${isMono ? '1-3 word core concept label' : '1-3字核心归纳'}",\n    "branches": [\n      {\n        "category": "${isMono ? 'Domain category (e.g. Physical Motion, Machines, Business)' : '延伸领域分类 (如: 物理运动, 机器运转, 经营管理)'}",\n        "explanation": "${isMono ? '1 sentence explaining why this branch derives from the root core' : '1句话解释该分支领域为何会从 Core 衍生出来'}",\n        "examples": [\n          {\n            "phrase": "${isMono ? 'typical phrase or short expression' : '典型表达/短语'}",\n            "meaning": "${exMeaning}",\n            "mindHint": "${exMind}"\n          }\n        ]\n      }\n    ]\n  }`
  }

  schema += `\n}`

  const basePrompt = isCore
    ? (isMono
      ? `You are a native-speaker cognitive coach for English learners. Your job is NOT dictionary lookup — remodel how learners THINK about a word so they can use it the way natives do (mental picture, emotional stance, when/why to choose it, core image network).`
      : `你是面向中文母语者的「母语者心智教练」。任务不是传统词典释义，而是帮助学习者用母语者心智理解单词：脑中画面、情感立场、为何选用，以及核心意象如何延伸到使用网络。`)
    : (isMono
      ? `You are a professional English vocabulary analyst for learners who prefer English-only monolingual explanations. Focus on clear meanings, memory aids (core image, etymology, nuance), and practical understanding.`
      : `你是面向中文母语者的英语词汇分析师。重心是「理解与记忆」：清晰释义、核心意象、词源与近义辨析，帮助记住并理解这个词。`)
  const multiLangPrompt = isCore
    ? `You are a cultural-cognitive coach for foreign words. Prioritize how natives conceptualize the word — social meaning, subculture nuance, and when it is the right choice.`
    : `You are a professional multi-language translator and cultural analyst. Your core mission is NOT just translation, but "Cultural Interpretation" — explaining the social, historical, and subculture context behind foreign words.`

  let prompt = `${lang === 'en' || lang === 'zh' ? basePrompt : multiLangPrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} word, provide a complete analysis${isCore ? ' with native-mind priority' : ' for understanding and memory'}.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
${isCore ? `- Do NOT fill a full dictionary meanings wall for English input (meanings may be []).
- Do NOT invent nativeMindModel (legacy). Put feel into coreConcept.feelAnchor and emotion into coreConcept.emotionalTone.
- coreConcept.gloss: REQUIRED short lexical gloss (equivalents + sense nucleus) before imagery.
- coreConcept.explanation: RICH usage-oriented (how the image guides when/how to use the word). feelAnchor must NOT repeat the same scene prose.
- Do NOT dump concrete scenes into coreConcept.explanation — concrete when/where communicative scenes belong in usageScenes; explanation stays at image→usage-branch level.
- Do NOT invent wordChoiceContrast — fold why-choose-headword into synonyms[].whenToUse (mental fit).
${isEnabled('wordGraph') ? '- conceptGraph: REQUIRED. Examples MUST be { phrase, meaning, mindHint }; never bare strings or N/A. mindHint = how this phrase grows from rootCore only (not whole-word emotion).' : ''}
- PRIORITY for Pure Core: coreConcept > conceptGraph > prep chunks > other collocations > synonyms > usageScenes > culture.` : `- meanings: most common practical senses (typically 2-8, by frequency) — dictionary-style glosses, not scene essays.
- coreConcept: LIGHT memory anchor (short image + short unifying line). Do NOT invent nativeMindModel, conceptGraph, or wordChoiceContrast.
- scene is REQUIRED for EVERY meaning in the meanings array — never omit it for any sense, even rare ones. scene.description must be a vivid native-speaker mini-picture (2-4 sentences): what the thing/moment/place concretely IS, where it lives in real life, what it feels like. NOT a grammar note. NOT just "used when X".${isMono ? '' : ' 禁止写成"用于……时"这类功能性描述。'}
- PRIORITY for Lookup: coreConcept > meanings/scenes > etymology > examples.`}
- For abbreviations, explain what each letter stands for.
- If the input is CHINESE: 
  - correctForm: provide the best English word.
  ${isCore ? '- meanings: REQUIRED short list of 2-5 English candidates (en=word, zh=nuance vs input). Not a full dictionary wall.' : '- meanings: provide 2-5 English alternatives with nuances.'}
- If the input is a FOREIGN LANGUAGE (not English/Chinese):
  - PRIORITY: Provide deep cultural/subculture context in "culturalLore". 
  - Explain the specific historical or social context behind the word.
  - For ACG (Anime/Comic/Games) or internet terms, specify the source and why it is popular.
${isFull && isEnabled('etymology') && !isCore ? `- etymology.parts: each segment must correspond to the actual letters in the target word
- For each ROOT morpheme: fill sourceForm (original Latin/Greek form), anchor (a common word the learner likely knows sharing this root), anchorNote (1 ${isMono ? 'English' : 'Chinese'} sentence connecting anchor → root meaning)
- For pure prefixes/suffixes: omit sourceForm, anchor, anchorNote` : ''}
${wantChunks ? (isCore
    ? `- collocations.chunks: For ordinary content words, 4-6 COMMON PREPOSITIONAL phrases ONLY. note MUST explain meaning AND the preposition's role. spatialExtension preferred for spatial/logic.`
    : `- collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases ONLY. note MUST explain meaning AND the preposition's role. spatialExtension preferred for spatial/logic.`) : ''}
${wantCollocations ? (isCore
    ? `- collocations.collocations: For ordinary content words, 4-6 OTHER common phrases (no prep focus). Do NOT put prep phrases here.`
    : `- collocations.collocations: 4-6 OTHER common phrases (no prep focus). Do NOT put prep phrases here.`) : ''}
${(wantChunks || wantCollocations) ? `- CRITICAL — note: EVERY non-empty item needs clear meaning in ${isMono ? 'English' : 'Chinese'}. Never "N/A" / "常用" / empty notes on real items.` : ''}
${isCore && (wantChunks || wantCollocations) ? `- SKIP collocations when redundant with conceptGraph (Pure Core rule C): If the headword is a discourse particle / tag-question remnant / sentence-final tag / interjection (e.g. innit, eh) and the only natural "phrases" would be sentence frames that merely repeat conceptGraph examples (It's …, innit? / …, innit!), return "chunks": [] and "collocations": []. Do NOT invent filler frames. Ordinary content words (nouns/verbs/adjectives like shrug, sheen) MUST still fill collocations normally.` : ''}
${isFull && isEnabled('usageScenes') && isCore ? `- usageScenes: 3-5 native usage scenes / communicative jobs / typical patterns — not a translation example wall.` : ''}
${isFull && isEnabled('synonyms') ? `- synonyms: 3-5 with tone + whenToUse; antonyms: 3-5.` : ''}
${!isCore && isEnabled('examples') ? `- examples: 3-5 learner-friendly sentences.` : ''}
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
  signal?: AbortSignal,
  cognitive: 'lookup' | 'core' = 'lookup'
): Promise<AiFullResult> {
  const config = getConfig()
  const lang = detectLanguage(word)
  
  // Perform web search if enabled
  const webResults = await performWebSearch(word, signal)
  
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const activeModules = modulesForCognitive(config, cognitive)
  const cleaned = await callApi(
    getFullLookupPrompt(activeModules, lang, webResults, isFull, config.triLingualExamples, config.monolingualWord, cognitive),
    `${langName}: ${word}\n\nAnalyze this word and return the JSON.`,
    signal
  )
  try {
    const parsed = JSON.parse(cleaned) as AiFullResult
    if (!parsed.meanings) parsed.meanings = []
    if (!parsed.examples) parsed.examples = []
    return parsed
  } catch { /* fall through */ }
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as AiFullResult
      if (!parsed.meanings) parsed.meanings = []
      if (!parsed.examples) parsed.examples = []
      return parsed
    } catch { /* fall through */ }
  }
  throw new Error(`AI returned invalid JSON for full lookup`)
}

/** Fill only missing collocation/chunk notes — does not regenerate already-good entries. */
export async function fillMissingCollocationNotes(
  word: string,
  items: Array<{ chunk: string; note?: string; spatialExtension?: string }>,
  signal?: AbortSignal
): Promise<Array<{ chunk: string; note: string; spatialExtension?: string }>> {
  const config = getConfig()
  const missing = items.filter((i) => !i.note?.trim() || i.note === 'N/A' || i.note === '常用')
  if (missing.length === 0) return []

  const isMono = config.monolingualWord
  const system = isMono
    ? `You fill missing meanings for English chunks/collocations. Return ONLY a JSON array. Each item: {"chunk":"...","note":"clear English meaning (REQUIRED)"}. NEVER use N/A. Do not invent new chunks — only explain the given list.`
    : `你为英语语块/搭配补全缺失释义。只返回 JSON 数组。每项：{"chunk":"...","note":"必填中文释义"}。禁止 N/A、「常用」。不要新增语块，只解释给定列表。`

  const cleaned = await callApi(
    system,
    `Word: ${word}\nChunks needing meaning:\n${JSON.stringify(missing.map((m) => m.chunk))}\n\nReturn the JSON array.`,
    signal
  )
  try {
    return JSON.parse(cleaned) as Array<{ chunk: string; note: string; spatialExtension?: string }>
  } catch { /* fall through */ }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]) as Array<{ chunk: string; note: string; spatialExtension?: string }>
    } catch { /* fall through */ }
  }
  throw new Error('AI returned invalid JSON for collocation note fill')
}

/** Fill only missing concept-graph example meaning/mindHint fields. */
export async function fillMissingConceptExamples(
  word: string,
  rootCore: string,
  examples: Array<{ phrase: string; meaning?: string; mindHint?: string }>,
  signal?: AbortSignal
): Promise<Array<{ phrase: string; meaning: string; mindHint: string }>> {
  const config = getConfig()
  const missing = examples.filter(
    (e) => !e.meaning?.trim() || e.meaning === 'N/A' || !e.mindHint?.trim() || e.mindHint === 'N/A'
  )
  if (missing.length === 0) return []

  const isMono = config.monolingualWord
  const system = isMono
    ? `You complete native-mind explanations for concept-tree phrases. Return ONLY JSON array of {"phrase","meaning","mindHint"}. meaning=what it means; mindHint=how a native links it to root core "${rootCore}". REQUIRED fields. No N/A.`
    : `你为概念树短语补全释义与母语心智。只返回 JSON 数组：{"phrase","meaning","mindHint"}。meaning=中文释义；mindHint=母语者如何从根意象「${rootCore}」延伸到此用法。字段必填。禁止 N/A。`

  const cleaned = await callApi(
    system,
    `Word: ${word}\nRoot core: ${rootCore}\nPhrases needing fill:\n${JSON.stringify(missing.map((m) => m.phrase))}\n\nReturn the JSON array.`,
    signal
  )
  try {
    return JSON.parse(cleaned) as Array<{ phrase: string; meaning: string; mindHint: string }>
  } catch { /* fall through */ }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]) as Array<{ phrase: string; meaning: string; mindHint: string }>
    } catch { /* fall through */ }
  }
  throw new Error('AI returned invalid JSON for concept example fill')
}

// ── AI 词组/句子查询 ──

export async function aiPhraseQuery(
  phrase: string,
  isFull: boolean = true,
  signal?: AbortSignal,
  cognitive: 'lookup' | 'core' = 'lookup'
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

  const phraseQueryType: PhrasePromptQueryType = qType === 'sentence' ? 'sentence' : 'phrase'
  const activeModules = modulesForPhraseCognitive(config, cognitive)
  const cleaned = await callApi(
    buildPhrasePrompt({
      modules: activeModules,
      lang,
      webSearchResults: webResults,
      isFull,
      triLingual: config.triLingualExamples,
      isMono,
      cognitive,
      queryType: phraseQueryType,
    }),
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

// ── Combined Lookup+Core (v0.9.0) ────────────────────────────────────────────

/**
 * Single AI call that returns both Lookup (understand) and Core (use it) data.
 * The two mode-tab views are populated from this one response.
 */
export async function aiCombinedLookup(
  word: string,
  isFull: boolean = true,
  signal?: AbortSignal
): Promise<CombinedAiResult> {
  const config = getConfig()
  const lang = detectLanguage(word)

  const webResults = await performWebSearch(word, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const prompt = buildCombinedWordPrompt({
    lookupModules: config.modules,
    coreModules: config.coreModules,
    lang,
    webSearchResults: webResults,
    isFull,
    triLingual: config.triLingualExamples,
    monolingualWord: config.monolingualWord,
  })

  const userMessage = lang === 'zh'
    ? `The user typed Chinese: “${word}”\n\nFind the best English equivalent and return the combined JSON.`
    : `${langName}: ${word}\n\nAnalyze and return the combined JSON.`

  const cleaned = await callApi(prompt, userMessage, signal)

  try {
    return splitCombinedJson(cleaned)
  } catch {
    // Fallback: try extracting from raw
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      return splitCombinedJson(objMatch[0])
    }
  }
  throw new Error('AI returned invalid JSON for combined lookup')
}

/**
 * Single AI call for phrase/sentence — returns both Lookup and Core phrase results.
 */
export async function aiCombinedPhraseQuery(
  phrase: string,
  isFull: boolean = true,
  signal?: AbortSignal
): Promise<CombinedPhraseResult> {
  const config = getConfig()
  const lang = detectLanguage(phrase)

  const webResults = await performWebSearch(phrase, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const qType = detectQueryType(phrase)
  const isMono = qType === 'sentence'
    ? config.monolingualSentence
    : config.monolingualPhrase

  const phraseQueryType = qType === 'sentence' ? 'sentence' : 'phrase'

  const prompt = buildCombinedPhrasePrompt({
    lookupModules: config.modules,
    coreModules: config.corePhraseModules,
    lang,
    webSearchResults: webResults,
    isFull,
    triLingual: config.triLingualExamples,
    isMono,
    queryType: phraseQueryType,
  })

  const userMessage = lang === 'zh'
    ? `The user typed Chinese: “${phrase}”\n\nProvide English translation + combined JSON.`
    : `${langName}: ${phrase}\n\nAnalyze and return the combined JSON.`

  const cleaned = await callApi(prompt, userMessage, signal)

  try {
    return splitCombinedPhraseJson(cleaned, phrase)
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objMatch) {
      return splitCombinedPhraseJson(objMatch[0], phrase)
    }
  }
  throw new Error('AI returned invalid JSON for combined phrase query')
}

