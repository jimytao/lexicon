export function calculateImageReadingStartScrollTop(
  readingSectionOffsetTop: number,
  stickyTop: number,
): number {
  return Math.max(0, readingSectionOffsetTop - stickyTop)
}

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement
  while (node && node !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(`${overflow}${overflowY}`)) return node
    node = node.parentElement
  }
  return null
}

/** Place the non-sticky reading section at the point where its image becomes sticky. */
export function scrollToImageReadingStart(
  readingSection: HTMLElement,
  stickyImage: HTMLElement,
): void {
  const container = findScrollableAncestor(readingSection)
  if (!container) return

  const sectionRect = readingSection.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const sectionOffsetTop = container.scrollTop + sectionRect.top - containerRect.top
  const parsedStickyTop = Number.parseFloat(window.getComputedStyle(stickyImage).top)
  const stickyTop = Number.isFinite(parsedStickyTop) ? parsedStickyTop : 0

  container.scrollTo({
    top: calculateImageReadingStartScrollTop(sectionOffsetTop, stickyTop),
    behavior: 'auto',
  })
}
