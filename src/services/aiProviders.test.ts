import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiFetch } from './aiTransport'
import { PROVIDERS, fetchProviderModels } from './aiProviders'

vi.mock('./aiTransport', () => ({ aiFetch: vi.fn() }))
const request = vi.mocked(aiFetch)
const config = { providerId: 'gemini', endpoint: 'https://proxy.example/v1', apiKey: 'test-key' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => { request.mockReset() })
afterEach(() => vi.useRealTimers())

describe('provider model discovery contracts', () => {
  it.each(PROVIDERS.filter(p => !['gemini', 'anthropic', 'perplexity', 'together', 'siliconflow', 'custom', 'zhipu', 'yi', 'xai'].includes(p.id)))(
    '$id queries its current endpoint rather than a bundled model list', async provider => {
      request.mockResolvedValue(json({ data: [{ id: 'future-vision-model' }] }))
      expect(await fetchProviderModels({ providerId: provider.id, endpoint: `${provider.endpoint}/`, apiKey: 'test-key' }))
        .toEqual({ models: ['future-vision-model'], source: 'live' })
      expect(request).toHaveBeenCalledWith(`${provider.endpoint}/models`, expect.objectContaining({
        method: 'GET', headers: { Authorization: 'Bearer test-key' }, signal: expect.any(AbortSignal),
      }))
    },
  )

  it('uses native Gemini discovery to paginate all generateContent models', async () => {
    request
      .mockResolvedValueOnce(json({ models: [
        { name: 'models/gemini-new', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
      ], nextPageToken: 'next/a' }))
      .mockResolvedValueOnce(json({ models: [
        { name: 'models/future-vision', supportedGenerationMethods: ['generateContent'] },
      ] }))
    expect(await fetchProviderModels({ ...config, endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/' }))
      .toEqual({ models: ['future-vision', 'gemini-new'], source: 'live' })
    expect(request.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    expect(request.mock.calls[0][1]?.headers).toEqual({ 'x-goog-api-key': 'test-key' })
    expect(request.mock.calls[1][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next%2Fa')
  })

  it('keeps Gemini proxy discovery OpenAI-compatible', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'gemini-current' }] }))
    expect((await fetchProviderModels(config)).models).toEqual(['gemini-current'])
    expect(request.mock.calls[0][0]).toBe('https://proxy.example/v1/models')
    expect(request.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer test-key' })
  })

  it('rejects a malformed Gemini next page token', async () => {
    request.mockResolvedValue(json({ models: [], nextPageToken: 1 }))
    await expect(fetchProviderModels({ ...config, endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' }))
      .rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('queries custom endpoints and preserves arbitrary model IDs while sorting and deduplicating', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'z/new-vision' }, { id: 'a-instruct' }, { id: 'a-instruct' }] }))
    const result = await fetchProviderModels({ providerId: 'custom', endpoint: 'http://localhost:1234/v1///', apiKey: ' local ' })
    expect(result.models).toEqual(['a-instruct', 'z/new-vision'])
    expect(request.mock.calls[0][0]).toBe('http://localhost:1234/v1/models')
    expect(request.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer local' })
  })

  it('uses Anthropic native authentication and follows every pagination cursor', async () => {
    request
      .mockResolvedValueOnce(json({ data: [{ id: 'claude-new' }], has_more: true, last_id: 'cursor/a' }))
      .mockResolvedValueOnce(json({ data: [{ id: 'claude-other' }], has_more: false, last_id: 'claude-other' }))
    expect(await fetchProviderModels({ providerId: 'anthropic', endpoint: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test' }))
      .toEqual({ models: ['claude-new', 'claude-other'], source: 'live' })
    const [firstUrl, init] = request.mock.calls[0]
    expect(firstUrl).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(init?.headers).toEqual({
      'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
    })
    expect(request.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/models?limit=1000&after_id=cursor%2Fa')
  })

  it('does not show a partial Anthropic catalog when another page fails', async () => {
    request
      .mockResolvedValueOnce(json({ data: [{ id: 'claude-new' }], has_more: true, last_id: 'claude-new' }))
      .mockResolvedValueOnce(json({ error: 'denied' }, 403))
    await expect(fetchProviderModels({ ...config, providerId: 'anthropic' })).rejects.toMatchObject({ code: 'http', status: 403 })
  })

  it.each([
    { data: [{ id: 'claude-new' }], has_more: true, last_id: null },
    { data: [{ id: 'claude-new' }], has_more: 'true' },
  ])('rejects invalid Anthropic pagination instead of silently truncating', async body => {
    request.mockResolvedValue(json(body))
    await expect(fetchProviderModels({ ...config, providerId: 'anthropic' })).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('rejects repeated pagination cursors', async () => {
    request.mockImplementation(async () => json({ data: [{ id: 'claude-new' }], has_more: true, last_id: 'same' }))
    await expect(fetchProviderModels({ ...config, providerId: 'anthropic' })).rejects.toMatchObject({ code: 'invalid-response' })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('accepts Together native arrays and filters explicitly non-chat model metadata', async () => {
    request.mockResolvedValue(json([
      { id: 'vision-language', type: 'chat' }, { id: 'emb', type: 'embedding' }, { id: 'unknown-new' },
    ]))
    expect((await fetchProviderModels({ ...config, providerId: 'together' })).models).toEqual(['unknown-new', 'vision-language'])
  })

  it('asks SiliconFlow for chat models using its documented subtype parameter', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'chat-model' }] }))
    await fetchProviderModels({ providerId: 'siliconflow', endpoint: 'https://api.siliconflow.cn/v1', apiKey: 'key' })
    expect(request.mock.calls[0][0]).toBe('https://api.siliconflow.cn/v1/models?sub_type=chat')
  })

  it('keeps vision and unknown models, filtering only explicitly incompatible metadata', async () => {
    request.mockResolvedValue(json({ data: [
      { id: 'understands-images', architecture: { input_modalities: ['image'], output_modalities: ['text'] } },
      { id: 'custom-image-name-chat' }, { id: 'emb', capabilities: { completion_chat: false } },
      { id: 'image-output', output_modalities: ['image'] },
    ] }))
    expect((await fetchProviderModels(config)).models).toEqual(['custom-image-name-chat', 'understands-images'])
  })

  it('discovers current Perplexity Agent models from the public list, including legacy root configurations', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'openai/gpt-current' }] }))
    expect(await fetchProviderModels({ providerId: 'perplexity', endpoint: 'https://api.perplexity.ai/', apiKey: '' }))
      .toEqual({ models: ['openai/gpt-current'], source: 'live' })
    expect(request.mock.calls[0][0]).toBe('https://api.perplexity.ai/v1/models')
    expect(request.mock.calls[0][1]?.headers).toEqual({})
  })

  it('queries a Perplexity proxy endpoint and never substitutes the official catalog after an auth failure', async () => {
    request.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    await expect(fetchProviderModels({ providerId: 'perplexity', endpoint: 'https://proxy.example/v1', apiKey: 'bad' }))
      .rejects.toMatchObject({ code: 'http', status: 401 })
    expect(request.mock.calls[0][0]).toBe('https://proxy.example/v1/models')
  })

  it.each([401, 403, 404, 405, 429, 500])('preserves HTTP %i rather than hiding it behind a static list', async status => {
    request.mockResolvedValue(json({ error: { message: 'server detail' } }, status))
    await expect(fetchProviderModels(config)).rejects.toMatchObject({ code: 'http', status })
  })

  it.each([{}, { data: 'wrong' }, { data: [null] }, { data: [{ id: 42 }] }, { data: [{ id: '' }] }])(
    'rejects malformed successful responses', async body => {
      request.mockResolvedValue(json(body))
      await expect(fetchProviderModels(config)).rejects.toMatchObject({ code: 'invalid-response' })
    },
  )

  it('distinguishes an empty list from success', async () => {
    request.mockResolvedValue(json({ data: [] }))
    await expect(fetchProviderModels(config)).rejects.toMatchObject({ code: 'empty' })
  })

  it('reports network failures without exposing credentials from an error string', async () => {
    request.mockRejectedValue(new TypeError('Fetch failed: test-key'))
    await expect(fetchProviderModels(config)).rejects.toMatchObject({ code: 'network', message: 'network' })
  })

  it('does not start a request when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchProviderModels({ ...config, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
  })

  it('forwards cancellation to the shared transport and discards even a late success', async () => {
    const controller = new AbortController()
    let finish!: (response: Response) => void
    request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = fetchProviderModels({ ...config, signal: controller.signal })
    controller.abort()
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true)
    finish(json({ data: [{ id: 'late-model' }] }))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports timeout distinctly from a caller cancellation', async () => {
    vi.useFakeTimers()
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const pending = fetchProviderModels(config)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(20_000)
    await rejected
  })

  it('returns a dated, explicitly non-live GLM catalog instead of guessing an undocumented /models API', async () => {
    const result = await fetchProviderModels({ providerId: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '' })
    expect(result.source).toBe('catalog')
    expect(result.verifiedAt).toBe('2026-11-01')
    expect(result.models).toContain('glm-5.3')
    expect(result.sourceUrl).toContain('docs.bigmodel.cn')
    expect(request).not.toHaveBeenCalled()
  })

  it('blocks the discontinued Yi public endpoint while leaving third-party Yi hosting available', async () => {
    await expect(fetchProviderModels({ providerId: 'yi', endpoint: 'https://api.lingyiwanwu.com/v1', apiKey: 'old' }))
      .rejects.toMatchObject({ code: 'unavailable' })
    expect(request).not.toHaveBeenCalled()
    request.mockResolvedValue(json({ data: [{ id: 'yi-third-party' }] }))
    expect((await fetchProviderModels({ providerId: 'custom', endpoint: 'https://gateway.example/v1', apiKey: 'key' })).models)
      .toEqual(['yi-third-party'])
  })

  it('discovers xAI language models and their aliases with text output', async () => {
    request.mockResolvedValue(json({ models: [
      { id: 'grok-current', output_modalities: ['text'], aliases: ['grok-latest'] },
      { id: 'image-only', output_modalities: ['image'] },
    ] }))
    expect((await fetchProviderModels({ providerId: 'xai', endpoint: 'https://api.x.ai/v1', apiKey: 'key' })).models)
      .toEqual(['grok-current', 'grok-latest'])
    expect(request.mock.calls[0][0]).toBe('https://api.x.ai/v1/language-models')
  })

  it('accepts both Mistral list formats and removes archived and non-chat entries', async () => {
    const rows = [
      { id: 'mistral-current', capabilities: { completion_chat: true } },
      { id: 'archived-chat', archived: true },
      { id: 'embed', capabilities: { completion_chat: false } },
    ]
    for (const payload of [rows, { data: rows }]) {
      request.mockResolvedValue(json(payload))
      expect((await fetchProviderModels({ providerId: 'mistral', endpoint: 'https://api.mistral.ai/v1', apiKey: 'key' })).models)
        .toEqual(['mistral-current'])
    }
  })

  it('does not list Groq speech-only or inactive models as chat choices', async () => {
    request.mockResolvedValue(json({ data: [
      { id: 'llama-current' }, { id: 'whisper-large-v3' },
      { id: 'canopylabs/orpheus-v1-english' }, { id: 'inactive', active: false },
    ] }))
    expect((await fetchProviderModels({ providerId: 'groq', endpoint: 'https://api.groq.com/openai/v1', apiKey: 'key' })).models)
      .toEqual(['llama-current'])
  })

  it('accepts keyless custom servers and normalizes a pasted chat endpoint', async () => {
    request.mockResolvedValue(json(['local-model']))
    expect((await fetchProviderModels({ providerId: 'custom', endpoint: 'http://localhost:11434/v1/chat/completions/', apiKey: '' })).models)
      .toEqual(['local-model'])
    expect(request.mock.calls[0][0]).toBe('http://localhost:11434/v1/models')
    expect(request.mock.calls[0][1]?.headers).toEqual({})
  })

  it('accepts custom model wrappers without applying provider name heuristics', async () => {
    request.mockResolvedValue(json({ models: [{ name: 'my-realtime-chat' }, { model: 'my-image-name-chat' }] }))
    expect((await fetchProviderModels({ providerId: 'custom', endpoint: 'https://custom.example/v1', apiKey: '' })).models)
      .toEqual(['my-image-name-chat', 'my-realtime-chat'])
  })

  it('follows advertised same-origin pages to return the full custom list', async () => {
    request.mockResolvedValueOnce(json({ data: [{ id: 'first' }], links: { next: '?page=2' } }))
      .mockResolvedValueOnce(json({ data: [{ id: 'last' }] }))
    expect((await fetchProviderModels({ providerId: 'custom', endpoint: 'https://custom.example/v1', apiKey: 'key' })).models)
      .toEqual(['first', 'last'])
    expect(request.mock.calls[1][0]).toBe('https://custom.example/v1/models?page=2')
  })

  it('rejects cross-origin pagination without sending the key to the advertised host', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'first' }], next: 'https://untrusted.example/models' }))
    await expect(fetchProviderModels({ providerId: 'custom', endpoint: 'https://custom.example/v1', apiKey: 'key' }))
      .rejects.toMatchObject({ code: 'invalid-response' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not report a partial list when a provider advertises more data without a cursor', async () => {
    request.mockResolvedValue(json({ data: [{ id: 'first' }], has_more: true }))
    await expect(fetchProviderModels({ providerId: 'custom', endpoint: 'https://custom.example/v1', apiKey: '' }))
      .rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('does not offer batch-only and non-chat models when the provider explicitly advertises endpoint support', async () => {
    request.mockResolvedValue(json({ data: [
      { id: 'normal-chat', endpoints: ['/api/v1/chat/completions', '/api/v1/responses'] },
      { id: 'batch-only', endpoints: [] },
      { id: 'embedding', supported_endpoints: ['/v1/embeddings'] },
    ] }))
    expect((await fetchProviderModels({ providerId: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', apiKey: 'key' })).models)
      .toEqual(['normal-chat'])
  })
})
