import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../../../stores/chatStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { askQuestion } from '../../../services/ai'
import type { ChatMessage } from '../../../types'
import { useT } from '../../../i18n'

interface AiChatBoxProps {
  context: string        // correctForm — also used as the storage key
  enrichedContext?: string
}

const EMPTY_MESSAGES: ChatMessage[] = []

export function AiChatBox({ context, enrichedContext }: AiChatBoxProps) {
  const t = useT()
  // Subscribe to this specific word's messages — React re-renders whenever they change
  const chatMessages = useChatStore(s => s.messagesByWord[context] ?? EMPTY_MESSAGES)
  const addMessage = useChatStore(s => s.addMessage)
  const chatRichContextDefault = useSettingsStore(s => s.chatRichContextDefault)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [richMode, setRichMode] = useState(chatRichContextDefault)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef(context)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  contextRef.current = context

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

    const userMsg: ChatMessage = { role: 'user', content: question }
    addMessage(requestContext, userMsg)
    setInput('')
    setLoading(true)

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 100)

    try {
      // Read latest messages at send time (includes the one just added above)
      const allMessages = useChatStore.getState().getMessages(requestContext)
      const reply = await askQuestion(
        requestContext,
        allMessages,
        abortRef.current.signal,
        richMode && enrichedContext ? enrichedContext : undefined
      )
      if (contextRef.current === requestContext) {
        addMessage(requestContext, { role: 'assistant', content: reply })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if (contextRef.current === requestContext) {
        addMessage(requestContext, { role: 'assistant', content: `${t('chat.error')}${(e as Error).message}` })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <h2 className="text-xs font-semibold text-violet-900 dark:text-violet-300">{t('chat.heading')}</h2>
        </div>

        {/* Rich context toggle — only shown when enriched data is available */}
        {enrichedContext && (
          <button
            onClick={() => setRichMode(v => !v)}
            title={richMode ? t('chat.richContextOn') : t('chat.richContextOff')}
            aria-label={richMode ? t('chat.richContextOn') : t('chat.richContextOff')}
            className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${
              richMode
                ? 'bg-violet-500 text-white shadow-sm shadow-violet-300/40 dark:shadow-violet-700/30'
                : 'text-violet-400 dark:text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/40'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
        )}
      </div>

      {chatMessages.length > 0 && (
        <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`text-sm rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 ml-8'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 mr-8'
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

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          disabled={loading}
          className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none focus:border-violet-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="text-xs px-3 py-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  )
}
