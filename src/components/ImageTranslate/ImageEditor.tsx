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

    // Pre-compute pixel coords for all blocks with L1/L2 separation
    type BlockRenderInfo = {
      block: TextBlock
      // L1 positioning + color (polygon blocks use l1Color*, non-polygon use color*)
      l1x: number; l1y: number; l1w: number; l1h: number
      l1PolyPixels: Array<{x: number, y: number}> | null
      l1ColorOpts: { hue: number; saturation: number; opacity: number }
      // L2 positioning (text)
      l2x: number; l2y: number; l2w: number; l2h: number
      sampledBg: string
    }
    const infos: BlockRenderInfo[] = []
    for (const block of blocks) {
      const x = Math.round(block.bbox.x * img.naturalWidth)
      const y = Math.round(block.bbox.y * img.naturalHeight)
      const w = Math.round(block.bbox.w * img.naturalWidth)
      const h = Math.round(block.bbox.h * img.naturalHeight)
      if (w <= 0 || h <= 0) continue

      // Sample background color once for this block
      const sampledBg = sampleFillColor(ctx, x, y, w, h)
      
      // L1: Cleanup positioning
      let l1x = x, l1y = y, l1w = w, l1h = h
      let l1PolyPixels: Array<{x: number, y: number}> | null = null
      const poly = block.polygon && block.polygon.length >= 3 ? block.polygon : null
      if (poly) {
        l1PolyPixels = poly.map(p => ({ x: p.x * img.naturalWidth, y: p.y * img.naturalHeight }))
        const pxs = l1PolyPixels.map(p => p.x)
        const pys = l1PolyPixels.map(p => p.y)
        l1x = Math.round(Math.min(...pxs))
        l1y = Math.round(Math.min(...pys))
        l1w = Math.round(Math.max(...pxs) - l1x)
        l1h = Math.round(Math.max(...pys) - l1y)
      }
      
      // L2: Text positioning
      const l2x = x
      const l2y = y
      const l2w = w
      const l2h = h
      
      // Polygon blocks use l1Color* (controlled via L1 card in TranslationList)
      // Non-polygon blocks use color* (controlled via single color panel in TranslationList)
      infos.push({
        block,
        // L1 data
        l1x, l1y, l1w, l1h, l1PolyPixels,
        l1ColorOpts: poly
          ? { hue: block.l1ColorHue ?? 0, saturation: block.l1ColorSaturation ?? 1, opacity: block.l1ColorOpacity ?? 1 }
          : { hue: block.colorHue ?? 0, saturation: block.colorSaturation ?? 1, opacity: block.colorOpacity ?? 1 },
        // L2 data
        l2x, l2y, l2w, l2h,
        sampledBg,
      })
    }

    // Pass 1: Layer 1 — background cleanup (fills polygon or rounded rect)
    for (const { block, l1x, l1y, l1w, l1h, l1PolyPixels, l1ColorOpts, sampledBg } of infos) {
      const blockType = block.type || 'bubble'
      if (blockType === 'sfx') continue // SFX usually doesn't have a background cleanup layer
      
      const rotation = block.rotation ?? 0
      const fillColor = adjustColor(sampledBg, l1ColorOpts)
      
      ctx.save()
      if (rotation !== 0) {
        ctx.translate(l1x + l1w / 2, l1y + l1h / 2)
        ctx.rotate(rotation * Math.PI / 180)
        ctx.translate(-(l1x + l1w / 2), -(l1y + l1h / 2))
      }

      ctx.beginPath()
      if (l1PolyPixels) {
        ctx.moveTo(l1PolyPixels[0].x, l1PolyPixels[0].y)
        for (let pi = 1; pi < l1PolyPixels.length; pi++) ctx.lineTo(l1PolyPixels[pi].x, l1PolyPixels[pi].y)
        ctx.closePath()
      } else {
        // Auto-adapt shape based on block type
        const outset = 2 // Small expansion to ensure original text is fully covered
        const ox = l1x - outset, oy = l1y - outset, ow = l1w + outset * 2, oh = l1h + outset * 2
        
        if (blockType === 'bubble') {
          // Use ellipse for speech bubbles
          ctx.ellipse(ox + ow / 2, oy + oh / 2, ow / 2, oh / 2, 0, 0, Math.PI * 2)
        } else {
          // Use rounded rect for captions
          roundRect(ctx, ox, oy, ow, oh, 8)
        }
      }
      
      ctx.fillStyle = fillColor
      ctx.globalAlpha = l1ColorOpts.opacity
      ctx.fill()
      ctx.restore()
    }

    // Pass 2: Layer 2 — translation text inlay
    for (const { block, l2x, l2y, l2w, l2h, sampledBg } of infos) {
      const blockType: TextBlockType = block.type || 'bubble'
      const dir: TextDirection = block.direction || 'horizontal'
      const rotation = block.rotation ?? 0
      ctx.save()
      if (rotation !== 0) {
        ctx.translate(l2x + l2w / 2, l2y + l2h / 2)
        ctx.rotate(rotation * Math.PI / 180)
        ctx.translate(-(l2x + l2w / 2), -(l2y + l2h / 2))
      }
      if (blockType === 'bubble') {
        renderBubbleText(ctx, block.translation, l2x, l2y, l2w, l2h, fontFamily, dir, sampledBg)
      } else if (blockType === 'sfx') {
        renderSfx(ctx, block.translation, l2x, l2y, l2w, l2h, fontFamily, dir)
      } else {
        renderCaptionText(ctx, block.translation, l2x, l2y, l2w, l2h, fontFamily, dir)
      }
      ctx.restore()
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

interface ColorOpts { hue: number; saturation: number; opacity: number }

// ── Bubble: background fill + text ──
// ── Bubble: text only (Pass 2) ──
function renderBubbleText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, dir: TextDirection, sampledBg: string,
) {
  if (!text) return
  const brightness = parseBrightness(sampledBg)
  const textColor = brightness > 128 ? '#000000' : '#ffffff'

  // Use tighter safe area for elliptical bubbles (80% of width/height)
  const padW = w * 0.1, padH = h * 0.1
  const sw = w - padW * 2, sh = h - padH * 2
  const sx = x + padW, sy = y + padH

  if (dir === 'vertical') {
    renderVertical(ctx, text, sx, sy, sw, sh, fontFamily, textColor)
  } else {
    renderHorizontal(ctx, text, sx, sy, sw, sh, fontFamily, textColor, null)
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

// ── Caption: text only (Pass 2) ──
function renderCaptionText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, dir: TextDirection,
) {
  if (!text) return
  // Captions use 15% safe area to avoid hitting rounded corners
  const padW = w * 0.15, padH = h * 0.15
  const sw = w - padW * 2, sh = h - padH * 2
  const sx = x + padW, sy = y + padH
  
  if (dir === 'vertical') {
    renderVertical(ctx, text, sx, sy, sw, sh, fontFamily, '#222222')
  } else {
    renderHorizontal(ctx, text, sx, sy, sw, sh, fontFamily, '#222222', null)
  }
}

// ── Horizontal rendering ──
function renderHorizontal(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, w: number, h: number,
  fontFamily: string, color: string,
  polyPixels?: Array<{x: number, y: number}> | null,
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
    const lineY = startY + i * lineHeight
    if (polyPixels) {
      // Scanline: find polygon x-range at this line's center y
      const scanY = lineY + lineHeight / 2
      const range = getPolygonScanline(polyPixels, scanY)
      if (range) {
        ctx.fillText(lines[i], (range[0] + range[1]) / 2, lineY)
      } else {
        ctx.fillText(lines[i], x + w / 2, lineY)
      }
    } else {
      ctx.fillText(lines[i], x + w / 2, lineY)
    }
  }
}

