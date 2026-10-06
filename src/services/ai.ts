import { detectLanguage } from '../stores/searchStore'
import {
  normalizeCoreModules,
  normalizeCorePhraseModules,
  normalizeModules,
  resolveSearchApiKey,
  seedCorePhraseModulesFromCore,
  useSettingsStore,
  type AppModule,
  type SearchProviderId,
} from '../stores/settingsStore'
import {
  resolveDictionaryContext,
  resolveLearnerLanguagePolicy,
  resolveNativeLanguage,
  type MainDictionary,
} from './dictionaryContext'
import {
  buildInputDirectionRule,
  buildNativeLanguageContract,
  exampleGlossDesc,
  getNativeLanguage,
  type ExplanationLanguage,
  type NativeLanguageSpec,
} from './nativeLanguage'
import { combineSignals } from '../utils/abortSignal'
import { remapFetchAbortError } from '../utils/aiRequestErrors'
import { isExtension, isTauri } from './platform'
import { buildProfilePromptContext, resolveCurrentLearningRoute } from './profile'
import { buildPhrasePrompt, type PhrasePromptQueryType } from './aiPhrasePrompt'
import { buildCombinedWordPrompt, buildCombinedPhrasePrompt } from './aiCombinedPrompt'
import { buildCultureAwareInputRule, buildNativeSceneDescription, buildNativeSceneRules } from './aiPromptGuidance'
import { splitCombinedJson, splitCombinedPhraseJson } from '../utils/combinedResult'
import type { AiAnalysis, AiFullResult, PhraseResult, Exercise, MeaningExercise, EvaluationResult, ChatMessage, PrepSpatialData, PrepSpatialItem, CombinedAiResult, CombinedPhraseResult, LearningRoute } from '../types'

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
  searchProvider: SearchProviderId
  /** 已解析出的当前服务商 key（空串 = 未配置） */
  searchApiKey: string
  triLingualExamples: boolean
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
  mainDictionary: MainDictionary
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
    // Searches wait for settings hydration in App; reading the live store here
    // keeps a just-changed dictionary/language in sync with the DB router.
    const s = useSettingsStore.getState()
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
    const searchProvider: SearchProviderId = s.searchProvider === 'brave' ? 'brave' : 'tavily'
    return {
      endpoint: s.aiEndpoint || import.meta.env.VITE_AI_ENDPOINT || '',
      model: s.aiModels?.[providerId] || s.aiModel || import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
      apiKey: s.aiApiKeys?.[providerId] || import.meta.env.VITE_AI_API_KEY || '',
      modules,
      coreModules,
      corePhraseModules,
      // 严格布尔化：任何非 true 值都视为关闭
      webSearchEnabled: s.webSearchEnabled === true,
      searchProvider,
      searchApiKey: resolveSearchApiKey({
        searchProvider,
        searchApiKeys: s.searchApiKeys,
        tavilyApiKey: s.tavilyApiKey,
      }),
      triLingualExamples: s.triLingualExamples ?? false,
      monolingualWord: s.monolingualWord ?? false,
      monolingualPhrase: s.monolingualPhrase ?? false,
      monolingualSentence: s.monolingualSentence ?? false,
      mainDictionary: s.mainDictionary === 'en-vi' || s.mainDictionary === 'en-en'
        ? s.mainDictionary
        : 'en-zh',
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
      searchProvider: 'tavily',
      searchApiKey: '',
      triLingualExamples: false,
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
      mainDictionary: 'en-zh',
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

/**
 * The learner's native language for this query (monolingual switch > main dictionary).
 * Monolingual mode = "whatever I type, answer me in English", so it is NOT gated on the
 * input language. Every prompt below writes explanations in `spec.name`.
 */
function getLanguageSpec(query: string, config: AiConfig): NativeLanguageSpec {
  return resolveNativeLanguage(query, config)
}

/**
 * The stage-1 disambiguation contract. Its real job is not to enumerate senses
 * for their own sake — it is to pin down WHICH English word both halves of a
 * split request are explaining, so Lookup and Pure Core cannot diverge.
 */
export interface MeaningsAnchor {
  correctForm?: string
  pos?: string
  phonetic?: string
  senses: Array<{ pos?: string; zh: string; en?: string; senseIndex: number }>
}

function buildZhCoreConceptMapRule(spec: NativeLanguageSpec): string {
  return `\n- ZH-EN CONCEPT MAP MODE: The user typed Chinese and wants to feel how English carves up this concept. Do NOT silently pick one English word and explain only that one.
- coreConcept: describe how English splits this Chinese concept into distinct senses, and what separates them.
- synonyms: MUST list the 3-5 competing English candidates; each whenToUse states the exact situation a native reaches for it over the others.
- wordChoiceContrast: contrast the candidates head to head (feel, register, who says it, what it implies).
- meanings: the candidate English words, each with a ${spec.name} nuance note that separates it from its neighbours.`
}

/**
 * Render the stage-1 anchor into a prompt block. Lookup must reproduce the senses
 * verbatim; Core is word-level, so it only needs to agree on which word it is about.
 */
function buildAnchorBlock(anchor: MeaningsAnchor | undefined, isCore: boolean): string {
  if (!anchor) return ''
  const hasSenses = Array.isArray(anchor.senses) && anchor.senses.length > 0
  if (!anchor.correctForm && !hasSenses) return ''

  let block = '\n' + '\n' + 'RESOLVED TARGET (stage 1 — already decided, do not re-litigate):'
  if (anchor.correctForm) {
    block += '\n' + `- The word being explained is: "${anchor.correctForm}". Use it as correctForm verbatim.`
  }
  if (hasSenses) {
    const list = anchor.senses
      .map((m, i) => `[Sense ${m.senseIndex || i + 1}] ${m.pos ? `(${m.pos}) ` : ''}${m.zh}${m.en ? ` | ${m.en}` : ''}`)
      .join('\n')
    block += '\n' + (isCore
      ? `- These senses were fixed for the same query; stay consistent with them, but do NOT reproduce them as a dictionary wall — Pure Core is word-level.${'\n'}${list}`
      : `- Use EXACTLY these senses, in this order, for "meanings":${'\n'}${list}`)
  }
  return block
}

function getSystemPrompt(
  modules: Array<{ id: string; enabled: boolean }>,
  includeExamples: boolean = false,
  spec: NativeLanguageSpec = getNativeLanguage('zh'),
): string {
  const isEnabled = (id: string) => moduleEnabled(modules, id)
  const L = spec.name

  const includeSemantic = isEnabled('dictionary')
  const includeExampleSchema = includeExamples && isEnabled('examples')

  const meaningsZhDescription = `${L} meaning with a short context prefix, e.g. '(of a goal) a feeling of satisfaction' (written in ${L})`
  const sceneLabel = `short ${L} context tag (2-4 words)`
  const sceneDesc = buildNativeSceneDescription(spec)

  let schema = `{\n  "meanings": [\n    {\n      "senseIndex": 1,\n      "zh": "${meaningsZhDescription}",\n      "pos": "part of speech for this sense (noun/verb/adj/adv/phrase)"${includeSemantic ? `,\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "a concrete English noun phrase for image search (3-6 English words, e.g. 'person running business in office')"` : ''}\n    }\n  ]`

  if (isEnabled('coreConcept')) {
    schema += `,\n  "coreConcept": {\n    "image": "1 short sentence in ${L}: vivid core image for memory",\n    "explanation": "1 short sentence in ${L} unifying the main senses for memory (light)"\n  }`
  }

  if (isEnabled('etymology')) {
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "root or affix (the actual letter segment in the word)",\n        "meaning": "meaning in ${L}",\n        "sourceForm": "(roots only) original Latin/Greek form, e.g. legere",\n        "anchor": "(roots only) a simple common word sharing this root, e.g. select",\n        "anchorNote": "(roots only) 1 sentence in ${L}: how this anchor word embodies the root meaning, helping association"\n      }\n    ],\n    "story": "1-2 sentences in ${L}: how the literal sense evolved into today's meaning",\n    "derivedWords": [\n      { "word": "derived word", "pos": "n./v./adj./adv.", "meaning": "meaning in ${L}" }\n    ]\n  }`
  }

  if (isEnabled('synonyms')) {
    schema += `,\n  "synonyms": [\n    {\n      "word": "synonym",\n      "distinction": "1 sentence in ${L}: difference from the headword in emotional coloring, usage scene or intensity"\n    }\n  ],\n  "antonyms": [\n    {\n      "word": "antonym",\n      "distinction": "1 sentence in ${L}: contrast with the headword in meaning, usage scene or strength"\n    }\n  ]`
  }

  const wantChunks = isEnabled('chunks')
  const wantCollocations = isEnabled('collocations')
  if (wantChunks || wantCollocations) {
    const collocationsNote = `REQUIRED: clear ${L} meaning of this phrase (what it means), not just 'common phrase'`
    const chunksPart = wantChunks
      ? `"chunks": [\n      { "chunk": "Common PREPOSITIONAL phrase (prep+N, V+prep(+N), phrasal with prep)", "note": "${collocationsNote}" }\n    ]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [\n      { "chunk": "Other common phrase WITHOUT prep focus (adj+N, V+N, N+V)", "note": "${collocationsNote}" }\n    ]`
      : `"collocations": []`
    schema += `,\n  "collocations": {\n    ${chunksPart},\n    ${colloPart}\n  }`
  }

  if (includeExampleSchema) {
    schema += `,\n  "examples": [\n    { "en": "Example sentence using this word", "zh": "${exampleGlossDesc(spec)}" }\n  ]`
  }

  if (isEnabled('culture')) {
    schema += `,\n  "culturalLore": {\n    "title": "short ${L} tag (2-4 words, e.g. Gen-Z Slang, Legal Jargon)",\n    "content": "1-2 sentences in ${L}: the word's cultural origin, register (formal/informal/slang/technical), or notable usage shift",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
  }

  schema += `\n}`

  let prompt = `You are a professional English vocabulary analyst for ${spec.audience}.

Given an English word and its basic dictionary translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
- meanings array length must match the number of meanings provided in the user message
- MUST set senseIndex (1 for [Sense 1], 2 for [Sense 2], etc.). Output meanings matching the exact input sense order.
${includeSemantic ? `- scene is REQUIRED for EVERY meaning — never omit it.
${buildNativeSceneRules(spec)}` : ''}
${isEnabled('etymology') ? `- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)
- For each ROOT morpheme: fill sourceForm (original Latin/Greek root form, e.g. "legere"), anchor (a common word the learner likely knows sharing this root, e.g. "select" for -lect-), anchorNote (1 ${L} sentence: how the anchor word embodies the root meaning)
- For pure prefixes/suffixes (e.g. in-, -tion, -ual): omit sourceForm, anchor, anchorNote
- etymology.story: 1-2 sentences max
- etymology.derivedWords: list 3-6 words derived from this word (different POS forms, prefixed variants)` : ''}
${isEnabled('synonyms') ? `- synonyms: provide 3-5 words, ordered from closest to most distant in meaning
- synonyms distinction: 1 sentence each
- antonyms: provide 3-5 words, ordered from most direct contrast to weaker contrast
- antonyms distinction: 1 sentence each` : ''}
${wantChunks ? `- collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases only (prep+N, V+prep(+N)). Explain the preposition's role in the note.` : ''}
${wantCollocations ? `- collocations.collocations: 4-6 OTHER common phrases (adj+N, V+N, etc). Do NOT put prepositional phrases here.` : ''}
${(wantChunks || wantCollocations) ? `- CRITICAL — note: EVERY item MUST include a clear meaning in ${L}. Never use "N/A", "common", or empty notes.` : ''}
${includeExampleSchema ? `- examples: provide 3-5 natural, common, learner-friendly sentences` : ''}
- If the word has only one meaning, meanings array has one item
- Keep the entire response concise and compact
- Never output anything outside the JSON object`

  if (isEnabled('culture')) {
    prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: focus on what makes this word culturally interesting — register, origin, or shift in usage. Do NOT repeat etymology.`
  }

  return prompt + buildNativeLanguageContract(spec)
}

