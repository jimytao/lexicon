import { aiFetch } from './aiTransport'
import { effectiveAiProvider, isRetiredAiEndpoint, normalizeAiEndpoint, requiresAiApiKey } from './aiConnection'

export interface ProviderDef {
  id: string
  name: string
  endpoint: string
  defaultModel?: string
  modelCatalog?: { models: string[]; sourceUrl: string; verifiedAt: string }
  retired?: { sourceUrl: string }
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
  { id: 'mistral', name: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1' },
  { id: 'together', name: 'Together AI', endpoint: 'https://api.together.ai/v1' },
  { id: 'xai', name: 'xAI / Grok', endpoint: 'https://api.x.ai/v1' },
  {
    id: 'perplexity', name: 'Perplexity', endpoint: 'https://api.perplexity.ai/v1',
  },
  { id: 'moonshot', name: 'Moonshot / Kimi', endpoint: 'https://api.moonshot.cn/v1' },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1' },
  {
    id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    modelCatalog: {
      models: ['glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-5-turbo', 'glm-5', 'glm-4.7', 'glm-4.7-flash',
        'glm-4.7-flashx', 'glm-4.6', 'glm-4.5-air', 'glm-4.5-airx', 'glm-4.5-flash',
        'glm-4-flash-250414', 'glm-4-flashx-250414', 'glm-5.3-flashx', 'glm-5.3-flash', 'glm-5v-turbo',
        'glm-4.6v', 'autoglm-phone', 'glm-4.6v-flash', 'glm-4.6v-flashx', 'glm-4v-flash',
        'glm-4.1v-thinking-flashx', 'glm-4.1v-thinking-flash', 'glm-5.3-flashx-legal', 'glm-4-long'],
      sourceUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview', verifiedAt: '2026-11-01',
    },
  },
  { id: 'yi', name: '零一万物', endpoint: 'https://api.lingyiwanwu.com/v1', retired: { sourceUrl: 'https://platform.lingyiwanwu.com/' } },
  { id: 'custom', name: '自定义', endpoint: '' },
]

type ModelsErrorCode = 'invalid-config' | 'http' | 'invalid-response' | 'empty' | 'network' | 'timeout' | 'unavailable'

export class ProviderModelsError extends Error {
  constructor(public readonly code: ModelsErrorCode, public readonly status?: number) {
    super(code === 'http' ? `HTTP ${status}` : code)
    this.name = 'ProviderModelsError'
  }
}

export interface ProviderModelsResult {
  models: string[]
  source: 'live' | 'catalog'
  sourceUrl?: string
  verifiedAt?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function supportsTextChat(model: Record<string, unknown>, providerId: string) {
  // Only remove entries whose metadata explicitly rules out text chat. Vision and
  // unfamiliar future/custom IDs must not disappear because of a name heuristic.
  const capabilities = record(model.capabilities)
  if (model.archived === true || model.active === false) return false
  const endpoints = model.endpoints ?? model.supported_endpoints
  if (providerId === 'openrouter' && Array.isArray(endpoints)
    && !endpoints.some(endpoint => typeof endpoint === 'string' && /(?:^|\/)chat\/completions\/?$/.test(endpoint))) return false
  if (capabilities?.completion_chat === false) return false
  const architecture = record(model.architecture)
  const outputs = architecture?.output_modalities ?? model.output_modalities
  if (Array.isArray(outputs) && outputs.length > 0 && !outputs.includes('text')) return false
  // These APIs mix speech/image/embedding IDs into their untyped model lists.
  // Apply known provider families only; never guess from a custom model's name.
  if (providerId === 'groq' && typeof model.id === 'string'
    && /^(?:whisper-|playai-tts|canopylabs\/orpheus-)/i.test(model.id)) return false
  if (providerId === 'openai' && typeof model.id === 'string'
    && /^(?:text-embedding-|dall-e-|gpt-image-|chatgpt-image-|sora-|tts-|whisper-|omni-moderation-|text-moderation-|babbage-|davinci-)|realtime/i.test(model.id)) return false
  if (typeof model.type === 'string' && [
    'embedding', 'embeddings', 'rerank', 'reranker', 'image', 'video', 'audio',
    'text-to-image', 'image-to-image', 'text-to-speech', 'speech-to-text',
  ].includes(model.type)) return false
  return true
}

function modelIds(payload: unknown, providerId: string, nativeGemini: boolean): string[] {
  if (nativeGemini) {
    const rows = record(payload)?.models
    if (!Array.isArray(rows)) throw new ProviderModelsError('invalid-response')
    return rows.flatMap(row => {
      const model = record(row)
      if (!model || typeof model.name !== 'string' || !/^models\/.+/.test(model.name)
        || !Array.isArray(model.supportedGenerationMethods)) throw new ProviderModelsError('invalid-response')
      return model.supportedGenerationMethods.includes('generateContent') ? [model.name.slice('models/'.length)] : []
    })
  }
  // Together's native /models returns an array; the other compatible APIs wrap data.
  const rows: unknown = Array.isArray(payload) ? payload : record(payload)?.data ?? record(payload)?.models
  if (!Array.isArray(rows)) throw new ProviderModelsError('invalid-response')
  const models: string[] = []
  for (const row of rows) {
    const model = typeof row === 'string' && providerId === 'custom' ? { id: row } : record(row)
    if (model && providerId === 'custom' && typeof model.id !== 'string') {
      model.id = model.name ?? model.model
    }
    if (!model || typeof model.id !== 'string' || !model.id.trim()) {
      throw new ProviderModelsError('invalid-response')
    }
    if (supportsTextChat(model, providerId)) {
      models.push(model.id)
      if (providerId === 'xai' && Array.isArray(model.aliases)) {
        models.push(...model.aliases.filter((alias): alias is string => typeof alias === 'string' && !!alias.trim()))
      }
    }
  }
  return models
}

export async function fetchProviderModels({ providerId, endpoint, apiKey, signal }: {
  providerId: string
  endpoint: string
  apiKey: string
  signal?: AbortSignal
}): Promise<ProviderModelsResult> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const base = normalizeAiEndpoint(endpoint)
  const effectiveProvider = effectiveAiProvider({ providerId, endpoint: base })
  const provider = PROVIDERS.find(p => p.id === effectiveProvider)
  if (isRetiredAiEndpoint({ endpoint: base })) throw new ProviderModelsError('unavailable')
  const nativeGemini = effectiveProvider === 'gemini' && base === provider?.endpoint
  const nativeXai = effectiveProvider === 'xai' && base === provider?.endpoint
  const nativePerplexity = effectiveProvider === 'perplexity'
  const discoveryBase = nativePerplexity && base === 'https://api.perplexity.ai' ? `${base}/v1` : base
  // A user-supplied proxy endpoint may implement discovery even when the original does not.
  if (provider?.modelCatalog && base === provider.endpoint) {
    return { models: [...provider.modelCatalog.models], source: 'catalog', sourceUrl: provider.modelCatalog.sourceUrl, verifiedAt: provider.modelCatalog.verifiedAt }
  }
  if (!base || (!apiKey.trim() && requiresAiApiKey(providerId) && !nativePerplexity)) throw new ProviderModelsError('invalid-config')
  try {
    const parsed = new URL(base)
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('protocol')
  } catch { throw new ProviderModelsError('invalid-config') }

  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 20_000)
  try {
    const headers: Record<string, string> = effectiveProvider === 'anthropic'
      ? { 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : nativeGemini ? { 'x-goog-api-key': apiKey.trim() } : nativePerplexity ? {}
        : apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}
    const models: string[] = []
    let cursor: string | undefined
    const seenCursors = new Set<string>()
    let nextUrl: string | undefined
    const seenPages = new Set<string>()
    do {
      // The native Gemini endpoint documents pagination and supported generation
      // methods; the compatibility list does not expose the same full contract.
      const url = new URL(nextUrl ?? (nativeGemini ? `${base.replace(/\/openai$/, '')}/models` : `${discoveryBase}/${nativeXai ? 'language-models' : 'models'}`))
      if (effectiveProvider === 'anthropic') {
        url.searchParams.set('limit', '1000')
        if (cursor) url.searchParams.set('after_id', cursor)
      } else if (nativeGemini) {
        url.searchParams.set('pageSize', '1000')
        if (cursor) url.searchParams.set('pageToken', cursor)
      } else if (effectiveProvider === 'siliconflow') {
        url.searchParams.set('sub_type', 'chat')
      }
      if (seenPages.has(url.toString()) || seenPages.size >= 1000) throw new ProviderModelsError('invalid-response')
      seenPages.add(url.toString())
      const response = await aiFetch(url.toString(), { method: 'GET', headers, signal: controller.signal })
      if (timedOut) throw new ProviderModelsError('timeout')
      if (!response.ok) throw new ProviderModelsError('http', response.status)
      let payload: unknown
      try { payload = await response.json() } catch { throw new ProviderModelsError('invalid-response') }
      models.push(...modelIds(payload, effectiveProvider, nativeGemini))
      cursor = undefined
      nextUrl = undefined
      if (effectiveProvider === 'anthropic' && typeof record(payload)?.has_more !== 'boolean') {
        throw new ProviderModelsError('invalid-response')
      }
      if (effectiveProvider === 'anthropic' && record(payload)?.has_more === true) {
        const lastId = record(payload)?.last_id
        if (typeof lastId !== 'string' || !lastId) {
          throw new ProviderModelsError('invalid-response')
        }
        cursor = lastId
      }
      if (nativeGemini) {
        const nextToken = record(payload)?.nextPageToken
        if (nextToken !== undefined && typeof nextToken !== 'string') throw new ProviderModelsError('invalid-response')
        cursor = nextToken || undefined
      }
      if (!nativeGemini && effectiveProvider !== 'anthropic') {
        // Follow advertised links only on the same origin, so an untrusted list
        // cannot redirect the user's Authorization header to a different host.
        const advertisedNext = record(record(payload)?.links)?.next ?? record(payload)?.next
        if (typeof advertisedNext === 'string' && advertisedNext) {
          const next = new URL(advertisedNext, url)
          if (next.origin !== url.origin) throw new ProviderModelsError('invalid-response')
          nextUrl = next.toString()
        } else if (record(payload)?.has_more === true) {
          const lastId = record(payload)?.last_id
          if (typeof lastId !== 'string' || !lastId) throw new ProviderModelsError('invalid-response')
          const next = new URL(url)
          next.searchParams.set('after', lastId)
          nextUrl = next.toString()
        } else {
          const nextToken = record(payload)?.nextPageToken ?? record(payload)?.next_cursor
          if (nextToken !== undefined && nextToken !== null && nextToken !== '') {
            if (typeof nextToken !== 'string') throw new ProviderModelsError('invalid-response')
            const next = new URL(url)
            next.searchParams.set(record(payload)?.nextPageToken !== undefined ? 'pageToken' : 'cursor', nextToken)
            nextUrl = next.toString()
          }
        }
      }
      if (cursor) {
        if (seenCursors.has(cursor)) throw new ProviderModelsError('invalid-response')
        seenCursors.add(cursor)
      }
    } while (cursor || nextUrl)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (timedOut) throw new ProviderModelsError('timeout')
    if (models.length === 0) throw new ProviderModelsError('empty')
    return { models: [...new Set(models)].sort(), source: 'live' }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (timedOut) throw new ProviderModelsError('timeout')
    if (error instanceof ProviderModelsError) throw error
    throw new ProviderModelsError('network')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
