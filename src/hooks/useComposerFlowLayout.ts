import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Styles the mirror must share with the textarea for its line breaking — and therefore
 * its height and end-of-text position — to match exactly.
 */
const MIRRORED_STYLES = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'letterSpacing', 'lineHeight', 'textIndent', 'textTransform', 'wordSpacing', 'tabSize',
] as const

interface ComposerFlowOptions {
  /** Horizontal clearance (px) to keep between the text and the action buttons. */
  gap: number
  /** Height (px) at which the textarea stops growing and starts scrolling. */
  maxHeight: number
  /**
   * Shrink the composer back to a single line while the user is elsewhere.
   * The text is untouched — only the visible height — so focusing expands it again.
   */
  collapsed?: boolean
}

/**
 * Lays out a composer whose action buttons sit in the container's bottom-right corner.
 *
 * The buttons only ever obstruct the *last* line, so the text is always wrapped at the
 * full width and the single question we answer is whether the text's final line would
 * run into them. If it would, `reserveHeight` asks for one more line of empty space
 * below the text for the buttons to occupy; the text keeps flowing at full width above.
 *
 * Nothing here can feed back on itself: the textarea's width is constant, so wrapping is
 * fixed, and the only thing this hook varies is vertical space.
 */
export function useComposerFlowLayout(value: string, { gap, maxHeight, collapsed = false }: ComposerFlowOptions) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [reserveHeight, setReserveHeight] = useState(0)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useLayoutEffect(() => {
    const el = textareaRef.current
    const mirror = mirrorRef.current
    if (!el || !mirror) return

    // Drop the collapsed state's right padding before measuring, so everything below
    // reads the composer's real, full-width geometry.
    el.style.paddingRight = ''

    const cs = getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 24

    // The mirror is laid out at the textarea's content width, so it wraps identically.
    // `getComputedStyle().width` resolves to the content box regardless of box-sizing,
    // hence content-box here rather than copying the textarea's border-box.
    for (const prop of MIRRORED_STYLES) mirror.style[prop] = cs[prop]
    mirror.style.boxSizing = 'content-box'
    mirror.style.width = cs.width
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'break-word'
    mirror.style.wordBreak = cs.wordBreak

    // A zero-width marker after the text reports where the last line ends — including
    // when the text ends on a newline, which a range over the text alone would miss.
    mirror.textContent = value
    const marker = document.createElement('span')
    marker.textContent = '​'
    mirror.appendChild(marker)

    const textHeight = mirror.offsetHeight
    const lastLineEnd = marker.getBoundingClientRect().left - mirror.getBoundingClientRect().left

    // Buttons sit flush with the textarea's right edge, so this threshold is in the
    // same coordinate space as `lastLineEnd`.
    const actionsWidth = actionsRef.current?.getBoundingClientRect().width ?? 0
    const limit = el.getBoundingClientRect().width - actionsWidth - gap
    const collides = value.length > 0 && lastLineEnd > limit

    const textPadTop = parseFloat(cs.paddingTop) || 0
    const textPadBottom = parseFloat(cs.paddingBottom) || 0
    const lines = Math.max(1, Math.round((textHeight - textPadTop - textPadBottom) / lineHeight))
    const multiLine = collides || lines > 1

    // Away from the composer, tall text is dead weight: shrink to the empty composer's
    // one-line silhouette and scroll back to the start. The value is untouched, so
    // focusing re-runs this effect uncollapsed and the full flow comes straight back.
    if (collapsed && multiLine) {
      el.style.overflowY = 'hidden'
      el.style.height = `${lineHeight + textPadTop + textPadBottom}px`
      // With only one line left, the buttons now hover over it — end that line before
      // them so the visible text is never hidden underneath.
      el.style.paddingRight = `${Math.round(actionsWidth + gap)}px`
      el.scrollTop = 0
      setReserveHeight(0)
      setIsMultiLine(true)
      setIsCollapsed(true)
      return
    }

    el.style.overflowY = ''
    el.style.height = 'auto'
    el.style.height = `${Math.min(textHeight, maxHeight)}px`

    // The buttons are taller than a line of text, so anchoring them to the container's
    // bottom makes them reach up into the line above the last one — which is full width
    // and would sit underneath them. Sink the last line by whatever that overhang is.
    // Measured, not hardcoded, so it self-corrects if the buttons are ever resized.
    let reserve = 0
    const container = containerRef.current
    const actions = actionsRef.current
    if (container && actions) {
      const ccs = getComputedStyle(container)
      // Distance from the container's bottom edge up to the buttons' top edge. The
      // buttons are bottom-anchored, so this is independent of the reserve we set.
      const buttonReach = container.getBoundingClientRect().bottom - actions.getBoundingClientRect().top
      const overhang = buttonReach - (parseFloat(ccs.paddingBottom) || 0) - (parseFloat(ccs.borderBottomWidth) || 0) - textPadBottom

      if (collides) reserve = overhang                    // clear the whole last line
      else if (lines > 1) reserve = overhang - lineHeight  // just clear the line above
      // A lone line has nothing above it to protect — min-height keeps the buttons in.
    }

    setReserveHeight(Math.max(0, Math.round(reserve)))
    setIsMultiLine(multiLine)
    setIsCollapsed(false)
  }, [value, gap, maxHeight, collapsed])

  return { textareaRef, mirrorRef, actionsRef, containerRef, reserveHeight, isMultiLine, isCollapsed }
}
