import { describe, expect, it } from 'vitest'

import {
  calculateSelectionButtonPosition,
  isBackwardSelection,
  selectFocusEdgeRect,
  type SelectionRect,
} from './selectionGeometry'

const firstLine: SelectionRect = {
  left: 50,
  right: 350,
  top: 100,
  bottom: 124,
}

const lastLine: SelectionRect = {
  left: 50,
  right: 220,
  top: 148,
  bottom: 172,
}

describe('isBackwardSelection', () => {
  it('uses offsets to detect right-to-left selection inside one text node', () => {
    const textNode = {} as Node

    expect(isBackwardSelection(textNode, 12, textNode, 3)).toBe(true)
    expect(isBackwardSelection(textNode, 3, textNode, 12)).toBe(false)
  })

  it('uses DOM order when anchor and focus are in different nodes', () => {
    const anchorWithFocusBefore = {
      compareDocumentPosition: () => 2,
    } as unknown as Node
    const anchorWithFocusAfter = {
      compareDocumentPosition: () => 4,
    } as unknown as Node
    const focusNode = {} as Node

    expect(isBackwardSelection(anchorWithFocusBefore, 0, focusNode, 0)).toBe(true)
    expect(isBackwardSelection(anchorWithFocusAfter, 0, focusNode, 0)).toBe(false)
  })

  it('defaults to forward placement when an endpoint is unavailable', () => {
    expect(isBackwardSelection(null, 0, {} as Node, 0)).toBe(false)
    expect(isBackwardSelection({} as Node, 0, null, 0)).toBe(false)
  })
})

describe('selectFocusEdgeRect', () => {
  it('uses the final visual rect for forward selections', () => {
    expect(selectFocusEdgeRect([firstLine, lastLine], false)).toBe(lastLine)
  })

  it('uses the first visual rect for backward selections', () => {
    expect(selectFocusEdgeRect([firstLine, lastLine], true)).toBe(firstLine)
  })

  it('returns null for a selection without visible rects', () => {
    expect(selectFocusEdgeRect([], false)).toBeNull()
  })
})

describe('calculateSelectionButtonPosition', () => {
  it('docks forward selections after and below the focus edge', () => {
    expect(calculateSelectionButtonPosition(firstLine, false, 800, 600)).toEqual({
      left: 356,
      top: 130,
    })
  })

  it('docks backward selections before and above the focus edge', () => {
    expect(calculateSelectionButtonPosition(firstLine, true, 800, 600)).toEqual({
      left: 16,
      top: 66,
    })
  })

  it('flips a backward button inside the viewport at the top-left boundary', () => {
    const rect: SelectionRect = { left: 2, right: 80, top: 2, bottom: 22 }

    expect(calculateSelectionButtonPosition(rect, true, 800, 600)).toEqual({
      left: 8,
      top: 28,
    })
  })

  it('flips a forward button inside the viewport at the bottom-right boundary', () => {
    const rect: SelectionRect = { left: 430, right: 498, top: 478, bottom: 498 }

    expect(calculateSelectionButtonPosition(rect, false, 500, 500)).toEqual({
      left: 464,
      top: 444,
    })
  })

  it('skips viewport clamping when the viewport is not measurable', () => {
    expect(calculateSelectionButtonPosition(firstLine, true, 0, 0)).toEqual({
      left: 16,
      top: 66,
    })
  })
})
