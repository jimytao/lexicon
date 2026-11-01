/** Server-sent-event readers for streamed chat replies (OpenAI-compatible and Anthropic native). */

export interface StreamedReply {
  content: string
  reasoningContent?: string
  finishReason?: string
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function* sseEvents(response: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const parse = (raw: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    return data.length > 0 ? { event, data: data.join('\n') } : null
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      for (let match = /\r?\n\r?\n/.exec(buffer); match; match = /\r?\n\r?\n/.exec(buffer)) {
        const parsed = parse(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
        if (parsed) yield parsed
      }
      if (done) break
    }
    const tail = parse(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function isEventStream(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').includes('text/event-stream')
}

/** A relay may ignore `stream: true`; then the body is a normal completion. */
async function readCompletionJson(response: Response, onDelta: (text: string) => void): Promise<StreamedReply> {
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string; reasoning_content?: unknown }; finish_reason?: string }> }
  const choice = data.choices?.[0]
  const content = choice?.message?.content ?? ''
  if (content) onDelta(content)
  return {
    content,
    ...(typeof choice?.message?.reasoning_content === 'string' ? { reasoningContent: choice.message.reasoning_content } : {}),
    ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
  }
}

export async function readOpenAiStream(response: Response, onDelta: (text: string) => void): Promise<StreamedReply> {
  if (!isEventStream(response)) return readCompletionJson(response, onDelta)
  let content = ''
  let reasoning: string | undefined
  let finishReason: string | undefined
  for await (const { data } of sseEvents(response)) {
    if (data === '[DONE]') break
    let payload: unknown
    try { payload = JSON.parse(data) } catch { continue }
    if (!isRecord(payload)) continue
    if (isRecord(payload.error)) throw new Error(`AI API error: ${String(payload.error.message ?? 'stream error')}`)
    const choice = Array.isArray(payload.choices) && isRecord(payload.choices[0]) ? payload.choices[0] : undefined
    const delta = isRecord(choice?.delta) ? choice.delta : undefined
    if (typeof delta?.content === 'string' && delta.content) {
      content += delta.content
      onDelta(delta.content)
    }
    if (typeof delta?.reasoning_content === 'string') reasoning = (reasoning ?? '') + delta.reasoning_content
    if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
  }
  return { content, ...(reasoning === undefined ? {} : { reasoningContent: reasoning }), ...(finishReason ? { finishReason } : {}) }
}

export async function readAnthropicStream(response: Response, onDelta: (text: string) => void): Promise<StreamedReply> {
  let content = ''
  let stopReason: string | undefined
  for await (const { event, data } of sseEvents(response)) {
    let payload: unknown
    try { payload = JSON.parse(data) } catch { continue }
    if (!isRecord(payload)) continue
    if (event === 'error' || payload.type === 'error') {
      const error = isRecord(payload.error) ? payload.error : {}
      throw new Error(`Anthropic API error: ${String(error.message ?? 'stream error')}`)
    }
    if (payload.type === 'content_block_delta' && isRecord(payload.delta)
      && payload.delta.type === 'text_delta' && typeof payload.delta.text === 'string') {
      content += payload.delta.text
      onDelta(payload.delta.text)
    }
    if (payload.type === 'message_delta' && isRecord(payload.delta) && typeof payload.delta.stop_reason === 'string') {
      stopReason = payload.delta.stop_reason
    }
  }
  if (stopReason === 'refusal' && !content.trim()) throw new Error('Anthropic Messages API returned an empty refusal')
  const finishReason = stopReason === 'max_tokens' ? 'length' : stopReason === 'refusal' ? 'content_filter' : 'stop'
  return { content, finishReason }
}