function getExercisesSystemPrompt(spec: NativeLanguageSpec): string {
  const L = spec.name
  return `You are a language practice exercise designer for ${spec.audience}.

Given a word/phrase and its meanings, generate practice scenarios.

Return ONLY a valid JSON array. No markdown. No explanation.

[
  { "scenario": "Scenario description in ${L}: a concrete everyday context in which the learner writes a sentence using the target word/phrase." }
]

Rules:
- The "scenario" field MUST ALWAYS be written in ${L}, regardless of the target word's language.
- The learner should be expected to use the target word/phrase (in its original language) in their response.
- Prioritize the most COMMON and PRACTICAL meanings/usages.
- Never output anything outside the JSON array.${buildNativeLanguageContract(spec)}`
}

function getEvalSystemPrompt(spec: NativeLanguageSpec): string {
  const L = spec.name
  return `You are a language writing coach for ${spec.audience}.

Evaluate whether the student's sentence correctly uses the given word/phrase in the given scenario.

Return ONLY a valid JSON object. No markdown. No explanation.

{
  "correct": true or false,
  "feedback": "Specific feedback in ${L}. If correct is true, output an empty string.",
  "correction": "The corrected sentence. If correct is true, output an empty string."
}

Rules:
- Mark correct ONLY if BOTH the meaning AND grammar are right.
- Grammar errors in the target language must be marked incorrect.
- feedback must be in ${L}, explaining the specific rule or usage nuance that was violated.
- correction must be a natural, corrected version of the student's sentence.
- Never output anything outside the JSON object.${buildNativeLanguageContract(spec)}`
}

/** Dictionary meanings line: the legacy `zh` field holds the active native language. */
function formatSenseLine(m: { zh: string; en: string }, spec: NativeLanguageSpec): string {
  return spec.isEnglish ? `EN: ${m.en || m.zh}` : `${spec.code.toUpperCase()}: ${m.zh} | EN: ${m.en}`
}

