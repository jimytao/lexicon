import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { TextBlock, TextBlockType, TextDirection } from '../../types'

interface Props {
  imageUrl: string
  blocks: TextBlock[]
  fontFamily: string
}

export interface ImageEditorHandle {
  exportBlob: () => Promise<Blob | null>
}

export const ImageEditor = forwardRef<ImageEditorHandle, Props>(({ imageUrl, blocks, fontFamily }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    for (const block of blocks) {
      const x = Math.round(block.bbox.x * img.naturalWidth)
      const y = Math.round(block.bbox.y * img.naturalHeight)
      const w = Math.round(block.bbox.w * img.naturalWidth)
      const h = Math.round(block.bbox.h * img.naturalHeight)
      if (w <= 0 || h <= 0) continue

      const blockType: TextBlockType = block.type || 'bubble'
      const dir: TextDirection = block.direction || 'horizontal'

      if (blockType === 'bubble') {
        renderBubble(ctx, block.translation, x, y, w, h, fontFamily, dir)
      } else if (blockType === 'sfx') {
        renderSfx(ctx, block.translation, x, y, w, h, fontFamily, dir)
      } else {
        renderCaption(ctx, block.translation, x, y, w, h, fontFamily, dir)
      }
    }
  }, [blocks, fontFamily])

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; render() }
    img.src = imageUrl
  }, [imageUrl, render])

  useEffect(() => { render() }, [render])

  useImperativeHandle(ref, () => ({
    async exportBlob() {
      const canvas = canvasRef.current
      if (!canvas) return null
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
    />
  )
})

ImageEditor.displayName = 'ImageEditor'

// ── Bubble: background fill + text ──
function renderBubble(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, dir: TextDirection,
) {
  if (!text) return

  const bgColor = sampleBorderColor(ctx, x, y, w, h)
  ctx.fillStyle = bgColor
  ctx.fillRect(x, y, w, h)

  const brightness = parseBrightness(bgColor)
  const textColor = brightness > 128 ? '#000000' : '#ffffff'

  if (dir === 'vertical') {
    renderVertical(ctx, text, x, y, w, h, fontFamily, textColor)
  } else {
    renderHorizontal(ctx, text, x, y, w, h, fontFamily, textColor)
  }
}

// ── SFX: no background, outlined text ──
function renderSfx(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, dir: TextDirection,
) {
  if (!text) return

  if (dir === 'vertical') {
    renderVertical(ctx, text, x, y, w, h, fontFamily, '#333333', true)
  } else {
    renderHorizontalOutlined(ctx, text, x, y, w, h, fontFamily)
  }
}

// ── Caption: semi-transparent bg + text ──
function renderCaption(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, dir: TextDirection,
) {
  if (!text) return

  // Draw semi-transparent background
  const pad = 4
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.beginPath()
  roundRect(ctx, x, y, w, h, 4)
  ctx.fill()

  if (dir === 'vertical') {
    renderVertical(ctx, text, x + pad, y + pad, w - pad * 2, h - pad * 2, fontFamily, '#222222')
  } else {
    renderHorizontal(ctx, text, x + pad, y + pad, w - pad * 2, h - pad * 2, fontFamily, '#222222')
  }
}

// ── Horizontal rendering ──
function renderHorizontal(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, color: string,
) {
  ctx.fillStyle = color
  const fontSize = fitFontSizeH(ctx, text, w * 0.85, h * 0.85, fontFamily)
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'

  const lines = wrapText(ctx, text, w * 0.85)
  const lineHeight = fontSize * 1.35
  const totalHeight = lines.length * lineHeight
  const startY = y + (h - totalHeight) / 2

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + w / 2, startY + i * lineHeight)
  }
}

