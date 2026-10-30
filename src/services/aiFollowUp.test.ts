/** Follow-up chat must see the AI's own fix even when rich context is off. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
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

function mockReply() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
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