function buildUserPrompt(word: string, meanings: Array<{ zh: string; en: string }>, includeExamples: boolean = false, spec: NativeLanguageSpec = getNativeLanguage('zh')): string {
  const meaningsText = meanings
    .map((m, i) => `[Sense ${i + 1}] ${formatSenseLine(m, spec)}`)
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

  const spec = getLanguageSpec(word, config)
  const userPrompt = buildUserPrompt(word, meanings, includeExamples, spec)
  const { signal: merged, dispose } = combineSignals(signal, 60_000)

  try {
    const response = await aiFetch(`${config.endpoint}/chat/completions`, {
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
          { role: 'system', content: getSystemPrompt(config.modules, includeExamples, spec) },
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
    const response = await aiFetch(`${config.endpoint}/chat/completions`, {
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
      // If no fences, try to extract JSON object {...} or array [...]
      // Choose whichever opening delimiter appears first in the response.
      const firstBrace   = cleaned.indexOf('{')
      const firstBracket = cleaned.indexOf('[')
      const lastBrace    = cleaned.lastIndexOf('}')
      const lastBracket  = cleaned.lastIndexOf(']')

      const useArray = firstBracket !== -1 && lastBracket !== -1
        && (firstBrace === -1 || firstBracket < firstBrace)

      if (useArray && lastBracket > firstBracket) {
        cleaned = cleaned.slice(firstBracket, lastBracket + 1)
      } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
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

/**
 * 联网搜索是否真正可用：开关开启 **且** 当前服务商已配置 key。
 * 任何缺失 / 非法状态一律回退为「关闭」——这是 OFF 语义的唯一判定点。
 */
function webSearchReady(config: AiConfig): boolean {
  return config.webSearchEnabled === true && config.searchApiKey.length > 0
}

/**
 * `fetch` for the web-search providers only.
 * - Tauri (PC): route through the Rust HTTP plugin — no WebView CORS, so Brave works.
 * - Web / Capacitor: the global `fetch` (on Capacitor it's already patched to native HTTP).
 * Same call signature as `fetch`; falls back to global `fetch` if the plugin can't load.
 */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
let tauriFetch: FetchLike | null | undefined
async function searchFetch(url: string, init?: RequestInit): Promise<Response> {
  // 扩展：交给 SW 执行 → 豁免 CORS。Brave 与 Tavily 在浏览器页面里都被拦，
  // 这一条是扩展形态的主要收益来源（见 10-browser-extension.md §5.0）。
  if (isExtension()) {
    const { proxyFetch } = await import('./extensionProxy')
    return proxyFetch(url, init)
  }
  if (!isTauri()) return fetch(url, init)
  if (tauriFetch === undefined) {
    try {
      tauriFetch = (await import('@tauri-apps/plugin-http')).fetch as unknown as FetchLike
    } catch {
      tauriFetch = null
    }
  }
  return (tauriFetch ?? fetch)(url, init)
}

/**
 * 主 AI 调用的统一出口（`{endpoint}/chat/completions`）。
 *
 * 扩展下走 SW 代理，因此用户自填的自建 / 中转端点即便没有 CORS 头也能用 ——
 * 这是 Web 版做不到的。其他平台行为与原来的裸 `fetch` 完全一致。
 *
 * 注意：`ai.ts` 全程**非流式**（无 `getReader` / SSE，见 §4），
 * 所以 message 通道足够。若将来引入流式渲染，这里必须改成长连接分片。
 */
async function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isExtension()) {
    const { proxyFetch } = await import('./extensionProxy')
    return proxyFetch(url, init)
  }
  return fetch(url, init)
}

/** Brave `description` / `extra_snippets` carry `<strong>` tags + HTML entities; AI context wants plain text. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function tavilyTextSearch(apiKey: string, query: string, signal?: AbortSignal): Promise<string> {
  const response = await searchFetch('https://api.tavily.com/search', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 5 }),
  })
  if (!response.ok) return ''
  const data = await response.json() as { results?: Array<{ content: string; title: string }> }
  return (data.results ?? []).map(r => `[${r.title}]: ${r.content}`).join('\n\n')
}

async function braveTextSearch(apiKey: string, query: string, signal?: AbortSignal): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`
  const response = await searchFetch(url, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  })
  if (!response.ok) return ''
  const data = await response.json() as {
    web?: { results?: Array<{ title?: string; description?: string; extra_snippets?: string[] }> }
  }
  const results = data.web?.results ?? []
  if (results.length === 0) {
    // 200 but nothing parseable → the response shape drifted; surface it for the first real run.
    console.warn('[webSearch] Brave 200 but no web.results; top-level keys:', Object.keys(data))
    return ''
  }
  return results
    .map(r => {
      const head = `[${stripHtml(r.title ?? '')}]: ${stripHtml(r.description ?? '')}`
      const extra = (r.extra_snippets ?? []).slice(0, 2).map(stripHtml).filter(Boolean)
      return extra.length ? `${head}\n${extra.join('\n')}` : head
    })
    .join('\n\n')
}

export async function performWebSearch(query: string, signal?: AbortSignal): Promise<string> {
  const config = getConfig()
  if (!webSearchReady(config)) return ''

  try {
    return config.searchProvider === 'brave'
      ? await braveTextSearch(config.searchApiKey, query, signal)
      : await tavilyTextSearch(config.searchApiKey, query, signal)
  } catch (e) {
    console.error('Web search failed:', e)
    return ''
  }
}

const isNonEmptyString = (u: unknown): u is string => typeof u === 'string' && u.length > 0

async function tavilyImageSearch(apiKey: string, query: string, signal?: AbortSignal): Promise<string[]> {
  const response = await searchFetch('https://api.tavily.com/search', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, include_images: true, max_results: 1 }),
  })
  if (!response.ok) return []
  const data = await response.json() as { images?: unknown[] }
  // Tavily returns the publisher-origin URLs directly (no proxy); some are hotlink-protected.
  return (data.images ?? []).filter(isNonEmptyString)
}

async function braveImageSearch(apiKey: string, query: string, signal?: AbortSignal): Promise<string[]> {
  // No " photo" suffix — it biases toward stock photography and away from game art /
  // named entities (e.g. a game NPC). The query already carries the headword + scene.
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=5`
  const response = await searchFetch(url, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  })
  if (!response.ok) return []
  const data = await response.json() as {
    results?: Array<{ properties?: { url?: string }; thumbnail?: { src?: string } }>
  }
  // Proxy-first: `thumbnail.src` (imgs.search.brave.com — built for embedding, reliably loads)
  // before `properties.url` (original source, often hotlink-protected). Order is easy to flip.
  const urls: string[] = []
  for (const r of data.results ?? []) {
    if (isNonEmptyString(r.thumbnail?.src)) urls.push(r.thumbnail.src)
    if (isNonEmptyString(r.properties?.url)) urls.push(r.properties.url)
  }
  return urls
}

/**
 * 联网图片检索（Tavily / Brave 自适应）。返回**按可靠度排序的候选 URL 列表**——
 * UI 逐个尝试，加载失败自动跳下一个。关闭或未配置 key 时返回 `[]`。
 */
export async function searchWebImage(query: string, signal?: AbortSignal): Promise<string[]> {
  const config = getConfig()
  if (!webSearchReady(config)) return []

  try {
    return config.searchProvider === 'brave'
      ? await braveImageSearch(config.searchApiKey, query, signal)
      : await tavilyImageSearch(config.searchApiKey, query, signal)
  } catch (e) {
    console.error('Web image search failed:', e)
    return []
  }
}

export async function generateExercises(
  word: string,
  meanings: Array<{ zh: string; en: string }>,
  count: number,
  signal?: AbortSignal
): Promise<Exercise[]> {
  const config = getConfig()
  const spec = getLanguageSpec(word, config)

  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ${formatSenseLine(m, spec)}`)
    .join('\n')

  const lang = detectLanguage(word)
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'the target language'

  const userPrompt = `Target Word Language: ${langName}\nTarget Word/Phrase: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practice scenarios. Each scenario description MUST be written in ${spec.name}. The learner will write their response using the target word in ${langName}.`
  const cleaned = await callApi(getExercisesSystemPrompt(spec), userPrompt, signal)

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
  const spec = getLanguageSpec(word, config)
  const userPrompt = `Word: ${word}\nScenario: ${scenario}\nStudent's answer: "${userAnswer}"\n\nEvaluate the answer.`
  const cleaned = await callApi(getEvalSystemPrompt(spec), userPrompt, signal)

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
    "targetMeaning": "The specific meaning/sense of the target word demonstrated in this sentence, written in the learner's language (see the contract below).",
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
  const spec = getLanguageSpec(word, config)

  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ${formatSenseLine(m, spec)}`)
    .join('\n')

  const lang = detectLanguage(word)
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'the target language'

  const userPrompt = `Language: ${langName}\nTarget Word/Phrase: ${word}\n\nMeanings:\n${meaningsText}\n\nGenerate exactly ${count} practical example sentences containing '${word}', each demonstrating one of its common meanings in context.`
  const cleaned = await callApi(MEANING_EXERCISES_SYSTEM_PROMPT + buildNativeLanguageContract(spec), userPrompt, signal)

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
  const spec = getLanguageSpec(word, config)
  const meaningLines = meanings
    .map((m, i) => `${i + 1}. ${m.zh || ''}${m.en ? ` / ${m.en}` : ''}`.trim())
    .filter(Boolean)
    .join('\n')

  const system = `You check whether a learner correctly understands the meaning of a word/phrase in a specific example sentence context. Return ONLY JSON: {"correct":true|false,"feedback":"..."}.
If roughly right (core sense in context captured), correct=true and feedback is a short confirmation in ${spec.name} that restates what the word means in this sentence.
If wrong or incomplete, correct=false and feedback briefly explains, in ${spec.name}, the actual meaning in this sentence and the usage habit — do NOT require a full sentence from the learner.
The learner may answer in English or ${spec.name}; judge the meaning, not the language.${buildNativeLanguageContract(spec)}`

  const contextPart = sentenceContext ? `Example Sentence: "${sentenceContext}"\nTarget Meaning: ${targetMeaning || 'unspecified'}\n` : ''
  const userPrompt = `Word/phrase: ${word}\n${contextPart}Reference meanings:\n${meaningLines || '(none)'}\nLearner's guess (any language OK): "${userGuess}"\n\nEvaluate understanding in context.`
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
  cognitive: 'lookup' | 'core' = 'lookup',
  explanationLanguage: ExplanationLanguage = 'zh',
  meaningsAnchor?: MeaningsAnchor,
  learningRoute: LearningRoute = 'irrelevant',
): string {
  const isEnabled = (id: string) => moduleEnabled(modules, id)
  // Monolingual is already folded in: explanationLanguage === 'en' means "answer in English".
  const spec = getNativeLanguage(explanationLanguage)
  const L = spec.name
  const isCore = cognitive === 'core'
  // The learner's own language is a source of expression needs, not "foreign" culture material.
  const isForeign = lang !== 'en' && lang !== 'zh' && lang !== spec.code

  const meaningsZhDescription = `${L} meaning with a short context prefix, e.g. '(of a goal) a feeling of satisfaction' (written in ${L})`
  const meaningsEnDescription = "English definition (or original language equivalent)"
  const sceneLabel = `short ${L} context tag (2-4 words)`
  const sceneDesc = buildNativeSceneDescription(spec)

  // Lookup: meanings + light coreConcept. Core: thick usage image + feel/emotion anchors; no dictionary wall.
  let schema = `{\n  "correctForm": "the correct spelling of this word (fix typos if any)",\n  "phonetic": "phonetic transcription (IPA for English, Kana/Romaji for Japanese, etc.)",\n  "pos": "primary part of speech (noun/verb/adj/adv/abbr/etc.)"`

  const wantCoreConcept = isEnabled('coreConcept') || isEnabled('dictionary') || isCore
  if (wantCoreConcept) {
    if (isCore) {
      schema += `,\n  "coreConcept": {\n    "gloss": "Short lexical gloss in ${L}: equivalents + sense nucleus (NOT a scene essay)",\n    "image": "1-2 sentences in ${L}: core physical/metaphorical image",\n    "explanation": "2-4 sentences in ${L}: how this image guides REAL USAGE branches — when/why natives extend it this way (richer than a memory tip)",\n    "feelAnchor": "1 short line in ${L}: sensory feel / atmosphere only (NOT a full scene; do not repeat explanation)",\n    "emotionalTone": "1 short line in ${L}: emotional tone when natives use this word"\n  }`
    } else {
      schema += `,\n  "coreConcept": {\n    "image": "1 short sentence in ${L}: vivid core image for memory",\n    "explanation": "1 short sentence in ${L} unifying the main senses for memory (light)"\n  }`
    }
  }

  // Lookup: full meanings. Core EN: no wall. Core ZH reverse lookup: short English candidates.
  if (!isCore) {
    schema += `,\n  "meanings": [\n    {\n      "zh": "${meaningsZhDescription}",\n      "en": "${meaningsEnDescription}",\n      "pos": "specific part of speech",\n      "scene": {\n        "label": "${sceneLabel}",\n        "description": "${sceneDesc}"\n      },\n      "imageQuery": "a concrete English noun phrase for image search (3-6 English words, e.g. 'person running business in office')"\n    }\n  ]`
  } else if (lang === 'zh') {
    schema += `,\n  "meanings": [\n    {\n      "zh": "in ${L}, 1 sentence: how this English candidate differs in nuance from the Chinese input",\n      "en": "English candidate word/phrase",\n      "pos": "part of speech"\n    }\n  ]`
  } else {
    schema += `,\n  "meanings": []`
  }

  // For foreign languages, etymology is less about roots/affixes and more about composition or origin
  if (isFull && isEnabled('etymology') && !isCore) {
    const storyDesc = `1-2 sentences in ${L}: ${isForeign ? 'word composition / origin' : 'roots, affixes and origin'}`
    schema += `,\n  "etymology": {\n    "parts": [\n      {\n        "segment": "word component (the actual letter segment in the word)",\n        "meaning": "meaning in ${L}",\n        "sourceForm": "(roots only) original root form, e.g. legere",\n        "anchor": "(roots only) a simple common word sharing this root",\n        "anchorNote": "(roots only) 1 sentence in ${L}: how this anchor word embodies the root, helping association"\n      }\n    ],\n    "story": "${storyDesc}",\n    "derivedWords": [{ "word": "related word", "pos": "part of speech", "meaning": "meaning in ${L}" }]\n  }`
  }
  if (isFull && isEnabled('synonyms')) {
    const whenToUseDesc = isCore
      ? `1 sentence in ${L}: mental fit — when natives pick THIS near-synonym AND when the HEADWORD fits better`
      : `1 sentence in ${L}: when and why native speakers choose this specific word (e.g. slim -> a complimentary, graceful kind of thin)`
    schema += `,\n  "synonyms": [{ "word": "synonym", "distinction": "in ${L}: nuance vs the headword", "tone": "one of: positive | negative | neutral | informal", "whenToUse": "${whenToUseDesc}" }],\n  "antonyms": [{ "word": "antonym", "distinction": "in ${L}: contrast with the headword" }]`
  }

  const wantChunks = isFull && isEnabled('chunks')
  const wantCollocations = isFull && isEnabled('collocations')
  if (wantChunks || wantCollocations) {
    const collocationsNote = `REQUIRED: clear ${L} meaning, understandable without the original`
    const spatialDesc = `in ${L}: for prep phrases, name the preposition's spatial/logical role in the collocation; omit the field if none — never N/A`
    const chunksPart = wantChunks
      ? `"chunks": [\n      { "chunk": "COMMON PREPOSITIONAL phrase only (prep+N, V+prep(+N))", "note": "${collocationsNote}", "spatialExtension": "${spatialDesc}" }\n    ]`
      : `"chunks": []`
    const colloPart = wantCollocations
      ? `"collocations": [\n      { "chunk": "OTHER common phrase WITHOUT prep focus (adj+N, V+N, N+V)", "note": "${collocationsNote}" }\n    ]`
      : `"collocations": []`
    schema += `,\n  "collocations": {\n    ${chunksPart},\n    ${colloPart}\n  }`
  }

  if (isEnabled('examples') && !isCore) {
    if (isForeign && triLingual) {
      schema += `,\n  "examples": [\n    { "original": "Example sentence in target language", "en": "English translation", "zh": "${L} translation" }\n  ]`
    } else {
      schema += `,\n  "examples": [\n    { "en": "Example sentence in original language (or target language)", "zh": "${exampleGlossDesc(spec)}" }\n  ]`
    }
  }

  if (isFull && isEnabled('usageScenes') && isCore) {
    schema += `,\n  "usageScenes": [\n    { "label": "short ${L} scene tag (2-4 words)", "description": "1-2 sentences in ${L}: when natives use this word, communicative job, typical sentence pattern (not a translation example wall)" }\n  ]`
  }

  if (isFull && isEnabled('culture')) {
    if (isForeign) {
      // Foreign words: keep deep subculture/ACG focus
      schema += `,\n  "culturalLore": {\n    "title": "short ${L} tag for the fun background / cultural origin",\n    "content": "1-3 sentences in ${L}: the word's history, cultural background, or why it became popular",\n    "subculture": "in ${L}: if it is ACG / gaming / internet slang, its source and in-group meaning",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    } else {
      // English / Chinese words: focus on register + cultural note
      schema += `,\n  "culturalLore": {\n    "title": "short ${L} tag (2-4 words, e.g. Gen-Z Slang, Legal Jargon)",\n    "content": "1-2 sentences in ${L}: the word's cultural origin, register (formal/informal/slang/technical), or notable usage shift",\n    "register": "one of: formal | informal | slang | technical | neutral"\n  }`
    }
  }

  if (isCore && isEnabled('wordGraph')) {
    schema += `,\n  "conceptGraph": {\n    "rootCore": "1-3 word core concept label in ${L}",\n    "branches": [\n      {\n        "category": "Domain category in ${L} (e.g. Physical Motion, Machines, Business)",\n        "explanation": "1 sentence in ${L} explaining why this branch derives from the root core",\n        "examples": [\n          {\n            "phrase": "typical English phrase or short expression",\n            "meaning": "REQUIRED: clear ${L} meaning of this phrase",\n            "mindHint": "REQUIRED, 1 sentence in ${L}: the native speaker's mental image — why this usage grows from the root core"\n          }\n        ]\n      }\n    ]\n  }`
  }

  // Direction A — optional personalization hook; OMITTED unless clearly relevant.
  schema += `,\n  "profileInsight": "OPTIONAL — OMIT this field entirely unless this word clearly relates to one of the learner's listed recurring confusions; then ONE short sentence in ${L} naming the link"`

  schema += `\n}`

  const basePrompt = isCore
    ? `You are a native-speaker cognitive coach for ${spec.audience}. Your job is NOT dictionary lookup — remodel how learners THINK about a word so they can use it the way natives do (mental picture, emotional stance, when/why to choose it, core image network).`
    : `You are a professional English vocabulary analyst for ${spec.audience}. Focus on understanding and memory: clear meanings, memory aids (core image, etymology, nuance), and practical understanding.`
  const multiLangPrompt = isCore
    ? `You are a cultural-cognitive coach for foreign words, explaining them to ${spec.audience}. Prioritize how natives conceptualize the word — social meaning, subculture nuance, and when it is the right choice.`
    : `You are a professional multi-language translator and cultural analyst for ${spec.audience}. Your core mission is NOT just translation, but "Cultural Interpretation" — explaining the social, historical, and subculture context behind foreign words.`

  let prompt = `${isForeign ? multiLangPrompt : basePrompt}

Given an ${lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : lang === 'ko' ? 'Korean' : 'foreign language'} word, provide a complete analysis${isCore ? ' with native-mind priority' : ' for understanding and memory'}.

${webSearchResults ? `ADDITIONAL CONTEXT (Web Search Results):\n${webSearchResults}\nUse this information to ensure your analysis is up-to-date and accurate.\n` : ''}

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
${schema}

Rules:
${buildCultureAwareInputRule()}
${isCore ? `- Do NOT fill a full dictionary meanings wall for English input (meanings may be []).
- Do NOT invent nativeMindModel (legacy). Put feel into coreConcept.feelAnchor and emotion into coreConcept.emotionalTone.
- coreConcept.gloss: REQUIRED short lexical gloss (equivalents + sense nucleus) before imagery.
- coreConcept.explanation: RICH usage-oriented (how the image guides when/how to use the word). feelAnchor must NOT repeat the same scene prose.
- Do NOT dump concrete scenes into coreConcept.explanation — concrete when/where communicative scenes belong in usageScenes; explanation stays at image→usage-branch level.
- Do NOT invent wordChoiceContrast — fold why-choose-headword into synonyms[].whenToUse (mental fit).
${isEnabled('wordGraph') ? '- conceptGraph: REQUIRED. Examples MUST be { phrase, meaning, mindHint }; never bare strings or N/A. mindHint = how this phrase grows from rootCore only (not whole-word emotion).' : ''}
- PRIORITY for Pure Core: coreConcept > conceptGraph > prep chunks > other collocations > synonyms > usageScenes > culture.` : `- meanings: most common practical senses (typically 2-8, by frequency) — dictionary-style glosses, not scene essays.
- coreConcept: LIGHT memory anchor (short image + short unifying line). Do NOT invent nativeMindModel, conceptGraph, or wordChoiceContrast.
- scene is REQUIRED for EVERY meaning in the meanings array — never omit it for any sense, even rare ones.
${buildNativeSceneRules(spec)}
- PRIORITY for Lookup: coreConcept > meanings/scenes > etymology > examples.`}
- For abbreviations, explain what each letter stands for.
- If the input is CHINESE:
  - correctForm: provide the closest natural English word or short expression; do not force a culture-bound expression into one word.
  ${isCore ? '- meanings: REQUIRED short list of 2-5 English candidates (en=word, zh=nuance vs input). Not a full dictionary wall.' : '- meanings: provide 2-5 English alternatives with nuances.'}
- If the input is a FOREIGN LANGUAGE (not English/Chinese):
  - PRIORITY: Provide deep cultural/subculture context in "culturalLore".
  - Explain the specific historical or social context behind the word.
  - For ACG (Anime/Comic/Games) or internet terms, specify the source and why it is popular.
${buildInputDirectionRule(spec, lang)}
${isFull && isEnabled('etymology') && !isCore ? `- etymology.parts: each segment must correspond to the actual letters in the target word
- For each ROOT morpheme: fill sourceForm (original Latin/Greek form), anchor (a common word the learner likely knows sharing this root), anchorNote (1 ${L} sentence connecting anchor → root meaning)
- For pure prefixes/suffixes: omit sourceForm, anchor, anchorNote` : ''}
${wantChunks ? (isCore
    ? `- collocations.chunks: For ordinary content words, 4-6 COMMON PREPOSITIONAL phrases ONLY. note MUST explain meaning AND the preposition's role. spatialExtension preferred for spatial/logic.`
    : `- collocations.chunks: 4-6 COMMON PREPOSITIONAL phrases ONLY. note MUST explain meaning AND the preposition's role. spatialExtension preferred for spatial/logic.`) : ''}
${wantCollocations ? (isCore
    ? `- collocations.collocations: For ordinary content words, 4-6 OTHER common phrases (no prep focus). Do NOT put prep phrases here.`
    : `- collocations.collocations: 4-6 OTHER common phrases (no prep focus). Do NOT put prep phrases here.`) : ''}
${(wantChunks || wantCollocations) ? `- CRITICAL — note: EVERY non-empty item needs clear meaning in ${L}. Never "N/A" / "common" / empty notes on real items.` : ''}
${isCore && (wantChunks || wantCollocations) ? `- SKIP collocations when redundant with conceptGraph (Pure Core rule C): If the headword is a discourse particle / tag-question remnant / sentence-final tag / interjection (e.g. innit, eh) and the only natural "phrases" would be sentence frames that merely repeat conceptGraph examples (It's …, innit? / …, innit!), return "chunks": [] and "collocations": []. Do NOT invent filler frames. Ordinary content words (nouns/verbs/adjectives like shrug, sheen) MUST still fill collocations normally.` : ''}
${isFull && isEnabled('usageScenes') && isCore ? `- usageScenes: 3-5 native usage scenes / communicative jobs / typical patterns — not a translation example wall.` : ''}
${isFull && isEnabled('synonyms') ? `- synonyms: 3-5 with tone + whenToUse; antonyms: 3-5.` : ''}
${!isCore && isEnabled('examples') ? `- examples: 3-5 learner-friendly sentences.` : ''}
- Keep everything concise.`

  if (isCore && lang === 'zh' && !spec.isEnglish) {
    prompt += buildZhCoreConceptMapRule(spec)
  }
  prompt += buildAnchorBlock(meaningsAnchor, isCore)
  if (isFull && isEnabled('culture')) {
    if (isForeign) {
      prompt += `\n- culturalLore: PRIORITY for foreign words. Provide deep cultural/subculture context. Specify ACG source, historical origin, or social context.`
    } else {
      prompt += `\n- culturalLore.register must be exactly one of: formal, informal, slang, technical, neutral\n- culturalLore.content: focus on register, cultural origin, or usage shift. Do NOT repeat etymology.`
    }
  }

  prompt += buildProfilePromptContext('compact', learningRoute, explanationLanguage)
  prompt += buildNativeLanguageContract(spec)

  return prompt
}

export async function aiFullLookup(
  word: string,
  isFull: boolean = true,
  signal?: AbortSignal,
  cognitive: 'lookup' | 'core' = 'lookup',
  opts: { anchor?: MeaningsAnchor; webResults?: string; learningRoute?: LearningRoute } = {}
): Promise<AiFullResult> {
  const config = getConfig()
  const lang = detectLanguage(word)
  const learningRoute = opts.learningRoute ?? resolveCurrentLearningRoute(word)
  
  // When both halves run in parallel the caller does ONE shared web search and
  // passes it in; only fall back to our own when called standalone.
  const webResults = opts.webResults ?? await performWebSearch(word, signal)
  
  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const activeModules = modulesForCognitive(config, cognitive)
  const dictionaryContext = resolveDictionaryContext(word, config)
  const cleaned = await callApi(
    getFullLookupPrompt(activeModules, lang, webResults, isFull, config.triLingualExamples,
      cognitive, dictionaryContext.explanationLanguage, opts.anchor, learningRoute),
    `${langName}: ${word}\n\nAnalyze this word and return the JSON.`,
    signal
  )
  try {
    const parsed = JSON.parse(cleaned) as AiFullResult
    if (!parsed.meanings) parsed.meanings = []
    if (!parsed.examples) parsed.examples = []
    if (parsed.profileInsight && learningRoute !== 'irrelevant') parsed.profileInsightDirection = learningRoute
    return parsed
  } catch { /* fall through */ }
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as AiFullResult
      if (!parsed.meanings) parsed.meanings = []
      if (!parsed.examples) parsed.examples = []
      if (parsed.profileInsight && learningRoute !== 'irrelevant') parsed.profileInsightDirection = learningRoute
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

  const spec = getLanguageSpec(word, config)
  const system = `You fill missing meanings for English chunks/collocations. Return ONLY a JSON array. Each item: {"chunk":"...","note":"clear ${spec.name} meaning (REQUIRED)"}. NEVER use N/A or "common". Do not invent new chunks — only explain the given list.${buildNativeLanguageContract(spec)}`

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

  const spec = getLanguageSpec(word, config)
  const system = `You complete native-mind explanations for concept-tree phrases. Return ONLY JSON array of {"phrase","meaning","mindHint"}. meaning = what it means, in ${spec.name}; mindHint = in ${spec.name}, how a native speaker extends the root core "${rootCore}" to this usage. REQUIRED fields. No N/A.${buildNativeLanguageContract(spec)}`

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
  cognitive: 'lookup' | 'core' = 'lookup',
  opts: { anchor?: MeaningsAnchor; webResults?: string; learningRoute?: LearningRoute } = {}
): Promise<PhraseResult> {
  const config = getConfig()
  const lang = detectLanguage(phrase)
  const learningRoute = opts.learningRoute ?? resolveCurrentLearningRoute(phrase)

  const webResults = opts.webResults ?? await performWebSearch(phrase, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const dictionaryContext = resolveDictionaryContext(phrase, config)
  const qType = dictionaryContext.queryType

  const phraseQueryType: PhrasePromptQueryType = qType === 'sentence' ? 'sentence' : 'phrase'
  const activeModules = modulesForPhraseCognitive(config, cognitive)
  const cleaned = await callApi(
    buildPhrasePrompt({
      modules: activeModules,
      lang,
      webSearchResults: webResults,
      isFull,
      triLingual: config.triLingualExamples,
      cognitive,
      queryType: phraseQueryType,
      meaningsAnchor: opts.anchor,
      explanationLanguage: dictionaryContext.explanationLanguage,
      learningRoute,
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
  return {
    phrase,
    ...parsed,
    profileInsightDirection: parsed.profileInsight && learningRoute !== 'irrelevant'
      ? learningRoute
      : undefined,
  }
}

// ── AI 问答 ──

export async function askQuestion(
  context: string,
  history: ChatMessage[],
  signal?: AbortSignal,
  richContext?: string,
  routeQuery?: string,
  learningRoute?: LearningRoute,
): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const routingQuery = routeQuery || context
  const languagePolicy = resolveLearnerLanguagePolicy(routingQuery, config)
  const spec = getNativeLanguage(languagePolicy.nativeLanguage)
  const richSection = richContext
    ? `\n\nHere is the analysis already displayed to the user for reference:\n${richContext}\n\nAnswer based on this context where relevant.`
    : ''
  // Direction A — the learner's hot weak spots, so a follow-up answer can connect
  // the dots when relevant (opt-in; empty when nothing is hot).
  const profileSection = buildProfilePromptContext(
    'compact',
    learningRoute ?? resolveCurrentLearningRoute(routingQuery),
    languagePolicy.profileLanguage,
  )
  const tableRule = `Table orientation rule (mobile screen — NEVER exceed 3 columns): (A) If comparing N words across M attributes and N ≤ M: put the words as COLUMN headers (row 1 = word names, then one row per attribute) so columns = N ≤ 3. (B) If N > M: put attributes as COLUMN headers (row 1 = attribute names, one row per word) so columns = M ≤ 3. When either N or M > 3, pick whichever orientation keeps columns ≤ 3 and let rows grow. Never create a table wider than 3 columns.`
  const audienceRule = spec.isEnglish
    ? 'You are a helpful English language assistant for native or monolingual English users.\nAnswer in clear, natural English without assuming any second-language transfer.'
    : `You are a helpful English learning assistant for ${spec.audience}.\nAnswer in ${spec.name}, with English examples where appropriate.`
  const systemPrompt = `${audienceRule}\nThe user is currently studying: "${context}".${richSection}${profileSection}\nKeep answers concise and practical.\nFormatting: you may use Markdown — bold, italic, lists, inline code, and pipe tables. Use a table when comparing words or concepts. ${tableRule} If you use headings, use #### or ##### only — never # / ## / ###.${buildNativeLanguageContract(spec)}`

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const response = await aiFetch(`${config.endpoint}/chat/completions`, {
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
function getMnemonicSystemPrompt(spec: NativeLanguageSpec): string {
  const L = spec.name
  return `You are a creative English mnemonic expert for ${spec.audience}. Your goal is to evaluate and provide the most effective memory aids for a given word.

Generate mnemonics for ALL THREE approaches and score each (0-100) based on its "potential to help a student remember the word permanently":

1. PHILOLOGY:
   GOAL: Write a vivid, flowing NARRATIVE — NOT a factual etymology list. The learner already sees a structured breakdown of roots/affixes elsewhere; here you must turn that knowledge into a durable mental image.
   HOW:
   - Open with an anchor word the learner likely already knows that shares the same root (e.g. "you already know select / collect"), then use it as a bridge: show HOW the shared root connects to the target word's meaning.
   - Describe a concrete scene, metaphor, or action that makes the root meaning visceral and memorable (e.g. a Roman scholar picking books, a river flowing through/splitting).
   - End by snapping back to the target word — why the image *is* the word's meaning.
   - Symbolic letter shapes (A=sharp top, V=valley) and letter interchanges (d↔t, v↔b) can be woven in if they add insight.
   - High score if the root connection is clear and the scene is vivid enough to replay in memory.

2. STORY:
   - ${spec.soundAlikeHint}.
   - Absurd, vivid, or humorous stories.
   - High score if the sound-alike or story is memorable and funny.

3. SMART:
   - A hybrid approach or a completely unique association (e.g., visual cues, connection to pop culture, or breaking the word into recognizable "mini-words" that aren't strictly roots).
   - Use this if the other two methods feel forced or weak.

JSON Output Schema:
{
  "philology": {
    "content": "Mnemonic narrative in ${L}, 2-4 sentences.",
    "score": 90,
    "reason": "Brief explanation in ${L} of why this method works well or poorly."
  },
  "story": {
    "content": "Mnemonic text in ${L}, 1-3 sentences.",
    "score": 30,
    "reason": "Brief explanation in ${L}."
  },
  "smart": {
    "content": "Mnemonic text in ${L}, 1-3 sentences.",
    "score": 60,
    "reason": "Brief explanation in ${L}."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- philology.content MUST be a narrative paragraph, NOT a bullet list or etymology fact-dump. It should read like a mini story or vivid metaphor, 2-4 sentences.
- story.content and smart.content: 1-3 sentences each.
- bestType must indicate the approach with the highest score. If scores are close, prioritize: Philology > Story > Smart.
- Scores must be honest. If a word is extremely hard to remember, scores should reflect that.
- Return ONLY the JSON object.${buildNativeLanguageContract(spec)}`
}

// ── AI 词组助记生成 ──
function getPhraseMnemonicSystemPrompt(spec: NativeLanguageSpec): string {
  const L = spec.name
  return `You are an English phrasal verb and idiom expert for ${spec.audience}. Your goal is to help students understand the "why" behind phrases, especially those involving prepositions.

Explain phrases from a NATIVE SPEAKER'S perspective, providing mnemonics for these approaches:

1. CORE IMAGE (mapped to "philology"):
   - Explain the root image of the preposition (e.g., 'in' is entering a space, 'up' is completeness/arrival, 'off' is detachment).
   - Use vivid metaphors (e.g., "pop in" is like a quick head-pop into a room through a window).
   - Show how the combination creates a logical "mental movie".

2. STORY (mapped to "story"):
   - Use the historical origin or a modern humorous scenario to link the words.

3. SMART (mapped to "smart"):
   - Other intuitive ways to remember the phrase, or practical usage cues.

JSON Output Schema:
{
  "philology": {
    "content": "Core image explanation in ${L}.",
    "score": 90,
    "reason": "Why this core image makes sense, in ${L}."
  },
  "story": {
    "content": "Story or origin explanation in ${L}.",
    "score": 30,
    "reason": "Why this story helps, in ${L}."
  },
  "smart": {
    "content": "Smart association in ${L}.",
    "score": 60,
    "reason": "Why this association is useful, in ${L}."
  },
  "bestType": "philology" | "story" | "smart"
}

Rules:
- Focus on native-speaker thinking.
- Explain the logic of prepositions clearly.
- bestType must be the highest scoring one.
- Never output anything outside the JSON object.${buildNativeLanguageContract(spec)}`
}

function getSingleMnemonicPrompt(spec: NativeLanguageSpec): string {
  const L = spec.name
  return `You are a creative English mnemonic expert for ${spec.audience}. Your goal is to generate or refine a single mnemonic of a specific type for a given English word or phrase.

There are three types of mnemonics:
1. PHILOLOGY (etymology logic / core image):
   - For words: Write a vivid, flowing narrative paragraph (2-4 sentences) connecting the word's root/affix to its meaning using an anchor word the learner likely knows (e.g. collect/select). Describe a concrete scene/metaphor. DO NOT output a bullet list or factual etymology dump.
   - For phrases: Explain the core image of the preposition/verb combination (e.g., 'in' is entering space, 'up' is completion) with vivid metaphors and a logical "mental movie".
2. STORY (fun story):
   - ${spec.soundAlikeHint}, or absurd, vivid, or humorous stories (1-3 sentences).
3. SMART (smart association):
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
   - In the "reason" field, explain gently in ${L} why the user's idea might not be the best fit, and explain the logic of the new mnemonic.

Output format MUST be a valid JSON object:
{
  "content": "Mnemonic text in ${L}.",
  "score": 0-100 score representing memory effectiveness,
  "reason": "Brief explanation in ${L}. If the user provided an idea, explain if it was adopted/why or why not."
}

Rules:
- Return ONLY the JSON object. No markdown code fences. No extra text.${buildNativeLanguageContract(spec)}`
}

export async function generatePhraseMnemonic(
  phrase: string,
  signal?: AbortSignal
): Promise<import('../types').Mnemonic> {
  const config = getConfig()
  const spec = getLanguageSpec(phrase, config)
  const cleaned = await callApi(
    getPhraseMnemonicSystemPrompt(spec),
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
  const spec = getLanguageSpec(word, config)
  const cleaned = await callApi(
    getMnemonicSystemPrompt(spec),
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
  const spec = getLanguageSpec(word, config)

  const cleaned = await callApi(
    getSingleMnemonicPrompt(spec),
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

  const response = await aiFetch(`${config.endpoint}/chat/completions`, {
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

/** Error carrying a stable `code` so the UI can localise it (see SettingsView). */
export type TestConnErrorCode = 'no-key' | 'no-endpoint' | 'unauthorized' | 'not-found' | 'rate-limit'
function testConnError(code: TestConnErrorCode, fallback: string): Error {
  return Object.assign(new Error(fallback), { code })
}

export async function testConnection(signal?: AbortSignal): Promise<string> {
  const config = getConfig()
  if (!config.apiKey) throw testConnError('no-key', 'API key is not set')
  if (!config.endpoint) throw testConnError('no-endpoint', 'Endpoint is not set')

  const response = await aiFetch(`${config.endpoint}/chat/completions`, {
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
    if (response.status === 401) throw testConnError('unauthorized', 'API key invalid or lacks permission')
    if (response.status === 404) throw testConnError('not-found', 'Model not found or wrong endpoint')
    if (response.status === 429) throw testConnError('rate-limit', 'Too many requests, retry later')
    throw new Error(text.slice(0, 120))
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const reply = data.choices?.[0]?.message?.content?.trim() ?? ''
  return reply || '连接成功'
}

function prepImageryFieldDescs(spec: NativeLanguageSpec) {
  const L = spec.name
  return {
    coreIdeaPlaceholder: `2-4 short ${L} keywords joined by ' · ' (e.g. Increase · Completion · Creation, written in ${L})`,
    phraseExplanationPlaceholder: `2-3 sentences in ${L} explaining how this preposition's spatial imagery shapes the meaning of this specific phrase`,
    smartAssocPlaceholder: `1-sentence ${L} quick visual summary / memory cue (can use emoji or → notation)`,
    languageRule: `All explanation text (coreIdea, phraseExplanation, smartAssoc) MUST be in clear, learner-friendly ${L}.`,
  }
}

export async function generatePrepImagery(
  phrase: string,
  prepositions: string[],
  signal?: AbortSignal
): Promise<PrepSpatialData> {
  const config = getConfig()
  const spec = getLanguageSpec(phrase, config)
  const { coreIdeaPlaceholder, phraseExplanationPlaceholder, smartAssocPlaceholder, languageRule } = prepImageryFieldDescs(spec)

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
- Return ONLY the JSON object.${buildNativeLanguageContract(spec)}`

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
  const spec = getLanguageSpec(phrase, config)
  const { coreIdeaPlaceholder, phraseExplanationPlaceholder, smartAssocPlaceholder, languageRule } = prepImageryFieldDescs(spec)

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
- Return ONLY the JSON object.${buildNativeLanguageContract(spec)}`

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
 * Stage 1 — resolve WHAT we are explaining, as fast and as cheaply as possible.
 *
 * This is not "generate the meanings" for its own sake. It is the disambiguation
 * contract the two parallel halves must share: the corrected headword, and (for
 * Chinese input, where the target word is genuinely ambiguous) the candidate senses.
 * Output is deliberately tiny so it lands in well under a second.
 */
export async function resolveQuerySkeleton(
  query: string,
  queryType: 'word' | 'phrase' | 'sentence',
  explanationLanguage: ExplanationLanguage = 'zh',
  signal?: AbortSignal
): Promise<MeaningsAnchor> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const lang = detectLanguage(query)
  const isSentence = queryType === 'sentence'
  const isZhInput = lang === 'zh'

  const spec = getNativeLanguage(explanationLanguage)
  const L = spec.name
  const roleDesc = `You are a professional English vocabulary analyst for ${spec.audience}.`

  const shape = isSentence
    ? `{
  "correctForm": "the corrected / cleaned form of the input text",
  "senses": [ { "senseIndex": 1, "zh": "faithful full ${L} translation", "en": "original or polished English text" } ]
}`
    : `{
  "correctForm": "the English headword being explained (fix typos; for Chinese input, the closest natural English word or short expression; culture-bound inputs may require a phrase)",
  "pos": "primary part of speech",
  "phonetic": "IPA if English, else omit",
  "senses": [ { "senseIndex": 1, "pos": "n.", "zh": "core sense in ${L}", "en": "English gloss" } ]
}`

  const senseRule = isSentence
    ? '- senses: EXACTLY 1 item, a faithful translation. Never summarize.'
    : isZhInput
      ? `- senses: 2-5 items. The user typed Chinese, so each sense is a DISTINCT English candidate for that concept, ordered best-first, with "en" = the English word and "zh" = the ${L} nuance that separates it from the others.`
      : '- senses: 1-4 primary dictionary senses, ordered by frequency.'

  const systemPrompt = `${roleDesc}

You are the fast disambiguation pass. Return ONLY a valid JSON object — no markdown, no prose.

${shape}

Rules:
${buildCultureAwareInputRule()}
- correctForm is REQUIRED. It is the single thing every later pass must agree on.
${senseRule}
- Be terse. This is a routing decision, not the final answer.${buildNativeLanguageContract(spec)}`

  const userPrompt = `Input: "${query}"\n\nReturn the resolution JSON.`

  const cleaned = await callApi(systemPrompt, userPrompt, signal)

  const coerce = (raw: unknown): MeaningsAnchor | null => {
    if (!raw || typeof raw !== 'object') return null
    // Tolerate a bare array (older prompt shape) and objects using "meanings".
    if (Array.isArray(raw)) {
      return { senses: normalizeSenses(raw) }
    }
    const o = raw as Record<string, unknown>
    const senseSrc = Array.isArray(o.senses) ? o.senses : Array.isArray(o.meanings) ? o.meanings : []
    const senses = normalizeSenses(senseSrc)
    const correctForm = typeof o.correctForm === 'string' ? o.correctForm.trim() : undefined
    if (!correctForm && senses.length === 0) return null
    return {
      correctForm: correctForm || undefined,
      pos: typeof o.pos === 'string' ? o.pos : undefined,
      phonetic: typeof o.phonetic === 'string' ? o.phonetic : undefined,
      senses,
    }
  }

  try {
    const hit = coerce(JSON.parse(cleaned))
    if (hit) return hit
  } catch { /* fall through */ }

  const objMatch = cleaned.match(/[[{][\s\S]*[\]}]/)
  if (objMatch) {
    try {
      const hit = coerce(JSON.parse(objMatch[0]))
      if (hit) return hit
    } catch { /* fall through */ }
  }

  throw new Error('AI returned invalid JSON for query resolution')
}

/** Drop malformed sense entries and renumber, so downstream indexing is always dense. */
function normalizeSenses(raw: unknown[]): MeaningsAnchor['senses'] {
  const out: MeaningsAnchor['senses'] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const zh = typeof o.zh === 'string' ? o.zh.trim() : ''
    const en = typeof o.en === 'string' ? o.en.trim() : ''
    if (!zh && !en) continue
    out.push({
      senseIndex: out.length + 1,
      zh: zh || en,
      en: en || undefined,
      pos: typeof o.pos === 'string' ? o.pos : undefined,
    })
    if (out.length >= 5) break
  }
  return out
}

/**
 * @deprecated v0.9.15 — superseded by two parallel aiFullLookup() halves.
 * One mega-JSON is output-token bound and, being non-streaming, cannot paint
 * anything until all of it lands. Kept for rollback / A-B comparison only.
 *
 * Single AI call for word — returns both Lookup and Core data.
 */
export async function aiCombinedLookup(
  word: string,
  isFull: boolean = true,
  signal?: AbortSignal,
  meaningsAnchor?: Array<{ pos?: string; zh: string; en?: string; senseIndex?: number }>
): Promise<CombinedAiResult> {
  const config = getConfig()
  const lang = detectLanguage(word)

  const webResults = await performWebSearch(word, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const dictionaryContext = resolveDictionaryContext(word, config)
  const prompt = buildCombinedWordPrompt({
    lookupModules: config.modules,
    coreModules: config.coreModules,
    lang,
    webSearchResults: webResults,
    isFull,
    triLingual: config.triLingualExamples,
    explanationLanguage: dictionaryContext.explanationLanguage,
    meaningsAnchor,
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
 * @deprecated v0.9.15 — superseded by two parallel aiPhraseQuery() halves.
 * Kept for rollback / A-B comparison only.
 */
export async function aiCombinedPhraseQuery(
  phrase: string,
  isFull: boolean = true,
  signal?: AbortSignal,
  meaningsAnchor?: Array<{ pos?: string; zh: string; en?: string; senseIndex?: number }>
): Promise<CombinedPhraseResult> {
  const config = getConfig()
  const lang = detectLanguage(phrase)

  const webResults = await performWebSearch(phrase, signal)

  const langNames: Record<string, string> = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' }
  const langName = langNames[lang] || 'Foreign Language'

  const dictionaryContext = resolveDictionaryContext(phrase, config)
  const qType = dictionaryContext.queryType

  const phraseQueryType = qType === 'sentence' ? 'sentence' : 'phrase'

  const prompt = buildCombinedPhrasePrompt({
    lookupModules: config.modules,
    coreModules: config.corePhraseModules,
    lang,
    webSearchResults: webResults,
    isFull,
    triLingual: config.triLingualExamples,
    queryType: phraseQueryType,
    meaningsAnchor,
    explanationLanguage: dictionaryContext.explanationLanguage,
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

/**
 * 为单条 meaning 按需进行 AI 深度赋能（同时生成场景解释与联网搜图关键词）。
 * 返回 { scene: Scene, imageQuery?: string }
 */
export async function enrichSingleMeaning(
  word: string,
  meaning: { zh: string; en: string },
  signal?: AbortSignal
): Promise<{ scene: { label: string; description: string }; imageQuery?: string }> {
  const config = getConfig()
  if (!config.apiKey) throw new Error('API key not configured')
  if (!config.endpoint) throw new Error('AI endpoint not configured')

  const spec = getLanguageSpec(word, config)

  const sceneLabel = `short ${spec.name} context tag (2-4 words)`
  const sceneDesc = buildNativeSceneDescription(spec)

  const systemPrompt = `You are a professional English vocabulary analyst for ${spec.audience}.

Given a single word and one of its specific meanings, generate BOTH:
1. A vivid scene explanation (scene: { label, description })
2. A 3-6 word English noun phrase query for web image search (imageQuery) that vividly visualizes this specific meaning.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

{
  "scene": {
    "label": "${sceneLabel}",
    "description": "${sceneDesc}"
  },
  "imageQuery": "3-6 word descriptive English noun phrase for web image search"
}

Rules:
- description must be conversational and vivid, NOT dictionary-style
${buildNativeSceneRules(spec)}
- imageQuery MUST be a concrete English noun phrase (3-6 words) depicting this specific sense
- Never output anything outside the JSON object${buildNativeLanguageContract(spec)}`

  const meaningText = formatSenseLine(meaning, spec)

  const userPrompt = `Word: ${word}

Meaning: ${meaningText}

Generate both the scene explanation and the image query for this specific meaning, then return the JSON.`

  const cleaned = await callApi(systemPrompt, userPrompt, signal)

  try {
    const parsed = JSON.parse(cleaned) as { scene?: { label: string; description: string }; imageQuery?: string; label?: string; description?: string }
    if (parsed.scene && parsed.scene.description) {
      return { scene: parsed.scene, imageQuery: parsed.imageQuery }
    }
    // Fallback if AI flattened scene
    if (parsed.label || parsed.description) {
      return {
        scene: { label: parsed.label || '', description: parsed.description || '' },
        imageQuery: parsed.imageQuery,
      }
    }
  } catch { /* fall through */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as { scene?: { label: string; description: string }; imageQuery?: string; label?: string; description?: string }
      if (parsed.scene && parsed.scene.description) {
        return { scene: parsed.scene, imageQuery: parsed.imageQuery }
      }
      if (parsed.label || parsed.description) {
        return {
          scene: { label: parsed.label || '', description: parsed.description || '' },
          imageQuery: parsed.imageQuery,
        }
      }
    } catch { /* fall through */ }
  }

  console.error('enrichSingleMeaning raw response:', cleaned)
  throw new Error('AI returned invalid JSON for single meaning enrichment')
}



