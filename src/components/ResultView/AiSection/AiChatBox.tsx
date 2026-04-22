import { useState, useRef } from 'react'
import { useResultStore } from '../../../stores/resultStore'
import { askQuestion } from '../../../services/ai'
import type { ChatMessage } from '../../../types'

interface AiChatBoxProps {
  context: string
}

export function AiChatBox({ context }: AiChatBoxProps) {
  const { chatMessages, addChatMessage } = useResultStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef(context)
  contextRef.current = context

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const requestContext = context

    const userMsg: ChatMessage = { role: 'user', content: question }
    addChatMessage(userMsg)
    setInput('')
    setLoading(true)

    try {
      const allMessages = [...chatMessages, userMsg]
      const reply = await askQuestion(requestContext, allMessages, abortRef.current.signal)
      if (contextRef.current === requestContext) {
        addChatMessage({ role: 'assistant', content: reply })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      if (contextRef.current === requestContext) {
        addChatMessage({ role: 'assistant', content: `出错了：${(e as Error).message}` })
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
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
        <h2 className="text-xs font-semibold text-violet-900 dark:text-violet-300">AI 问答</h2>
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
                思考中…
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题…"
          disabled={loading}
          className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none focus:border-violet-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="text-xs px-3 py-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          发送
        </button>
      </div>
    </div>
  )
}
