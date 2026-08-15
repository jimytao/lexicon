import { useLayoutEffect, useRef, useState } from 'react'
import { singleLineHeight, wrapsToMultipleLines } from '../utils/composerAutoGrow'

interface ComposerAutoGrowOptions {
  /** Height (px) at which the textarea stops growing and starts scrolling. */
  maxHeight: number
}

/**
 * Grows a composer textarea to fit its content, and reports whether the text has
 * wrapped so the caller can soften the container's corners.
 *
 * `isMultiLine` is deliberately cosmetic only — it must never feed back into the
 * textarea's width, or the wrap measurement would be measuring its own result.
 */
export function useComposerAutoGrow(value: string, { maxHeight }: ComposerAutoGrowOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isMultiLine, setIsMultiLine] = useState(false)

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return

    // Empty: never measure. `scrollHeight` reflects the wrapped placeholder in some
    // browsers, which would expand the box before the user has typed anything.
    if (!value) {
      el.style.height = ''
      setIsMultiLine(false)
      return
    }

    const cs = getComputedStyle(el)
    const oneLine = singleLineHeight(
      parseFloat(cs.lineHeight),
      parseFloat(cs.paddingTop),
      parseFloat(cs.paddingBottom),
    )

    el.style.height = 'auto'
    const contentHeight = el.scrollHeight
    el.style.height = `${Math.min(contentHeight, maxHeight)}px`
    setIsMultiLine(wrapsToMultipleLines(contentHeight, oneLine))
  }, [value, maxHeight])

  return { textareaRef, isMultiLine }
}
