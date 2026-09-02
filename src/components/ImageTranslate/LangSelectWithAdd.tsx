import { useEffect, useRef, useState } from 'react'

export interface LangOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (val: string) => void
  builtinOptions: LangOption[]
  customOptions: string[]
  onAddCustom: (lang: string) => void
  onRemoveCustom?: (lang: string) => void
  placeholder?: string
}

export function LangSelectWithAdd({
  value,
  onChange,
  builtinOptions,
  customOptions,
  onAddCustom,
  onRemoveCustom,
  placeholder = 'Select',
}: Props) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAdding(false)
        setInputVal('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Auto-focus input when adding mode activates
  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  function currentLabel() {
    const builtin = builtinOptions.find(o => o.value === value)
    if (builtin) return builtin.label
    if (customOptions.includes(value)) return value
    return value || placeholder
  }

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setAdding(false)
    setInputVal('')
  }

  function confirmAdd(e?: React.FormEvent | React.MouseEvent | React.TouchEvent) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const val = (inputRef.current?.value || inputVal || '').trim()
    if (!val) return
    onAddCustom(val)
    select(val)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setAdding(false); setInputVal('') }}
        className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-[10px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <span>{currentLabel()}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] max-w-[240px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
          {/* Builtin options */}
          {builtinOptions.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => select(o.value)}
              className={`w-full text-left text-sm px-3 py-2 transition-colors ${
                value === o.value
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}

          {/* Custom options */}
          {customOptions.length > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-gray-100 dark:border-gray-700" />
              {customOptions.map(lang => (
                <div
                  key={lang}
                  className={`flex items-center justify-between text-sm px-3 py-1.5 transition-colors ${
                    value === lang
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => select(lang)}
                    className="flex-1 text-left truncate py-0.5"
                  >
                    {lang}
                  </button>
                  {onRemoveCustom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onRemoveCustom(lang)
                      }}
                      className="ml-2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      title="Delete"
                      aria-label={`Delete ${lang}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Add custom row */}
          <div className="mx-2 my-1 border-t border-gray-100 dark:border-gray-700" />
          {adding ? (
            <form
              onSubmit={confirmAdd}
              className="flex items-center gap-1.5 p-2 bg-gray-50 dark:bg-gray-750"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setInputVal('')
                  }
                }}
                placeholder="e.g. Spanish, 西班牙语..."
                className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-accent min-w-0"
              />
              <button
                type="submit"
                onPointerDown={e => {
                  if (e.button !== 0) return
                  e.preventDefault()
                  confirmAdd(e)
                }}
                className="text-xs px-2.5 py-1 rounded bg-accent text-white font-bold hover:opacity-90 shrink-0 transition-all cursor-pointer shadow-sm"
              >
                OK
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1 text-sm px-3 py-2 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Add</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

