import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../../../stores/chatStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { askQuestion } from '../../../services/ai'
import { db } from '../../../services/db'
import { recordAiChatEvent } from '../../../services/profile'
import type { ChatMessage, CognitiveMode } from '../../../types'
import { cognitiveCacheKey, normalizeQuery } from '../../../utils/text'
import { useT } from '../../../i18n'
import { AI_CHAT_COMPOSER_LAYOUT } from '../../../utils/aiChatComposerLayout'
import { useComposerAutoGrow } from '../../../hooks/useComposerAutoGrow'
import { SectionHeading } from '../SectionHeading'


interface AiChatBoxProps {
  context: string        // correctForm — display / askQuestion context (not storage key alone)
  cognitive: CognitiveMode
  enrichedContext?: string
}

const EMPTY_MESSAGES: ChatMessage[] = []

export function AiChatBox({ context, cognitive, enrichedContext }: AiChatBoxProps) {
  const t = useT()
  const chatKey = cognitiveCacheKey(context, cognitive)
  const legacyLookupKey = cognitive === 'lookup' ? (normalizeQuery(context) || context) : null
  // Subscribe to this track's messages — React re-renders whenever they change
  const chatMessages = useChatStore(s =>
    s.messagesByWord[chatKey]
      ?? (legacyLookupKey && legacyLookupKey !== chatKey ? s.messagesByWord[legacyLookupKey] : undefined)
      ?? (cognitive === 'lookup' ? s.messagesByWord[context] : undefined)
      ?? EMPTY_MESSAGES
  )
  const addMessage = useChatStore(s => s.addMessage)
  const chatRichContextDefault = useSettingsStore(s => s.chatRichContextDefault)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [richMode, setRichMode] = useState(chatRichContextDefault)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef(context)
  const cognitiveRef = useRef(cognitive)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  contextRef.current = context
  cognitiveRef.current = cognitive

  // Keep richMode in sync when the user changes the default in Settings
  useEffect(() => {
    setRichMode(chatRichContextDefault)
  }, [chatRichContextDefault])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const requestContext = context
    const requestCognitive = cognitive
    const wordKey = normalizeQuery(requestContext) || requestContext

    const userMsg: ChatMessage = { role: 'user', content: question }
    addMessage(wordKey, userMsg, requestCognitive)
    setInput('')
    setLoading(true)

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 100)

    try {
      // Read latest messages at send time (includes the one just added above)
      const allMessages = useChatStore.getState().getMessages(wordKey, requestCognitive)
      const reply = await askQuestion(
        requestContext,
        allMessages,
        abortRef.current.signal,
        richMode && enrichedContext ? enrichedContext : undefined
      )
      if (contextRef.current === requestContext && cognitiveRef.current === requestCognitive) {
        const assistantMsg: ChatMessage = { role: 'assistant', content: reply }
        addMessage(wordKey, assistantMsg, requestCognitive)
        const updatedAll = useChatStore.getState().getMessages(wordKey, requestCognitive)
        void db.saveUserWordConversation(wordKey, JSON.stringify(updatedAll), requestCognitive)
        recordAiChatEvent(wordKey, question, reply, requestCognitive)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if (contextRef.current === requestContext && cognitiveRef.current === requestCognitive) {
        addMessage(wordKey, { role: 'assistant', content: `${t('chat.error')}${(e as Error).message}` }, requestCognitive)
      }
    } finally {
      setLoading(false)
    }
  }


  // 128px ≈ 4 lines
  const { textareaRef } = useComposerAutoGrow(input, { maxHeight: 128 })

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="mb-4">
      <SectionHeading title={t('chat.heading')} />

      {chatMessages.length > 0 && (
        <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`text-sm rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-accent/10 text-foreground ml-8'
                  : 'bg-background-soft text-foreground mr-8'
              }`}
            >
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>
            </div>
          ))}
          {loading && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 mr-8">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('chat.thinking')}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={AI_CHAT_COMPOSER_LAYOUT.row}>
        {/* Bulb + textarea keep Send on their row, bottom-aligned: the textarea's width
            stays constant as it grows, so every line wraps at the same boundary and Send
            sits beside the last line rather than costing a row of its own. */}
        <div className="flex items-end gap-2 min-w-0 flex-1">
          {/* Rich context toggle — beside input so iOS keyboard scroll cannot push it off-screen.
              Still a single button; only rendered when enrichedContext exists. */}
          {enrichedContext && (
            <button
              type="button"
              onClick={() => setRichMode(v => !v)}
              title={richMode ? t('chat.richContextOn') : t('chat.richContextOff')}
              aria-label={richMode ? t('chat.richContextOn') : t('chat.richContextOff')}
              className={`${AI_CHAT_COMPOSER_LAYOUT.bulb} transition-all duration-200 ${
                richMode
                  ? 'bg-violet-500 text-white shadow-sm shadow-violet-300/40 dark:shadow-violet-700/30'
                  : 'text-violet-400 dark:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200/60 dark:border-violet-800/50'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            enterKeyHint="send"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            disabled={loading}
            className={AI_CHAT_COMPOSER_LAYOUT.input}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className={AI_CHAT_COMPOSER_LAYOUT.send}
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  )
}
