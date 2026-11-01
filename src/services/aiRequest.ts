import { aiFetch } from './aiTransport'
import { effectiveAiProvider, isRetiredAiEndpoint, normalizeAiEndpoint } from './aiConnection'
import { requestPerplexity } from './aiPerplexity'
import { requestAnthropicMessages } from './aiAnthropic'
import { withSpeedLadder } from './aiSpeed'
import { readAnthropicStream, readOpenAiStream, type StreamedReply } from './aiStream'
import { isExtension } from './platform'

export interface AiConnection {
  endpoint: string
  model: string
  apiKey: string
  providerId?: string
  /** Settings "speed first" toggle; undefined counts as on. */
  speedFirst?: boolean
}

export interface AiRequestOptions {
  signal?: AbortSignal
  maxOutputTokens?: number
  /** Diagnostics do not block the result page; preserve their reasoning default. */
  purpose?: 'interactive' | 'diagnostic'
}

export type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  reasoning_content?: string
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

/**
 * A system prompt whose `stable` instructions come first and per-query material
 * (web results, resolved anchors) last, so provider prompt caches reuse the prefix.
 */
export interface SplitPrompt {
  stable: string
  volatile: string
}

export function systemMessage(prompt: string | SplitPrompt): AiMessage {
  if (typeof prompt === 'string') return { role: 'system', content: prompt }
  if (!prompt.volatile) return { role: 'system', content: prompt.stable }
  return { role: 'system', content: [{ type: 'text', text: prompt.stable }, { type: 'text', text: prompt.volatile }] }
}

/** OpenAI's current token field is not universally implemented by compatible providers. */
export function usesCompletionTokenLimit(config: AiConnection): boolean {
  const provider = effectiveAiProvider(config)
  if (['openai', 'groq', 'moonshot'].includes(provider)) return true
  // Local servers may expose an arbitrary alias such as gpt-6-luna.
  try {
    if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.endpoint).hostname)) return false
  } catch { /* validated by fetch */ }
  return provider === 'custom'
    && /^(?:gpt-[5-9](?:[.-]|$)|o[134](?:-|$))/i.test(config.model)
}

function isAnthropicHost(endpoint: string): boolean {
  try { return new URL(endpoint).hostname === 'api.anthropic.com' } catch { return false }
}

/** Compatible servers do not all accept text-part arrays in system messages. */
function flattenSystem(messages: AiMessage[]): AiMessage[] {
  return messages.map(message => message.role === 'system' && typeof message.content !== 'string'
    ? { ...message, content: message.content.map(part => part.type === 'text' ? part.text : '').join('') }
    : message)
}

function validate(config: AiConnection): void {
  if (!config.model.trim()) throw Object.assign(new Error('Model is not set'), { code: 'no-model' })
  if (isRetiredAiEndpoint(config)) throw Object.assign(new Error('This provider has discontinued its API service'), { code: 'provider-unavailable' })
  if (effectiveAiProvider(config) === 'perplexity' && /^sonar(?:-|$)/i.test(config.model)) {
    throw Object.assign(new Error('Refresh the model list and choose a current Perplexity Agent model'), { code: 'refresh-model' })
  }
}

function compatibleRequest(
  config: AiConnection,
  messages: AiMessage[],
  options: AiRequestOptions,
  patch: Record<string, unknown>,
  stream: boolean,
): Promise<Response> {
  const limit = options.maxOutputTokens === undefined ? {} : {
    [usesCompletionTokenLimit(config) ? 'max_completion_tokens' : 'max_tokens']: options.maxOutputTokens,
  }
  const flat = flattenSystem(messages)
  const extra = { ...patch, ...(stream ? { stream: true } : {}) }
  // Sampling stays at provider defaults; `patch` is the speed-first reasoning step.
  const url = `${normalizeAiEndpoint(config.endpoint)}/chat/completions`
  const init: RequestInit = {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({ model: config.model.trim(), ...limit, ...extra, messages: flat }),
  }
  const response = aiFetch(url, init)
  if (effectiveAiProvider(config) !== 'custom' || options.maxOutputTokens === undefined) return response
  // Relays may implement either token field regardless of the displayed model
  // name. Retry once only when a rejected request explicitly names the other
  // field. Never retry authentication, quota, network or generation failures.
  return response.then(async result => {
    if (result.status !== 400) return result
    let detail = ''
    try {
      const payload: unknown = await result.clone().json()
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        const error = payload.error
        if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') detail = error.message
      }
    } catch { return result }
    if (!/unsupported|not supported|not allowed|unrecognized|unknown parameter/i.test(detail)
      || !/\bmax_tokens\b/.test(detail) || !/\bmax_completion_tokens\b/.test(detail)) return result
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const alternative = usesCompletionTokenLimit(config) ? 'max_tokens' : 'max_completion_tokens'
    return aiFetch(url, { ...init, body: JSON.stringify({ model: config.model.trim(), [alternative]: options.maxOutputTokens, ...extra, messages: flat }) })
  })
}

function send(config: AiConnection, messages: AiMessage[], options: AiRequestOptions, stream: boolean): Promise<Response> {
  if (isAnthropicHost(config.endpoint)) {
    const native = { ...config, endpoint: normalizeAiEndpoint(config.endpoint) }
    return withSpeedLadder(config, { ...options, speedFirst: config.speedFirst },
      patch => requestAnthropicMessages(native, messages, { ...options, stream }, patch))
  }
  return withSpeedLadder(config, { ...options, speedFirst: config.speedFirst },
    patch => compatibleRequest(config, messages, options, patch, stream))
}

/** Non-streaming completion; every provider's response is normalized to `choices`. */
export function chatCompletionRequest(
  config: AiConnection,
  messages: AiMessage[],
  options: AiRequestOptions = {},
): Promise<Response> {
  validate(config)
  if (effectiveAiProvider(config) === 'perplexity') {
    const agent = { ...config, endpoint: normalizeAiEndpoint(config.endpoint) }
    return withSpeedLadder(config, { ...options, speedFirst: config.speedFirst },
      patch => requestPerplexity(agent, messages, options, patch))
  }
  return send(config, messages, options, false)
}

/**
 * Streams reply text through `onDelta`. The extension's service-worker proxy and
 * Perplexity's Agent API answer in one piece, so they emit the full text once.
 */
export async function streamChatCompletion(
  config: AiConnection,
  messages: AiMessage[],
  onDelta: (text: string) => void,
  options: AiRequestOptions = {},
): Promise<StreamedReply> {
  validate(config)
  const canStream = !isExtension() && effectiveAiProvider(config) !== 'perplexity'
  const response = canStream ? await send(config, messages, options, true) : await chatCompletionRequest(config, messages, options)
  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI API error ${response.status}: ${err}`)
  }
  if (canStream && isAnthropicHost(config.endpoint)) return readAnthropicStream(response, onDelta)
  return readOpenAiStream(response, onDelta)
}
