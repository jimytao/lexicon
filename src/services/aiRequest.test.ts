import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const memoryStorage = vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal('localStorage', storage)
  return storage
})

import { chatCompletionRequest, streamChatCompletion } from './aiRequest'
import { __resetSpeedStepsForTests, describeSpeedPolicy, speedLadder } from './aiSpeed'
import { useSettingsStore } from '../stores/settingsStore'
import { aiFullLookup, askQuestion, testConnection } from './ai'
import { buildPhrasePromptParts } from './aiPhrasePrompt'
import {
  __resetProfileRuntimeForTests,
  DIAGNOSTIC_MAX_TOKENS,
  flushPendingProfileDiagnostics,
  getPendingEvents,
  recordAiChatEvent,
  resetProfile,
} from './profile'

const reply = (content = 'OK', finishReason = 'stop') => new Response(JSON.stringify({
  choices: [{ message: { content }, finish_reason: finishReason }],
}), { status: 200 })

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  useSettingsStore.setState({
    aiProvider: 'openai', aiEndpoint: 'https://api.openai.com/v1/',
    aiApiKeys: { openai: 'test-key' }, aiModels: { openai: 'gpt-6-luna' }, aiModel: 'gpt-6-luna',
    enableProfileDiagnostic: true,
  })
  __resetProfileRuntimeForTests()
  __resetSpeedStepsForTests()
  memoryStorage.removeItem('lexicon.aiSpeedStep.v1')
  resetProfile()
})

