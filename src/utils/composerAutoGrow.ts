/**
 * Geometry for auto-growing composer inputs (search bar, AI chat box).
 *
 * The action buttons stay on the textarea's row, bottom-aligned, so the textarea's
 * width never changes as it grows. Every line therefore wraps at the same boundary
 * and the buttons always sit beside the last line — no row is ever spent on buttons
 * alone. Keeping the width constant is also what makes the growth safe: a layout that
 * moved the buttons off the row would widen the textarea, un-wrap the text, move them
 * back, and flip-flop once per keystroke.
 */

/** Height of exactly one line of text, including the textarea's vertical padding. */
export function singleLineHeight(lineHeight: number, paddingTop: number, paddingBottom: number): number {
  return (Number.isFinite(lineHeight) ? lineHeight : 24) + paddingTop + paddingBottom
}

/** Content taller than one line (1px slack absorbs sub-pixel line-height rounding). */
export function wrapsToMultipleLines(scrollHeight: number, oneLine: number): boolean {
  return scrollHeight > oneLine + 1
}
