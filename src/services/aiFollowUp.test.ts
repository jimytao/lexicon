/** Follow-up chat must see the AI's own fix even when rich context is off. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', storage)
})

import { useSettingsStore } from '../stores/settingsStore'
import { askQuestion } from './ai'
import { buildChatCorrectionContext } from '../utils/chatCorrectionContext'
import type { ChatMessage } from '../types'

function mockReply(message: { content: string; reasoning_content?: unknown } = { content: 'ok' }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify({ choices: [{ message }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function systemPromptOf(fetchMock: ReturnType<typeof mockReply>): string {
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { messages: Array<{ role: string; content: string }> }
  return body.messages[0].content
}

const correction = buildChatCorrectionContext({
  original: 'I very like it',
  correctForm: 'I really like it',
  correctionNote: '"very" cannot modify a verb.',
  nativeForm: "I'm really into it",
  nativeRationale: '"into" sounds casual and natural.',
}) ?? ''

beforeEach(() => {
  useSettingsStore.setState({
    aiProvider: 'test',
    aiEndpoint: 'https://example.test/v1',
    aiApiKeys: { test: 'sk-test' },
    aiModels: { test: 'gemini-2.0-flash' },
    aiModel: 'gemini-2.0-flash',
    appLanguage: 'zh',
  })
})

describe('Kimi preserved thinking in follow-up chat', () => {
  function configureKimi(model = 'kimi-k3') {
    useSettingsStore.setState({
      aiProvider: 'moonshot', aiEndpoint: 'https://api.moonshot.cn/v1',
      aiApiKeys: { moonshot: 'sk-kimi-test' }, aiModels: { moonshot: model }, aiModel: model,
    })
  }

  function requestMessages(fetchMock: ReturnType<typeof mockReply>, call = 0) {
    return (JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as {
      messages: Array<{ role: string; content: string; reasoning_content?: string }>
    }).messages
  }

  it('round-trips genuine reasoning and provider/model metadata through serialized history into the second request', async () => {
    configureKimi()
    const reasoning = '  first model reasoning\nkept exactly  '
    const fetchMock = mockReply({ content: ' First answer. ', reasoning_content: reasoning })
    let metadata: Pick<ChatMessage, 'reasoningContent' | 'aiProvider' | 'aiModel'> = {}
    const first = await askQuestion('word', [{ role: 'user', content: 'First question?' }], undefined, undefined, 'word', 'in', undefined,
      value => { metadata = value })
    expect(first).toBe('First answer.')
    expect(metadata).toEqual({ reasoningContent: reasoning, aiProvider: 'moonshot', aiModel: 'kimi-k3' })
    const persisted = JSON.stringify([
      { role: 'user', content: 'First question?' },
      { role: 'assistant', content: first, ...metadata },
      { role: 'user', content: 'Why?' },
    ])
    await askQuestion('word', JSON.parse(persisted) as ChatMessage[], undefined, undefined, 'word', 'in')
    const second = requestMessages(fetchMock, 1)
    expect(second.slice(1)).toEqual([
      { role: 'user', content: 'First question?' },
      { role: 'assistant', content: first, reasoning_content: reasoning },
      { role: 'user', content: 'Why?' },
    ])
    expect(JSON.stringify(second)).not.toContain('Quoted conversation transcript')
  })

  it.each(['kimi-k3', 'kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed'])(
    '%s converts old assistant history without reasoning to a quoted transcript and keeps the live question', async model => {
      configureKimi(model)
      const fetchMock = mockReply()
      await askQuestion('word', [
        { role: 'user', content: 'Explain the old example.' },
        { role: 'assistant', content: 'The old explanation.' },
        { role: 'user', content: 'Why that form?' },
      ], undefined, undefined, 'word', 'in', correction)
      const messages = requestMessages(fetchMock)
      expect(messages.map(message => message.role)).toEqual(['system', 'user'])
      expect(messages[0].content).toContain('Correction notes already shown')
      expect(messages[1].content).toContain('Quoted conversation transcript')
      expect(messages[1].content).toContain('<learner_question>Explain the old example.</learner_question>')
      expect(messages[1].content).toContain('<ai_generated>The old explanation.</ai_generated>')
      expect(messages[1].content).toMatch(/Why that form\?$/)
      expect(JSON.stringify(messages)).not.toContain('reasoning_content')
    },
  )

  it('quotes only the incompatible prefix, retaining genuine reasoning in the newer compatible conversation', async () => {
    configureKimi()
    const fetchMock = mockReply()
    await askQuestion('word', [
      { role: 'user', content: 'An old question?' },
      { role: 'assistant', content: 'An old answer.', reasoningContent: 'wrong model reasoning', aiProvider: 'moonshot', aiModel: 'kimi-k2.6' },
      { role: 'user', content: 'A newer question?' },
      { role: 'assistant', content: 'A newer answer.', reasoningContent: 'genuine same-model reasoning', aiProvider: 'moonshot', aiModel: 'kimi-k3' },
      { role: 'user', content: 'Continue?' },
    ], undefined, undefined, 'word', 'out')
    const messages = requestMessages(fetchMock)
    expect(messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[1].content).toContain('An old answer.')
    expect(messages[1].content).toMatch(/A newer question\?$/)
    expect(messages[2]).toEqual({ role: 'assistant', content: 'A newer answer.', reasoning_content: 'genuine same-model reasoning' })
    expect(messages[3].content).toBe('Continue?')
    expect(JSON.stringify(messages)).not.toContain('wrong model reasoning')
  })

  it('does not replay reasoning from a different provider even when the model ID matches', async () => {
    configureKimi()
    const fetchMock = mockReply()
    await askQuestion('word', [
      { role: 'assistant', content: 'Another provider answer.', reasoningContent: 'other provider reasoning', aiProvider: 'openrouter', aiModel: 'kimi-k3' },
      { role: 'user', content: 'Continue?' },
    ])
    const messages = requestMessages(fetchMock)
    expect(messages[1].content).toContain('Another provider answer.')
    expect(JSON.stringify(messages)).not.toContain('other provider reasoning')
    expect(messages.every(message => message.reasoning_content === undefined)).toBe(true)
  })

  it('keeps Kimi K2.6 legacy chat as ordinary messages because historical reasoning is optional by default', async () => {
    configureKimi('kimi-k2.6')
    const fetchMock = mockReply()
    await askQuestion('word', [{ role: 'assistant', content: 'Old answer.' }, { role: 'user', content: 'Why?' }])
    expect(requestMessages(fetchMock).slice(1)).toEqual([
      { role: 'assistant', content: 'Old answer.' }, { role: 'user', content: 'Why?' },
    ])
  })

  it('does not forward thinking fields to a different provider protocol', async () => {
    const fetchMock = mockReply({ content: 'ok', reasoning_content: 'not a supported preserved-thinking protocol' })
    const metadata = vi.fn()
    await askQuestion('word', [{ role: 'assistant', content: 'Old answer.', reasoningContent: 'old reasoning', aiProvider: 'test', aiModel: 'gemini-2.0-flash' },
      { role: 'user', content: 'Why?' }], undefined, undefined, undefined, undefined, undefined, metadata)
    expect(requestMessages(fetchMock)[1]).toEqual({ role: 'assistant', content: 'Old answer.' })
    expect(metadata).toHaveBeenCalledWith({ aiProvider: 'test', aiModel: 'gemini-2.0-flash' })
  })

  it('retains the response metadata from the submitted provider/model after settings change in flight', async () => {
    configureKimi()
    const metadata = vi.fn()
    mockReply({ content: 'ok', reasoning_content: 'real reasoning' })
    const pending = askQuestion('word', [{ role: 'user', content: 'Why?' }], undefined, undefined, undefined, undefined, undefined, metadata)
    configureKimi('kimi-k3.1-pro')
    await pending
    expect(metadata).toHaveBeenCalledWith({ aiProvider: 'moonshot', aiModel: 'kimi-k3', reasoningContent: 'real reasoning' })
  })

  it('never invents reasoning when a Kimi response omits it or returns an invalid value', async () => {
    configureKimi()
    const metadata = vi.fn()
    mockReply({ content: 'ok', reasoning_content: { invalid: true } })
    await askQuestion('word', [{ role: 'user', content: 'Why?' }], undefined, undefined, undefined, undefined, undefined, metadata)
    expect(metadata).toHaveBeenCalledWith({ aiProvider: 'moonshot', aiModel: 'kimi-k3' })
  })

  it('does not publish metadata when cancelled while reading the response', async () => {
    configureKimi()
    const metadata = vi.fn()
    const controller = new AbortController()
    mockReply({ content: 'late', reasoning_content: 'late reasoning' })
    const pending = askQuestion('word', [{ role: 'user', content: 'Why?' }], controller.signal, undefined, undefined, undefined, undefined, metadata)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(metadata).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askQuestion correction context', () => {
  it('sends the fix, its reason and the native form without rich context, tagged as AI text', async () => {
    const fetchMock = mockReply()
    await askQuestion('I really like it', [{ role: 'user', content: 'why really?' }], undefined, undefined, 'I very like it', 'out', correction)
    const prompt = systemPromptOf(fetchMock)
    expect(prompt).not.toContain('Here is the analysis already displayed')
    expect(prompt).toContain('<learner_original>I very like it</learner_original>')
    const block = prompt.slice(prompt.indexOf('Correction notes already shown'))
    expect(block).toMatch(/^Correction notes already shown[^\n]*\n<ai_generated>/)
    expect(block).toContain('"very" cannot modify a verb.')
    expect(block).toContain("I'm really into it")
    expect(block).toContain('"into" sounds casual and natural.')
  })

  it('keeps the submitted text on the irrelevant route, untagged', async () => {
    const fetchMock = mockReply()
    await askQuestion('I really like it', [{ role: 'user', content: 'why?' }], undefined, undefined, 'I very like it', 'irrelevant', correction)
    const prompt = systemPromptOf(fetchMock)
    expect(prompt).toContain('"I really like it" (the user typed "I very like it")')
    expect(prompt).toContain('"very" cannot modify a verb.')
    expect(prompt).not.toContain('<ai_generated>')
  })

  it('adds no correction section when there is nothing to discuss', async () => {
    const fetchMock = mockReply()
    await askQuestion('like', [{ role: 'user', content: 'hi' }], undefined, undefined, 'like', 'out')
    expect(systemPromptOf(fetchMock)).not.toContain('Correction notes already shown')
  })
})

describe('buildChatCorrectionContext', () => {
  it('lists the fix only when the text changed, ignoring case', () => {
    expect(buildChatCorrectionContext({ original: 'Hello', correctForm: 'hello', correctionNote: 'case' })).toBeUndefined()
    expect(buildChatCorrectionContext({ original: 'teh', correctForm: 'the' })).toBe('Minimal fix: "teh" → "the"')
  })

  it('keeps native-expression notes even when no fix was needed', () => {
    const text = buildChatCorrectionContext({
      original: 'good idea',
      correctForm: 'good idea',
      nativeForm: 'sounds great',
      unnaturalMindModel: { chineseThought: '好主意', nativeConcept: 'approval', reusablePrinciple: 'react, not label' },
    })
    expect(text).toBe([
      'Native / polished expression: sounds great',
      'Unnatural-thinking analysis: transferred framing "好主意" → native framing "approval" [principle: react, not label]',
    ].join('\n'))
  })
})
