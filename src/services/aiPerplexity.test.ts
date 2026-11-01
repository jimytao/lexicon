import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPerplexityModels, requestPerplexity } from './aiPerplexity'
import type { AiConnection, AiMessage } from './aiRequest'

const config: AiConnection = {
  providerId: 'perplexity',
  endpoint: 'https://api.perplexity.ai/v1/',
  apiKey: 'test-key',
  model: 'openai/gpt-test',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Perplexity Agent API model discovery', () => {
  it('fetches the complete live catalog with an already-versioned endpoint', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      data: [{ id: 'xai/grok-test' }, { id: 'openai/gpt-test' }, { id: 'openai/gpt-test' }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPerplexityModels({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      signal: controller.signal,
    })).resolves.toEqual(['openai/gpt-test', 'xai/grok-test'])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.perplexity.ai/v1/models')
    expect(init.method).toBe('GET')
    expect(init.signal).toBe(controller.signal)
    expect(new Headers(init.headers).get('authorization')).toBeNull()
  })

  it('adds /v1 when passed the legacy root endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'sonar' }] }))))
    await fetchPerplexityModels({ endpoint: 'https://api.perplexity.ai', apiKey: 'unused' })
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://api.perplexity.ai/v1/models')
  })

  it('rejects malformed or empty catalogs instead of silently falling back to Sonar IDs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }))))
    await expect(fetchPerplexityModels({ endpoint: config.endpoint, apiKey: config.apiKey }))
      .rejects.toThrow('no models')
  })
})

describe('Perplexity Agent API request adapter', () => {
  it('supplies the mandatory Anthropic output budget for ordinary lookup requests', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer' }] }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    await requestPerplexity({ ...config, model: 'anthropic/claude-current' }, [{ role: 'user', content: 'Word?' }])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).max_output_tokens).toBe(8192)
  })
  it('preserves message roles, converts images, applies output budget and normalizes response text', async () => {
    const controller = new AbortController()
    const messages: AiMessage[] = [
      { role: 'system', content: 'Return JSON.' },
      { role: 'user', content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ] },
      { role: 'assistant', content: 'Previous answer.' },
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: '{"ok":' }, { type: 'output_text', text: 'true}' }] },
      ],
    })))
    vi.stubGlobal('fetch', fetchMock)

    const response = await requestPerplexity(config, messages, { signal: controller.signal, maxOutputTokens: 1024 })
    const normalized = await response.json()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))

    expect(url).toBe('https://api.perplexity.ai/v1/agent')
    expect(init.signal).toBe(controller.signal)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key')
    expect(body).toEqual({
      model: 'openai/gpt-test',
      max_output_tokens: 1024,
      tools: [],
      tool_choice: 'none',
      input: [
        { type: 'message', role: 'system', content: 'Return JSON.' },
        { type: 'message', role: 'user', content: [
          { type: 'input_text', text: 'Describe this image.' },
          { type: 'input_image', image_url: 'data:image/png;base64,abc123' },
        ] },
        { type: 'message', role: 'assistant', content: 'Previous answer.' },
      ],
    })
    expect(normalized).toEqual({
      choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
    })
  })

  it('keeps the length finish reason for max-output-token truncation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"partial":' }] }],
    }))))

    const response = await requestPerplexity(config, [{ role: 'user', content: 'Return JSON.' }])
    expect(await response.json()).toEqual({
      choices: [{ message: { role: 'assistant', content: '{"partial":' }, finish_reason: 'length' }],
    })
  })

  it('retains a token-limit finish reason when the provider returns no text, but rejects other empty partials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    }))))
    const response = await requestPerplexity(config, [{ role: 'user', content: 'Return JSON.' }])
    expect(await response.json()).toEqual({
      choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'incomplete',
      incomplete_details: { reason: 'other' },
      output: [],
    }))))
    await expect(requestPerplexity(config, [{ role: 'user', content: 'Return JSON.' }])).rejects.toThrow('without answer text')
  })

  it.each([
    ['failed', { message: 'Model unavailable' }, []],
    ['completed', null, []],
    ['completed', null, [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot help.' }] }]],
  ])('does not convert failed, empty, or refused responses into success', async (status, error, output) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status, error, output }))))
    await expect(requestPerplexity(config, [{ role: 'user', content: 'Hi' }])).rejects.toThrow()
  })

  it('preserves non-2xx error responses and rejects a missing model before fetch', async () => {
    const errorResponse = new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 })
    const fetchMock = vi.fn(async () => errorResponse)
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestPerplexity(config, [{ role: 'user', content: 'Hi' }])).resolves.toBe(errorResponse)

    const nextFetch = vi.fn()
    vi.stubGlobal('fetch', nextFetch)
    await expect(requestPerplexity({ ...config, model: ' ' }, [])).rejects.toMatchObject({ code: 'no-model' })
    expect(nextFetch).not.toHaveBeenCalled()
  })
})