/** Compute left/right x intersection of polygon at a given y scanline */
function getPolygonScanline(poly: Array<{x: number, y: number}>, y: number): [number, number] | null {
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y)
      xs.push(a.x + t * (b.x - a.x))
    }
  }
  if (xs.length < 2) return null
  return [Math.min(...xs), Math.max(...xs)]
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

function sampleFillColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  // Sample along the four edges, but shifted 2px inward to avoid picking up borders
  const samples: Array<[number, number, number]> = []
  const steps = 8
  const inset = 2
  
  function sample(px: number, py: number) {
    try {
      const pixel = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data
      samples.push([pixel[0], pixel[1], pixel[2]])
    } catch { /* skip */ }
  }
  
  // Only sample if box is large enough to inset
  const sx = w > inset * 2 ? x + inset : x
  const sy = y > inset * 2 ? y + inset : y
  const sw = w > inset * 2 ? w - inset * 2 : w
  const sh = h > inset * 2 ? h - inset * 2 : h

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    sample(sx + t * sw, sy)              // top edge (inset)
    sample(sx + t * sw, sy + sh)          // bottom edge (inset)
    sample(sx, sy + t * sh)              // left edge (inset)
    sample(sx + sw, sy + t * sh)          // right edge (inset)
  }
  if (samples.length === 0) return 'rgb(255, 255, 255)'
  const avg = samples.reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
  const n = samples.length
  return `rgb(${Math.round(avg[0] / n)}, ${Math.round(avg[1] / n)}, ${Math.round(avg[2] / n)})`
}

/** Apply hue shift, saturation multiplier to an rgb(...) color string */
function adjustColor(color: string, opts: ColorOpts): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) return color
  const r = parseInt(m[1]) / 255
  const g = parseInt(m[2]) / 255
  const b = parseInt(m[3]) / 255

  // RGB → HSL
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  // Apply adjustments
  h = (h + opts.hue / 360 + 1) % 1
  s = Math.max(0, Math.min(1, s * opts.saturation))

  // HSL → RGB
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  let nr: number, ng: number, nb: number
  if (s === 0) { nr = ng = nb = l } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    nr = hue2rgb(p, q, h + 1/3)
    ng = hue2rgb(p, q, h)
    nb = hue2rgb(p, q, h - 1/3)
  }
  return `rgb(${Math.round(nr * 255)},${Math.round(ng * 255)},${Math.round(nb * 255)})`
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