afterEach(() => {
  __resetProfileRuntimeForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('provider generation compatibility', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/', 'gpt-6-luna', 'max_completion_tokens'],
    ['openai', 'https://api.openai.com/v1', 'gpt-4o-mini', 'max_completion_tokens'],
    ['custom', 'https://gateway.test/v1/', 'gpt-6-luna', 'max_completion_tokens'],
    ['custom', 'https://gateway.test/v1', 'o3', 'max_completion_tokens'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-3.8-flash', 'max_tokens'],
    ['openrouter', 'https://openrouter.ai/api/v1', 'openai/gpt-6-luna', 'max_tokens'],
    ['groq', 'https://api.groq.com/openai/v1', 'llama-current', 'max_completion_tokens'],
    ['moonshot', 'https://api.moonshot.cn/v1', 'kimi-current', 'max_completion_tokens'],
    ['custom', 'http://localhost:11434/v1', 'local-model', 'max_tokens'],
  ])('builds a supported bounded request for %s / %s / %s', async (providerId, endpoint, model, limitField) => {
    const fetchMock = vi.fn(async () => reply())
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await chatCompletionRequest({ providerId, endpoint, model, apiKey: 'test-key', speedFirst: false }, [
      { role: 'system', content: 'Return JSON.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,test' } }] },
    ], { maxOutputTokens: 8192, signal: controller.signal })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(url).toBe(`${endpoint.replace(/\/+$/, '')}/chat/completions`)
    expect(init.signal).toBe(controller.signal)
    expect(body[limitField]).toBe(8192)
    const cacheKeyField = ['openai', 'openrouter'].includes(providerId) ? ['prompt_cache_key'] : []
    expect(Object.keys(body).sort()).toEqual([limitField, 'messages', 'model', ...cacheKeyField].sort())
    expect(body.messages[1].content[0].image_url.url).toContain('data:image/png')
  })

  it('sends no sampling fields or limit for unbounded requests, only the model family speed floor', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ endpoint: 'https://example.test/v1', model: 'gemini-future', apiKey: 'key' }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ model: 'gemini-future', reasoning_effort: 'minimal', messages: [] })
    await chatCompletionRequest({ endpoint: 'https://example.test/v1', model: 'unknown-model', apiKey: 'key' }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ model: 'unknown-model', messages: [] })
  })

  it('flattens split system prompts for compatible servers, stable part first', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ endpoint: 'https://example.test/v1', model: 'm', apiKey: 'key' }, [
      { role: 'system', content: [{ type: 'text', text: 'STABLE' }, { type: 'text', text: '\nWEB' }] },
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages).toEqual([{ role: 'system', content: 'STABLE\nWEB' }])
  })

  it('rejects a missing model before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(() => chatCompletionRequest({ endpoint: 'https://example.test', model: ' ', apiKey: 'key' }, []))
      .toThrow('Model is not set')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('real entry points use the provider request policy', () => {
  it('tests Luna with a completion budget that includes reasoning', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    expect(await testConnection()).toBe('OK')
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.max_completion_tokens).toBe(2048)
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('temperature')
    expect(body.reasoning_effort).toBe('none')
  })

  it('does not mark a reasoning-only or malformed response as a successful connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('', 'length')))
    await expect(testConnection()).rejects.toMatchObject({ code: 'empty-response' })
  })

  it('follow-up requests omit unsupported sampling parameters', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply('A short explanation.'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await askQuestion('word', [{ role: 'user', content: 'Why?' }])).toBe('A short explanation.')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('temperature')
  })

  it('Luna diagnostics retain the harness queue until validated JSON arrives', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply('{', 'length'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordAiChatEvent('writing', 'why?', 'explanation', 'lookup', 'out')
    const ids = getPendingEvents().map(event => event.id)
    expect(await flushPendingProfileDiagnostics('manual')).toBeNull()
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.max_completion_tokens).toBe(DIAGNOSTIC_MAX_TOKENS)
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('temperature')
    expect(getPendingEvents().map(event => event.id)).toEqual(ids)
  })

  it('keeps each provider model separate when switching providers', () => {
    const settings = useSettingsStore.getState()
    settings.setAiProvider('anthropic')
    expect(useSettingsStore.getState().aiModel).toBe('')
    settings.setAiModel('claude-sonnet-test')
    settings.setAiProvider('openai')
    expect(useSettingsStore.getState().aiModel).toBe('gpt-6-luna')
    settings.setAiProvider('anthropic')
    expect(useSettingsStore.getState().aiModel).toBe('claude-sonnet-test')
  })

  it('does not send a configured provider key to a fallback environment endpoint', async () => {
    vi.stubEnv('VITE_AI_ENDPOINT', 'https://other-provider.test/v1')
    useSettingsStore.setState({ aiEndpoint: '' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(testConnection()).rejects.toMatchObject({ code: 'no-endpoint' })
    recordAiChatEvent('writing', 'why?', 'explanation', 'lookup', 'out')
    expect(await flushPendingProfileDiagnostics('manual')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingEvents()).toHaveLength(1)
  })

  it('does not borrow an environment key when the selected provider has no key', async () => {
    vi.stubEnv('VITE_AI_API_KEY', 'another-provider-key')
    useSettingsStore.setState({ aiApiKeys: {} })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(testConnection()).rejects.toMatchObject({ code: 'no-key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes extension connection tests through the existing service worker transport', async () => {
    const sendMessage = vi.fn((_message: { url: string }, callback: (result: unknown) => void) => {
      callback({ ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) })
    })
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await testConnection()).toBe('OK')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'proxyFetch', url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
    }), expect.any(Function))
  })

  it('allows local custom inference with an empty key and omits the Authorization header', async () => {
    useSettingsStore.setState({ aiProvider: 'custom', aiEndpoint: 'http://localhost:11434/v1', aiApiKeys: {}, aiModels: { custom: 'local-model' }, aiModel: 'local-model' })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    expect(await testConnection()).toBe('OK')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBeNull()
  })

  it('does not call the retired Yi public API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(() => chatCompletionRequest({ providerId: 'yi', endpoint: 'https://api.lingyiwanwu.com/v1', model: 'yi-large', apiKey: 'old' }, []))
      .toThrow('discontinued')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires a deliberate model selection when migrating a legacy Perplexity Sonar configuration', () => {
    expect(() => chatCompletionRequest({ providerId: 'perplexity', endpoint: 'https://api.perplexity.ai', model: 'sonar-pro', apiKey: 'key' }, []))
      .toThrow('Refresh the model list')
  })

  it('uses the current Perplexity Agent API from the actual connection-test entry point', async () => {
    useSettingsStore.setState({ aiProvider: 'perplexity', aiEndpoint: 'https://api.perplexity.ai', aiApiKeys: { perplexity: 'test-key' }, aiModels: { perplexity: 'openai/gpt-current' } })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await testConnection()).toBe('OK')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.perplexity.ai/v1/agent')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).max_output_tokens).toBe(2048)
  })

  it('adapts a custom relay token field once after an explicit unsupported-parameter rejection', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'custom', endpoint: 'https://relay.example/v1', model: 'unknown-model', apiKey: 'key' }, [], { maxOutputTokens: 8192 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(first.max_tokens).toBe(8192)
    expect(second.max_completion_tokens).toBe(8192)
    expect(second).not.toHaveProperty('max_tokens')
  })

  it('does not retry authentication, quota or unrelated errors from custom servers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: { message: 'Permission denied' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await chatCompletionRequest({ providerId: 'custom', endpoint: 'https://relay.example/v1', model: 'model', apiKey: 'key' }, [], { maxOutputTokens: 8192 })
    expect(result.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('turns off foreground Luna reasoning while preserving the diagnostic default', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    const config = { providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: 'key' }
    await chatCompletionRequest(config, [{ role: 'user', content: 'Translate a word.' }])
    await chatCompletionRequest(config, [{ role: 'user', content: 'Analyze learner evidence.' }], { purpose: 'diagnostic' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).reasoning_effort).toBe('none')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('reasoning_effort')
  })

  it('starts known no-none OpenAI models at their documented floor', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-astra', apiKey: 'key' }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).reasoning_effort).toBe('low')
  })

  it('routes every official Anthropic model through native Messages with a cached system prefix', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      type: 'message', content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn',
    })))
    vi.stubGlobal('fetch', fetchMock)
    const base = { providerId: 'anthropic', endpoint: 'https://api.anthropic.com/v1', apiKey: 'key' }
    const messages = [
      { role: 'system' as const, content: [{ type: 'text' as const, text: 'STABLE' }, { type: 'text' as const, text: 'WEB' }] },
      { role: 'user' as const, content: 'Word?' },
    ]
    expect(await (await chatCompletionRequest({ ...base, model: 'claude-haiku-5-5' }, messages)).json()).toMatchObject({ choices: [{ message: { content: 'OK' } }] })
    await chatCompletionRequest({ ...base, model: 'claude-haiku-4-5-20251001' }, messages)
    await chatCompletionRequest({ ...base, model: 'claude-sonnet-5-5' }, messages)
    await chatCompletionRequest({ ...base, model: 'claude-opus-5-5' }, messages)
    await chatCompletionRequest({ ...base, model: 'claude-haiku-5-5' }, messages, { purpose: 'diagnostic', maxOutputTokens: 8192 })
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)))
    expect(fetchMock.mock.calls.every(call => call[0] === 'https://api.anthropic.com/v1/messages')).toBe(true)
    expect(bodies[0]).toMatchObject({ thinking: { type: 'disabled' }, output_config: { effort: 'low' } })
    expect(bodies[0].system).toEqual([
      { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'WEB' },
    ])
    expect(bodies[1]).not.toHaveProperty('thinking')
    expect(bodies[1]).not.toHaveProperty('output_config')
    expect(bodies[2]).toMatchObject({ thinking: { type: 'between_tools' }, output_config: { effort: 'low' } })
    expect(bodies[3]).not.toHaveProperty('thinking')
    expect(bodies[3]).toMatchObject({ output_config: { effort: 'low' } })
    expect(bodies[4]).not.toHaveProperty('thinking')
    expect(bodies[4]).not.toHaveProperty('output_config')
    expect(bodies[4].max_tokens).toBe(8192)
  })
})

