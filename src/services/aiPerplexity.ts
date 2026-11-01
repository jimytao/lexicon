import { aiFetch } from './aiTransport'
import type { AiConnection, AiMessage } from './aiRequest'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function versionedBase(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Perplexity endpoint is not configured')
  return /\/v1$/i.test(base) ? base : `${base}/v1`
}

function toInputContent(content: AiMessage['content']): string | Array<JsonRecord> {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return { type: 'input_text', text: part.text }

    const imageUrl = part.image_url.url.trim()
    if (!imageUrl) throw new Error('Perplexity image input is empty')
    // The app stores captured images as data URLs. Accept raw base64 too, so
    // image parts remain valid if an upstream caller omitted the data URL prefix.
    const normalizedUrl = imageUrl.startsWith('data:') || /^https?:\/\//i.test(imageUrl)
      ? imageUrl
      : `data:image/jpeg;base64,${imageUrl}`
    return { type: 'input_image', image_url: normalizedUrl }
  })
}

function normalizeOutput(payload: unknown): JsonRecord {
  if (!isRecord(payload) || typeof payload.status !== 'string' || !Array.isArray(payload.output)) {
    throw new Error('Perplexity Agent API returned an invalid response')
  }

  if (payload.status === 'failed' || payload.status === 'cancelled') {
    const apiError = isRecord(payload.error) && typeof payload.error.message === 'string'
      ? payload.error.message
      : `request status: ${payload.status}`
    throw new Error(`Perplexity Agent API ${apiError}`)
  }

  if (payload.status !== 'completed' && payload.status !== 'incomplete') {
    throw new Error(`Perplexity Agent API returned unsupported status: ${payload.status}`)
  }

  const outputText: string[] = []
  let refusal = false
  for (const item of payload.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (!isRecord(content)) continue
      if (content.type === 'output_text' && typeof content.text === 'string') outputText.push(content.text)
      if (content.type === 'refusal' || typeof content.refusal === 'string') refusal = true
    }
  }

  if (refusal) throw new Error('Perplexity Agent API refused the request')

  const content = outputText.join('')
  const details = isRecord(payload.incomplete_details) ? payload.incomplete_details : undefined
  const finishReason = payload.status === 'completed'
    ? 'stop'
    : details?.reason === 'max_output_tokens' ? 'length' : 'incomplete'

  // A token-limit response may legitimately have no text. Keep the length
  // signal so profile diagnostics can retain their queued evidence. A completed
  // response without answer text is a protocol failure, not a successful reply.
  if (payload.status === 'completed' && !content.trim()) {
    throw new Error('Perplexity Agent API returned an empty response')
  }
  if (payload.status === 'incomplete' && !content.trim() && finishReason !== 'length') {
    throw new Error('Perplexity Agent API returned an incomplete response without answer text')
  }

  return {
    choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
  }
}

/** Lists the complete live Agent API model catalog; the endpoint is public and has no paging contract. */
export async function fetchPerplexityModels({ endpoint, apiKey: _apiKey, signal }: {
  endpoint: string
  apiKey: string
  signal?: AbortSignal
}): Promise<string[]> {
  const response = await aiFetch(`${versionedBase(endpoint)}/models`, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Perplexity model discovery failed (${response.status})`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Perplexity model discovery returned invalid JSON')
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Perplexity model discovery returned an invalid response')
  }

  const models = payload.data.map((row) => {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id.trim()) {
      throw new Error('Perplexity model discovery returned an invalid model entry')
    }
    return row.id.trim()
  })
  if (models.length === 0) throw new Error('Perplexity model discovery returned no models')
  return [...new Set(models)].sort()
}

/** Calls the Agent API and adapts its typed Responses output to chat-completion consumers. */
export async function requestPerplexity(
  config: AiConnection,
  messages: AiMessage[],
  options: { signal?: AbortSignal; maxOutputTokens?: number } = {},
  patch: Record<string, unknown> = {},
): Promise<Response> {
  const model = config.model.trim()
  if (!model) throw Object.assign(new Error('Model is not set'), { code: 'no-model' })
  // Unlike the other Agent backends, Anthropic requires an explicit output cap.
  // Keep the same room as the app's bounded diagnostics when callers omit one.
  const maxOutputTokens = options.maxOutputTokens ?? (/^anthropic\//i.test(model) ? 8192 : undefined)

  const input = messages.map((message) => ({
    type: 'message',
    role: message.role,
    content: toInputContent(message.content),
  }))

  const response = await aiFetch(`${versionedBase(config.endpoint)}/agent`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      tools: [],
      tool_choice: 'none',
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...patch,
    }),
  })

  // Preserve native error responses so the caller keeps the original HTTP status
  // and body. A 2xx status is not enough: Agent errors/partial results are also
  // encoded in the response JSON status field.
  if (!response.ok) return response

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Perplexity Agent API returned invalid JSON')
  }
  const normalized = normalizeOutput(payload)
  return new Response(JSON.stringify(normalized), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}