function renderHorizontalOutlined(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string,
) {
  const fontSize = fitFontSizeH(ctx, text, w * 0.9, h * 0.9, fontFamily)
  ctx.font = `bold ${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'

  const lines = wrapText(ctx, text, w * 0.9)
  const lineHeight = fontSize * 1.3
  const totalHeight = lines.length * lineHeight
  const startY = y + (h - totalHeight) / 2

  ctx.lineWidth = Math.max(3, fontSize * 0.12)
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#333333'
  ctx.lineJoin = 'round'

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight
    ctx.strokeText(lines[i], x + w / 2, ly)
    ctx.fillText(lines[i], x + w / 2, ly)
  }
}

// ── Vertical rendering (top-to-bottom, right-to-left columns) ──
function renderVertical(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, color: string, outlined = false,
) {
  // Fit font size for vertical layout
  const fontSize = fitFontSizeV(text, w * 0.85, h * 0.85)
  ctx.font = `${outlined ? 'bold ' : ''}${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  const colSpacing = fontSize * 1.3
  const charHeight = fontSize * 1.2

  // Split into columns: each column fills height
  const maxCharsPerCol = Math.max(1, Math.floor((h * 0.85) / charHeight))
  const chars = [...text]
  const columns: string[][] = []
  for (let i = 0; i < chars.length; i += maxCharsPerCol) {
    columns.push(chars.slice(i, i + maxCharsPerCol))
  }

  // Columns go right-to-left
  const totalW = columns.length * colSpacing
  const startX = x + w / 2 + totalW / 2 - colSpacing / 2

  if (outlined) {
    ctx.lineWidth = Math.max(3, fontSize * 0.12)
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = color
    ctx.lineJoin = 'round'
  } else {
    ctx.fillStyle = color
  }

  const totalH = Math.min(columns[0]?.length ?? 1, maxCharsPerCol) * charHeight
  const startY = y + (h - totalH) / 2 + charHeight / 2

  for (let col = 0; col < columns.length; col++) {
    const cx = startX - col * colSpacing
    for (let row = 0; row < columns[col].length; row++) {
      const cy = startY + row * charHeight
      if (outlined) {
        ctx.strokeText(columns[col][row], cx, cy)
      }
      ctx.fillText(columns[col][row], cx, cy)
    }
  }
}

// ── Helpers ──

function sampleBorderColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  const samples: Array<[number, number, number]> = []
  const padding = 2
  const positions: Array<[number, number]> = []
  for (let i = 0; i < 5; i++) {
    const fx = x + (w * i) / 4
    const fy = y + (h * i) / 4
    positions.push([fx, Math.max(0, y - padding)])
    positions.push([fx, y + h + padding])
    positions.push([Math.max(0, x - padding), fy])
    positions.push([x + w + padding, fy])
  }
  for (const [px, py] of positions) {
    try {
      const pixel = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data
      samples.push([pixel[0], pixel[1], pixel[2]])
    } catch { /* skip */ }
  }
  if (samples.length === 0) return 'rgb(255, 255, 255)'
  const avg = samples.reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
  const n = samples.length
  return `rgb(${Math.round(avg[0] / n)}, ${Math.round(avg[1] / n)}, ${Math.round(avg[2] / n)})`
}

function parseBrightness(color: string): number {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) return 200
  return (parseInt(m[1]) * 299 + parseInt(m[2]) * 587 + parseInt(m[3]) * 114) / 1000
}

/** Fit font size for horizontal layout */
function fitFontSizeH(
  ctx: CanvasRenderingContext2D,
  text: string, maxW: number, maxH: number,
  fontFamily: string,
): number {
  let lo = 8, hi = Math.min(maxW, maxH)
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    ctx.font = `${mid}px ${fontFamily}`
    const lines = wrapText(ctx, text, maxW)
    const totalH = lines.length * mid * 1.35
    if (totalH <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return lo
}

/** Fit font size for vertical layout */
function fitFontSizeV(text: string, maxW: number, maxH: number): number {
  const chars = [...text].length
  // Each char takes fontSize * 1.2 height, columns take fontSize * 1.3 width
  // Try to fit: cols * 1.3 * fs <= maxW, charsPerCol * 1.2 * fs <= maxH
  let lo = 8, hi = Math.min(maxW, maxH)
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    const charsPerCol = Math.max(1, Math.floor(maxH / (mid * 1.2)))
    const cols = Math.ceil(chars / charsPerCol)
    if (cols * mid * 1.3 <= maxW && charsPerCol * mid * 1.2 <= maxH) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return lo
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const char of text) {
    const test = current + char
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current)
      current = char
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : [text]
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}