describe('speed-first reasoning ladder', () => {
  it.each([
    [{ providerId: 'moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k3' }, [{ reasoning_effort: 'low' }]],
    [{ providerId: 'moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' }, [{ thinking: { type: 'disabled' } }]],
    [{ providerId: 'moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k2.7-code' }, []],
    [{ providerId: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3' }, [{ reasoning_effort: 'low' }]],
    [{ providerId: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash-250414' }, []],
    [{ providerId: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash-lite' }, [{ reasoning_effort: 'none' }]],
    [{ providerId: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3-flash' }, [{ reasoning_effort: 'minimal' }]],
    [{ providerId: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.1-pro-preview' }, [{ reasoning_effort: 'low' }]],
    [{ providerId: 'siliconflow', endpoint: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-8B' }, [{ enable_thinking: false }]],
    [{ providerId: 'perplexity', endpoint: 'https://api.perplexity.ai', model: 'openai/gpt-current' }, [{ reasoning: { effort: 'minimal' } }, { reasoning: { effort: 'low' } }]],
    [{ providerId: 'custom', endpoint: 'http://localhost:11434/v1', model: 'qwen3:8b' }, [{ reasoning_effort: 'none' }]],
    [{ providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, []],
  ])('picks the documented floor for %o', (config, ladder) => {
    expect(speedLadder(config)).toEqual(ladder)
  })

  it('steps down after an explicit rejection of the reasoning field and remembers the working level', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unsupported value: 'reasoning_effort' does not support 'none' with this model." } }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const config = { providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-5', apiKey: 'key' }
    expect((await chatCompletionRequest(config, [])).ok).toBe(true)
    await chatCompletionRequest(config, [])
    const efforts = fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).reasoning_effort)
    expect(efforts).toEqual(['none', 'minimal', 'minimal'])
    expect(JSON.parse(memoryStorage.getItem('lexicon.aiSpeedStep.v1') ?? '{}')).toEqual({ 'api.openai.com|gpt-5': 1 })
  })

  it('sends no override once every level was rejected', async () => {
    const reject = () => new Response(JSON.stringify({ error: { message: 'thinking is not supported' } }), { status: 400 })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply()).mockResolvedValueOnce(reject())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6', apiKey: 'key' }, [])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('thinking')
  })

  it('does not step down for unrelated validation errors', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: { message: 'Invalid image data' } }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await chatCompletionRequest({ providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: 'key' }, [])
    expect(result.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('respects the Settings toggle', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: 'key', speedFirst: false }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('reasoning_effort')
    useSettingsStore.setState({ aiSpeedFirst: false })
    await testConnection()
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('reasoning_effort')
  })

  it('applies the Perplexity Agent reasoning floor', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'perplexity', endpoint: 'https://api.perplexity.ai', model: 'openai/gpt-current', apiKey: 'key' }, [])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).reasoning).toEqual({ effort: 'minimal' })
  })

  it('describes the active policy for Settings', () => {
    const openai = { providerId: 'openai', endpoint: 'https://api.openai.com/v1' }
    expect(describeSpeedPolicy({ ...openai, model: 'gpt-6-luna' }, true)).toBe('reduced')
    expect(describeSpeedPolicy({ ...openai, model: 'gpt-4o-mini' }, true)).toBe('default-fast')
    expect(describeSpeedPolicy({ providerId: 'anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5' }, true)).toBe('default-fast')
    expect(describeSpeedPolicy({ providerId: 'custom', endpoint: 'https://relay.example/v1', model: 'mystery' }, true)).toBe('unknown')
    expect(describeSpeedPolicy({ ...openai, model: 'gpt-6-luna' }, false)).toBe('off')
  })
})

const sse = (events: string[]) => new Response(new ReadableStream({
  start(controller) {
    const encoder = new TextEncoder()
    // Split mid-event to exercise buffering across chunks.
    const text = events.join('')
    controller.enqueue(encoder.encode(text.slice(0, 17)))
    controller.enqueue(encoder.encode(text.slice(17)))
    controller.close()
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })

describe('streamed follow-up replies', () => {
  it('streams OpenAI-compatible deltas and keeps Kimi reasoning content', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => sse([
      'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []
    const result = await streamChatCompletion({ providerId: 'moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k3', apiKey: 'key' }, [], text => deltas.push(text))
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(result).toEqual({ content: 'Hello', reasoningContent: 'think', finishReason: 'stop' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: true, reasoning_effort: 'low' })
  })

  it('streams Anthropic native text deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
    ])))
    const deltas: string[] = []
    const result = await streamChatCompletion({ providerId: 'anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', apiKey: 'key' }, [], text => deltas.push(text))
    expect(deltas).toEqual(['Hi ', 'there'])
    expect(result).toEqual({ content: 'Hi there', finishReason: 'stop' })
  })

  it('askQuestion forwards deltas and still returns the full reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      'data: {"choices":[{"delta":{"content":"A "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"reply"}}]}\n\n',
      'data: [DONE]\n\n',
    ])))
    const deltas: string[] = []
    const answer = await askQuestion('word', [{ role: 'user', content: 'Why?' }], undefined, undefined, undefined, undefined, undefined, undefined, text => deltas.push(text))
    expect(answer).toBe('A reply')
    expect(deltas).toEqual(['A ', 'reply'])
  })

  it('uses one-piece replies in the extension, where the proxy cannot stream', async () => {
    const sendMessage = vi.fn((_message: { body?: string }, callback: (result: unknown) => void) => {
      callback({ ok: true, status: 200, body: JSON.stringify({ choices: [{ message: { content: 'Whole' } }] }) })
    })
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } })
    const deltas: string[] = []
    const result = await streamChatCompletion({ providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: 'key' }, [], text => deltas.push(text))
    expect(result.content).toBe('Whole')
    expect(deltas).toEqual(['Whole'])
    expect(JSON.parse(String(sendMessage.mock.calls[0]?.[0]?.body))).not.toHaveProperty('stream')
  })
})

