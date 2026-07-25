import { useState, useEffect } from 'react'
import { db } from '../../services/db'
import type { UserWordMemory, ChatMessage } from '../../types'

interface UserNoteEditorProps {
  word: string
  coreConceptText?: string
}

export function UserNoteEditor({ word, coreConceptText }: UserNoteEditorProps) {
  const [memory, setMemory] = useState<UserWordMemory | null>(null)
  const [note, setNote] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let isMounted = true
    void db.getUserWordMemory(word).then((mem) => {
      if (isMounted && mem) {
        setMemory(mem)
        setNote(mem.userNotes || '')
        if (mem.userNotes || mem.aiConversationsJson || mem.savedCoreConcept) {
          setIsOpen(true)
        }
      }
    })
    return () => {
      isMounted = false
    }
  }, [word])

  const handleSaveNote = async () => {
    await db.saveUserWordNote(word, note)
    if (coreConceptText && !memory?.savedCoreConcept) {
      await db.saveUserWordCoreConcept(word, coreConceptText)
    }
    const updated = await db.getUserWordMemory(word)
    if (updated) setMemory(updated)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const conversations: ChatMessage[] = (() => {
    try {
      return memory?.aiConversationsJson
        ? (JSON.parse(memory.aiConversationsJson) as ChatMessage[])
        : []
    } catch {
      return []
    }
  })()

  return (
    <div className="rounded-2xl border border-border bg-background-soft/40 overflow-hidden my-4">
      {/* Header Bar */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-background-soft/80 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm">📓</span>
          <span className="text-xs font-bold text-foreground">Lexicon Memory 个人笔记与 Q&A 存档</span>
          {memory?.userNotes && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              有笔记
            </span>
          )}
          {conversations.filter(m => m.role === 'user').length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent">
              {conversations.filter(m => m.role === 'user').length} 轮 Q&A
            </span>
          )}
        </div>
        <span className="text-xs text-foreground-muted">{isOpen ? '▲ 折叠' : '▼ 展开编辑'}</span>
      </button>

      {/* Editor Body */}
      {isOpen && (
        <div className="p-4 border-t border-border space-y-4 animate-in fade-in duration-200">
          {/* Note TextArea */}
          <div>
            <label className="block text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest mb-1.5">
              个人笔记 & 词义联想
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="在此记录你对该词汇/句子的理解误区、自定义用法笔记或记忆特征..."
              rows={3}
              className="w-full text-xs border border-border rounded-xl p-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-background text-foreground placeholder-foreground-muted/30 transition-all resize-y"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-foreground-muted">
                {isSaved ? '✅ 已保存至 SQLite 资产表' : '笔记将作为个人第二大脑永久沉淀'}
              </span>
              <button
                onClick={handleSaveNote}
                className="px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-bold shadow-sm hover:bg-accent/90 transition-all cursor-pointer"
              >
                保存笔记
              </button>
            </div>
          </div>

          {/* AI Q&A History */}
          {conversations.length > 0 && (
            <div className="pt-3 border-t border-border/40">
              <label className="block text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest mb-2">
                💬 关联 AI 追问历史 ({conversations.filter(m => m.role === 'user').length} 轮)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {conversations.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl text-xs ${
                      msg.role === 'user'
                        ? 'bg-accent/10 border border-accent/20 text-accent font-medium ml-4'
                        : 'bg-background border border-border text-foreground mr-4'
                    }`}
                  >
                    <span className="text-[9px] font-bold text-foreground-muted block mb-0.5">
                      {msg.role === 'user' ? '提问:' : 'AI 答复:'}
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved Core Concept */}
          {memory?.savedCoreConcept && (
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mb-1">
                🌌 沉淀的 Core 意象
              </span>
              <p className="text-xs text-foreground-muted leading-relaxed">
                {memory.savedCoreConcept}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
