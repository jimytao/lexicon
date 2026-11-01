import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAnthropicMessages } from './aiAnthropic'
import type { AiConnection, AiMessage } from './aiRequest'

const config: AiConnection = {
  providerId: 'anthropic',
  endpoint: 'https://api.anthropic.com/v1',
  apiKey: 'test-key',
  model: 'claude-haiku-5-5',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Anthropic native Messages adapter', () => {
  it('extracts system text, preserves conversation order, maps images, and uses native low-latency controls', async () => {
    const controller = new AbortController()
    const messages: AiMessage[] = [
      { role: 'system', content: 'Return JSON.' },
      { role: 'user', content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ] },
      { role: 'assistant', content: 'Previous answer.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } }] },
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'must not be surfaced' },
        { type: 'text', text: '{"ok":' },
        { type: 'text', text: 'true}' },
      ],
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 44, output_tokens: 8 },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const response = await requestAnthropicMessages(config, messages, { signal: controller.signal, maxOutputTokens: 2048 },
      { thinking: { type: 'disabled' }, output_config: { effort: 'low' } })
    const normalized = await response.json()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))

    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.signal).toBe(controller.signal)
    expect(new Headers(init.headers).get('x-api-key')).toBe('test-key')
    expect(new Headers(init.headers).get('anthropic-version')).toBe('2023-06-01')
    expect(new Headers(init.headers).get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 2048,
      system: [{ type: 'text', text: 'Return JSON.', cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: [
          { type: 'text', text: 'Describe this image.' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ] },
        { role: 'assistant', content: 'Previous answer.' },
        { role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.test/image.jpg' } }] },
      ],
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    })
    expect(normalized).toEqual({
      choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 44,
        completion_tokens: 8,
        total_tokens: 52,
        input_tokens: 44,
        output_tokens: 8,
      },
    })
    expect(JSON.stringify(normalized)).not.toContain('must not be surfaced')
  })

  it('defaults max_tokens to 16000 and maps token-limit stops to length while keeping usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: '{"partial":' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 5, output_tokens: 8192 },
    }))))
    const response = await requestAnthropicMessages(config, [{ role: 'user', content: 'Return JSON.' }])
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({ max_tokens: 16000 })
    expect(await response.json()).toMatchObject({
      choices: [{ message: { content: '{"partial":' }, finish_reason: 'length' }],
      usage: { input_tokens: 5, output_tokens: 8192, total_tokens: 8197 },
    })
  })

  it('honors an explicit zero budget and maps refusal without exposing non-text blocks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: 'I cannot help with that.' }, { type: 'redacted_thinking', data: 'hidden' }],
      stop_reason: 'refusal',
      usage: { input_tokens: 2, output_tokens: 5 },
    }))))
    const response = await requestAnthropicMessages(config, [{ role: 'user', content: 'Hi' }], { maxOutputTokens: 0 })
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({ max_tokens: 0 })
    expect(await response.json()).toMatchObject({
      choices: [{ message: { content: 'I cannot help with that.' }, finish_reason: 'content_filter' }],
    })
  })

  it('rejects empty, invalid, or unsupported requests instead of fabricating an answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      type: 'message', content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 0 },
    }))))
    await expect(requestAnthropicMessages(config, [{ role: 'user', content: 'Hi' }])).rejects.toThrow('empty response')

    const nextFetch = vi.fn()
    vi.stubGlobal('fetch', nextFetch)
    await expect(requestAnthropicMessages({ ...config, apiKey: ' ' }, [])).rejects.toMatchObject({ code: 'no-key' })
    expect(nextFetch).not.toHaveBeenCalled()
  })

  it('preserves HTTP errors and rejects invalid image and system image input before fetch', async () => {
    const errorResponse = new Response(JSON.stringify({ type: 'error', error: { message: 'Unauthorized' } }), { status: 401 })
    const fetchMock = vi.fn(async () => errorResponse)
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestAnthropicMessages(config, [{ role: 'user', content: 'Hi' }])).resolves.toBe(errorResponse)

    const nextFetch = vi.fn()
    vi.stubGlobal('fetch', nextFetch)
    await expect(requestAnthropicMessages(config, [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://example.test/image.jpg' } }] }]))
      .rejects.toThrow('HTTPS URL')
    await expect(requestAnthropicMessages(config, [{ role: 'system', content: [{ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } }] }]))
      .rejects.toThrow('text only')
    expect(nextFetch).not.toHaveBeenCalled()
  })
})