describe('cache-friendly prompt layout', () => {
  it('keeps web results and the resolved anchor out of the phrase prompt prefix', () => {
    const modules = [{ id: 'examples', enabled: true }]
    const a = buildPhrasePromptParts({ modules, webSearchResults: 'WEB-A', meaningsAnchor: { correctForm: 'break the ice', senses: [] } })
    const b = buildPhrasePromptParts({ modules, webSearchResults: 'WEB-B' })
    expect(a.stable).toBe(b.stable)
    expect(a.stable).not.toContain('WEB-A')
    expect(a.volatile).toContain('ADDITIONAL CONTEXT (Web Search Results):\nWEB-A')
    expect(a.volatile).toContain('RESOLVED TARGET')
    expect(b.volatile).not.toContain('RESOLVED TARGET')
  })

  it('sends a word lookup to Claude with the stable instructions cached and web results after them', async () => {
    useSettingsStore.setState({
      aiProvider: 'anthropic', aiEndpoint: 'https://api.anthropic.com/v1',
      aiApiKeys: { anthropic: 'key' }, aiModels: { anthropic: 'claude-haiku-5-5' }, aiModel: 'claude-haiku-5-5',
    })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      type: 'message', content: [{ type: 'text', text: '{"correctForm":"ice","meanings":[],"examples":[]}' }], stop_reason: 'end_turn',
    })))
    vi.stubGlobal('fetch', fetchMock)
    await aiFullLookup('ice', true, undefined, 'lookup', { webResults: 'WEB-RESULT' })
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.system).toHaveLength(2)
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.system[0].text).not.toContain('WEB-RESULT')
    expect(body.system[1].text).toContain('WEB-RESULT')
    expect(body.system[1]).not.toHaveProperty('cache_control')
  })
})

