/**
 * SHELVED (2026-07-25): Not mounted in result views. Keep for a future Notes restore.
 * DB APIs (user_notes / ai_conversations / saved_core_concept) remain intact — do not delete schema.
 * Do not re-mount until product decides to ship personal notes again.
 */
import { useState, useEffect } from 'react'
import { db } from '../../services/db'
import type { UserWordMemory, ChatMessage } from '../../types'
import { flattenAiConversations, parseAiConversationsBuckets } from '../../utils/aiConversations'
import { useT } from '../../i18n'

export const USER_NOTES_ELEMENT_ID = 'lexicon-user-notes'

/** Expand notes panel and scroll it into view (kept for shelved badge / Memory restore). */
export function openUserNotes() {
  window.dispatchEvent(new Event('lexicon:open-notes'))
  document.getElementById(USER_NOTES_ELEMENT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

interface UserNoteEditorProps {
  word: string
  coreConceptText?: string
}

export function UserNoteEditor({ word, coreConceptText }: UserNoteEditorProps) {
  const t = useT()
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

  useEffect(() => {
    const onOpen = () => setIsOpen(true)
    window.addEventListener('lexicon:open-notes', onOpen)
    return () => window.removeEventListener('lexicon:open-notes', onOpen)
  }, [])

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

  const conversations: ChatMessage[] = memory?.aiConversationsJson
    ? flattenAiConversations(parseAiConversationsBuckets(memory.aiConversationsJson))
    : []

  const qaRounds = conversations.filter((m) => m.role === 'user').length

  return (
    <div
      id={USER_NOTES_ELEMENT_ID}
      className="rounded-2xl border border-border bg-background-soft/40 overflow-hidden my-4"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-background-soft/80 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
          <span className="text-sm shrink-0">📓</span>
          <span className="text-xs font-bold text-foreground truncate">{t('note.title')}</span>
          {memory?.userNotes && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 whitespace-nowrap">
              {t('note.hasNotes')}
            </span>
          )}
          {qaRounds > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent shrink-0 whitespace-nowrap">
              {t('note.qaRounds').replace('{count}', String(qaRounds))}
            </span>
          )}
        </div>
        <span className="text-xs text-foreground-muted shrink-0 whitespace-nowrap">
          {isOpen ? t('note.collapse') : t('note.expand')}
        </span>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-border space-y-4 animate-in fade-in duration-200">
          <div>
            <label className="block text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest mb-1.5">
              {t('note.label')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('note.placeholder')}
              rows={3}
              className="w-full text-xs border border-border rounded-xl p-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-background text-foreground placeholder-foreground-muted/30 transition-all resize-y"
            />
            <div className="flex items-center justify-between mt-2 gap-3">
              <span className="text-[11px] text-foreground-muted leading-snug">
                {isSaved ? t('note.saved') : t('note.hint')}
              </span>
              <button
                type="button"
                onClick={handleSaveNote}
                className="px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-bold shadow-sm hover:bg-accent/90 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                {t('note.save')}
              </button>
            </div>
          </div>

          {conversations.length > 0 && (
            <div className="pt-3 border-t border-border/40">
              <label className="block text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest mb-2">
                {t('note.qaHistory').replace('{count}', String(qaRounds))}
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
                      {msg.role === 'user' ? t('note.ask') : t('note.answer')}
                    </span>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {memory?.savedCoreConcept && (
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mb-1">
                {t('note.coreSaved')}
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
