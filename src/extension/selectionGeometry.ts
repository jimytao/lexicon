export interface SelectionRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface SelectionButtonPosition {
  left: number
  top: number
}

const DOCUMENT_POSITION_PRECEDING = 2
const BUTTON_SIZE = 28
const BUTTON_GAP = 6
const VIEWPORT_PADDING = 4

/**
 * Selection anchor is where the gesture started; focus is where it ended.
 * Range start/end cannot be used here because Range normalizes both points
 * into document order and therefore discards the user's drag direction.
 */
export function isBackwardSelection(
  anchorNode: Node | null,
  anchorOffset: number,
  focusNode: Node | null,
  focusOffset: number,
): boolean {
  if (!anchorNode || !focusNode) return false
  if (anchorNode === focusNode) return anchorOffset > focusOffset

  try {
    return (anchorNode.compareDocumentPosition(focusNode) & DOCUMENT_POSITION_PRECEDING) !== 0
  } catch {
    return false
  }
}

export function selectFocusEdgeRect<T extends SelectionRect>(
  rects: readonly T[],
  isBackward: boolean,
): T | null {
  if (rects.length === 0) return null
  return isBackward ? rects[0] : rects[rects.length - 1]
}

export function calculateSelectionButtonPosition(
  rect: SelectionRect,
  isBackward: boolean,
  viewportWidth: number,
  viewportHeight: number,
): SelectionButtonPosition {
  let left = isBackward
    ? rect.left - BUTTON_SIZE - BUTTON_GAP
    : rect.right + BUTTON_GAP
  let top = isBackward
    ? rect.top - BUTTON_SIZE - BUTTON_GAP
    : rect.bottom + BUTTON_GAP

  // Hidden tabs and not-yet-rendered frames can report a zero viewport. In
  // that case, keep the position attached to the selection instead of
  // clamping it to a synthetic top-left corner.
  if (viewportWidth > 0 && viewportHeight > 0) {
    if (isBackward && left < VIEWPORT_PADDING) {
      left = rect.left + BUTTON_GAP
    } else if (!isBackward && left + BUTTON_SIZE > viewportWidth - VIEWPORT_PADDING) {
      left = rect.right - BUTTON_SIZE - BUTTON_GAP
    }

    if (left + BUTTON_SIZE > viewportWidth - VIEWPORT_PADDING) {
      left = viewportWidth - BUTTON_SIZE - VIEWPORT_PADDING
    }
    left = Math.max(VIEWPORT_PADDING, left)

    if (top + BUTTON_SIZE > viewportHeight - VIEWPORT_PADDING) {
      top = Math.max(VIEWPORT_PADDING, rect.top - BUTTON_SIZE - BUTTON_GAP)
    }
    if (top < VIEWPORT_PADDING) {
      top = rect.bottom + BUTTON_GAP
    }
  }

  return { left, top }
}