describe('provider prompt caching', () => {
  const split = (stable: string, tail: string) => [
    { role: 'system' as const, content: [{ type: 'text' as const, text: stable }, { type: 'text' as const, text: tail }] },
    { role: 'user' as const, content: 'ice' },
  ]

  it('sends one prompt_cache_key per prompt template to OpenAI, ignoring the per-query tail', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    const config = { providerId: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-6-luna', apiKey: 'key' }
    await chatCompletionRequest(config, split('WORD TEMPLATE', 'WEB-A'))
    await chatCompletionRequest(config, split('WORD TEMPLATE', 'WEB-B'))
    await chatCompletionRequest(config, split('PHRASE TEMPLATE', 'WEB-A'))
    const keys = fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).prompt_cache_key)
    expect(keys[0]).toMatch(/^lexicon-[0-9a-f]{8}$/)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
    expect(keys[0]).not.toContain('TEMPLATE')
  })

  it.each([
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-3-flash'],
    ['openai', 'https://relay.example/v1', 'gpt-6-luna'],
    ['custom', 'http://localhost:11434/v1', 'qwen3:8b'],
  ])('does not send the cache key to %s at %s', async (providerId, endpoint, model) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId, endpoint, model, apiKey: 'key' }, split('S', 'T'))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('prompt_cache_key')
  })

  it('marks the stable system part for Claude on OpenRouter and keeps the tail after it', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-5-5', apiKey: 'key' }, split('STABLE', 'WEB'))
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'WEB' }] },
      { role: 'user', content: 'ice' },
    ])
    expect(body.prompt_cache_key).toMatch(/^lexicon-/)
  })

  it('moves the per-query tail into the user turn for Gemini on OpenRouter', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', apiKey: 'key' }, split('STABLE', '\n\nWEB'))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } }] },
      { role: 'user', content: [{ type: 'text', text: 'WEB' }, { type: 'text', text: 'ice' }] },
    ])
  })

  it('keeps plain flattened messages for other OpenRouter models', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply())
    vi.stubGlobal('fetch', fetchMock)
    await chatCompletionRequest({ providerId: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-pro', apiKey: 'key' }, split('STABLE', 'WEB'))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages[0]).toEqual({ role: 'system', content: 'STABLEWEB' })
  })
})
