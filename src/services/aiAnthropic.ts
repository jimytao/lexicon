import { aiFetch } from './aiTransport'
import type { AiConnection, AiMessage } from './aiRequest'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function anthropicMessagesUrl(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Anthropic endpoint is not configured')
  if (/\/v1\/messages$/i.test(base)) return base
  if (/\/v1$/i.test(base)) return `${base}/messages`
  return `${base}/v1/messages`
}

function imageBlock(url: string): JsonRecord {
  const value = url.trim()
  const dataImage = /^data:(image\/(?:jpeg|png|gif|webp));base64,([\s\S]+)$/i.exec(value)
  if (dataImage) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: dataImage[1].toLowerCase(), data: dataImage[2] },
    }
  }
  if (/^https:\/\//i.test(value)) {
    return { type: 'image', source: { type: 'url', url: value } }
  }
  throw new Error('Anthropic image input must be an HTTPS URL or a supported base64 image data URL')
}

function toContent(content: AiMessage['content']): string | JsonRecord[] {
  if (typeof content === 'string') return content
  return content.map((part) => part.type === 'text'
    ? { type: 'text', text: part.text }
    : imageBlock(part.image_url.url))
}

type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/**
 * System text becomes blocks with one cache breakpoint on the first block: callers
 * put the stable instructions first and per-query material (web results, resolved
 * anchors) in a later text part, so the stable prefix is reused across lookups.
 * Prefixes under the model's minimum silently skip caching.
 */
function toSystemContent(messages: AiMessage[]): { system?: SystemBlock[]; messages: Array<JsonRecord> } {
  const blocks: SystemBlock[] = []
  for (const message of messages) {
    if (message.role !== 'system') continue
    const parts = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content
    for (const part of parts) {
      if (part.type !== 'text') throw new Error('Anthropic system instructions must contain text only')
      if (part.text.length > 0) blocks.push({ type: 'text', text: part.text })
    }
  }
  if (blocks.length > 0) blocks[0] = { ...blocks[0], cache_control: { type: 'ephemeral' } }
  const nonSystemMessages = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role, content: toContent(message.content) }))
  return { ...(blocks.length > 0 ? { system: blocks } : {}), messages: nonSystemMessages }
}

function normalizeMessage(payload: unknown): JsonRecord {
  if (!isRecord(payload) || payload.type !== 'message' || !Array.isArray(payload.content)) {
    throw new Error('Anthropic Messages API returned an invalid response')
  }

  const text = payload.content
    .filter((block): block is JsonRecord => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
  const stopReason = payload.stop_reason
  if (stopReason === 'refusal' && !text.trim()) {
    throw new Error('Anthropic Messages API returned an empty refusal')
  }
  if (!text.trim() && stopReason !== 'max_tokens') {
    throw new Error('Anthropic Messages API returned an empty response')
  }

  const finishReason = stopReason === 'max_tokens'
    ? 'length'
    : stopReason === 'refusal' ? 'content_filter' : 'stop'
  const usage = isRecord(payload.usage) ? payload.usage : undefined
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : undefined
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : undefined

  return {
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: finishReason }],
    ...(inputTokens === undefined || outputTokens === undefined ? {} : {
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    }),
  }
}

export interface AnthropicRequestOptions {
  signal?: AbortSignal
  maxOutputTokens?: number
  stream?: boolean
}

/**
 * Native Messages API for every model on api.anthropic.com: the OpenAI
 * compatibility layer ignores reasoning controls and cannot mark cache
 * breakpoints. `patch` carries the speed-first thinking / effort fields.
 * Streaming responses are returned raw (SSE) for the caller to parse.
 */
export async function requestAnthropicMessages(
  config: AiConnection,
  messages: AiMessage[],
  options: AnthropicRequestOptions = {},
  patch: Record<string, unknown> = {},
): Promise<Response> {
  const model = config.model.trim()
  if (!config.apiKey.trim()) {
    throw Object.assign(new Error('Anthropic API key is not set'), { code: 'no-key' })
  }

  const normalized = toSystemContent(messages)
  const response = await aiFetch(anthropicMessagesUrl(config.endpoint), {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxOutputTokens ?? 16000,
      ...normalized,
      ...patch,
      ...(options.stream ? { stream: true } : {}),
    }),
  })

  if (!response.ok || options.stream) return response

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Anthropic Messages API returned invalid JSON')
  }
  const normalizedPayload = normalizeMessage(payload)
  return new Response(JSON.stringify(normalizedPayload), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}
