/**
 * Layout contract for AiChatBox composer (bulb + input + Send).
 * Narrow Android WebViews clip shrink-0 siblings when flex children lack min-w-0.
 */
export const AI_CHAT_COMPOSER_LAYOUT = {
  /** Outer row: allow shrink; never overflow past parent; items-end keeps send button anchored at bottom */
  row: 'flex gap-2 items-end min-w-0 w-full',
  /** Lightbulb: fixed size, never shrink, top-left aligned */
  bulb: 'flex items-center justify-center w-9 h-9 shrink-0 rounded-full self-start',
  /** Input must absorb squeeze so Send stays visible; auto-expanding textarea styling */
  input: 'flex-1 min-w-0 text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 outline-none focus:border-violet-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-60 resize-none max-h-32 overflow-y-auto leading-relaxed',
  /** Send: stay visible; compact padding on narrow screens; bottom aligned */
  send: 'text-xs px-2.5 py-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap self-end',
} as const

/** Guards used by tests + runtime assertions about overflow-safe classes. */
export function isOverflowSafeComposerInputClass(className: string): boolean {
  return className.includes('flex-1') && className.includes('min-w-0')
}

export function isOverflowSafeComposerRowClass(className: string): boolean {
  return className.includes('min-w-0') && className.includes('flex')
}
