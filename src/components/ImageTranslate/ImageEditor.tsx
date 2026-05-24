import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Line, Group, Transformer, Text, Circle } from 'react-konva'
import type Konva from 'konva'
import type { TextBlock, TextBlockType, TextDirection } from '../../types'

// Helper to split text into vertical columns, handling paragraph breaks
function getVerticalColumns(text: string, fontSize: number, maxH: number): string[] {
  const paragraphs = text.split('\n')
  const columns: string[] = []
  const maxCharsPerCol = Math.max(1, Math.floor(maxH / (fontSize * 1.2)))

  for (const para of paragraphs) {
    if (!para) {
      columns.push('')
      continue
    }
    const chars = [...para]
    for (let i = 0; i < chars.length; i += maxCharsPerCol) {
      columns.push(chars.slice(i, i + maxCharsPerCol).join('\n'))
    }
  }
  return columns
}

// Helper to calculate spiky starburst/explosion mask coordinates
function getBurstPoints(w: number, h: number, spikes = 16): number[] {
  const points: number[] = []
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2
  const ry = h / 2
  
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes
    const factor = i % 2 === 0 ? 1 : 0.72 // Outer points at 100%, inner points at 72%
    const x = cx + rx * factor * Math.cos(angle)
    const y = cy + ry * factor * Math.sin(angle)
    points.push(x, y)
  }
  return points
}

interface Props {
  imageUrl: string
  blocks: TextBlock[]
  fontFamily: string
  selectedIndex?: number | null
  onSelect?: (index: number | null, source?: 'canvas' | 'list') => void
  onUpdateBlock?: (index: number, partial: Partial<TextBlock>) => void
  onDeleteBlock?: (index: number) => void
  onAddBlock?: (block: TextBlock) => void
  drawPolygonForIndex?: number | null
  onPolygonDrawn?: () => void
}

export interface ImageEditorHandle {
  exportBlob: () => Promise<Blob | null>
}
function useLoadedImage(url?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImg(null)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
    image.src = url
  }, [url])
  return img
}

const WandMask = ({ url, w, h, opacity }: { url: string; w: number; h: number; opacity: number }) => {
  const img = useLoadedImage(url)
  if (!img) return null
  return <KonvaImage image={img} x={0} y={0} width={w} height={h} opacity={opacity} />
}

export const ImageEditor = forwardRef<ImageEditorHandle, Props>(({
  imageUrl,
  blocks,
  fontFamily,
  selectedIndex,
  onSelect,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
  drawPolygonForIndex,
  onPolygonDrawn,
}, ref) => {
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const selectedNodeRef = useRef<Konva.Group | null>(null)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  // Drawing state (for adding new blocks)
  const [isDrawingRect, setIsDrawingRect] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 })
  
  // New block form popup state
  const [newBlockForm, setNewBlockForm] = useState<{
    x: number; y: number; w: number; h: number;
    normX: number; normY: number; normW: number; normH: number;
  } | null>(null)
  const [newTranslation, setNewTranslation] = useState('')
  const [newType, setNewType] = useState<TextBlockType>('bubble')
  const [newDirection, setNewDirection] = useState<TextDirection>('horizontal')

  // Polygon drawing state
  const [polyPts, setPolyPts] = useState<Array<{ x: number; y: number }>>([])
  const isDrawingPoly = drawPolygonForIndex != null

  // Reset polygon points when drawing starts
  useEffect(() => {
    setPolyPts([])
  }, [drawPolygonForIndex])

  // Load the background image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageEl(img)
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight })

      // Set up offscreen canvas for background color sampling
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        offscreenCanvasRef.current = canvas
        offscreenCtxRef.current = ctx
      }
    }
    img.src = imageUrl
  }, [imageUrl])

  // Sample background color (edge detection)
  const sampleBgColor = useCallback((x: number, y: number, w: number, h: number): string => {
    const ctx = offscreenCtxRef.current
    if (!ctx) return 'rgb(255, 255, 255)'

    const samples: Array<[number, number, number]> = []
    const steps = 8
    const inset = 2

    function sample(px: number, py: number) {
      if (!ctx) return
      try {
        const pixel = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data
        samples.push([pixel[0], pixel[1], pixel[2]])
      } catch { /* skip */ }
    }

    const sx = w > inset * 2 ? x + inset : x
    const sy = y > inset * 2 ? y + inset : y
    const sw = w > inset * 2 ? w - inset * 2 : w
    const sh = h > inset * 2 ? h - inset * 2 : h

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      sample(sx + t * sw, sy)              // top edge
      sample(sx + t * sw, sy + sh)          // bottom edge
      sample(sx, sy + t * sh)              // left edge
      sample(sx + sw, sy + t * sh)          // right edge
    }

    if (samples.length === 0) return 'rgb(255, 255, 255)'
    const avg = samples.reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
    const n = samples.length
    return `rgb(${Math.round(avg[0] / n)}, ${Math.round(avg[1] / n)}, ${Math.round(avg[2] / n)})`
  }, [])

  // Brightness check for auto-text color contrast
  const getAutoTextColor = useCallback((bgColor: string): string => {
    const m = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (!m) return '#000000'
    const r = parseInt(m[1])
    const g = parseInt(m[2])
    const b = parseInt(m[3])
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 128 ? '#000000' : '#ffffff'
  }, [])

  // Auto-fit font size based on text constraints
  const fitFontSize = useCallback((
    text: string,
    maxW: number,
    maxH: number,
    fontFamilyStr: string,
    dir: 'horizontal' | 'vertical',
    isBold: boolean
  ): number => {
    if (!text) return 16
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 16

    const fontStyleStr = isBold ? 'bold ' : ''

    if (dir === 'vertical') {
      let lo = 8, hi = Math.min(maxW, maxH)
      while (lo < hi - 1) {
        const mid = Math.floor((lo + hi) / 2)
        const charsPerCol = Math.max(1, Math.floor(maxH / (mid * 1.2)))
        
        // Calculate columns count taking newlines/paragraphs into account
        const paragraphs = text.split('\n')
        let cols = 0
        for (const para of paragraphs) {
          cols += Math.ceil([...para].length / charsPerCol) || 1
        }
        
        if (cols * mid * 1.35 <= maxW && charsPerCol * mid * 1.2 <= maxH) {
          lo = mid
        } else {
          hi = mid
        }
      }
      return lo
    } else {
      // Horizontal wrapping fit
      let lo = 8, hi = Math.min(maxW, maxH)
      while (lo < hi - 1) {
        const mid = Math.floor((lo + hi) / 2)
        ctx.font = `${fontStyleStr}${mid}px ${fontFamilyStr}`
        
        // Simple wrap check
        const words = text.includes(' ') ? text.split(' ') : [...text]
        let linesCount = 1
        let currentLineWidth = 0
        let wordTooLong = false

        for (const word of words) {
          const wordW = ctx.measureText(word).width
          if (wordW > maxW) {
            wordTooLong = true
            break
          }
          if (currentLineWidth + wordW > maxW) {
            linesCount++
            currentLineWidth = wordW
          } else {
            currentLineWidth += wordW + (text.includes(' ') ? ctx.measureText(' ').width : 0)
          }
        }

        const totalH = linesCount * mid * 1.35
        if (!wordTooLong && totalH <= maxH) {
          lo = mid
        } else {
          hi = mid
        }
      }
      return lo
    }
  }, [])

  const runFloodFill = useCallback((clickX: number, clickY: number, blockIndex: number) => {
    const ctx = offscreenCtxRef.current
    if (!ctx) return

    const block = blocks[blockIndex]
    if (!block) return

    const bx = Math.round(block.bbox.x * dimensions.width)
    const by = Math.round(block.bbox.y * dimensions.height)
    const bw = Math.round(block.bbox.w * dimensions.width)
    const bh = Math.round(block.bbox.h * dimensions.height)

    if (bw <= 0 || bh <= 0) return

    // Load Image Data for the block bounding box
    let imgData: ImageData
    try {
      imgData = ctx.getImageData(bx, by, bw, bh)
    } catch (e) {
      console.error('Failed to get image data for flood fill', e)
      return
    }

    const data = imgData.data
    const width = bw
    const height = bh

    // Coordinates relative to bounding box
    const startX = Math.round(clickX - bx)
    const startY = Math.round(clickY - by)

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return

    const startIdx = (startY * width + startX) * 4
    const startR = data[startIdx]
    const startG = data[startIdx + 1]
    const startB = data[startIdx + 2]

    // Create visited pixels tracking
    const visited = new Uint8Array(width * height)
    const queue: number[] = [startY * width + startX]
    visited[startY * width + startX] = 1

    const tolerance = 45
    
    // Draw the mask on temporary canvas
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    const maskImgData = tempCtx.createImageData(width, height)
    const maskData = maskImgData.data

    let eraseColor = sampleBgColor(bx, by, bw, bh)
    if (block.fillColorMode === 'custom' && block.fillColorCustom) {
      eraseColor = block.fillColorCustom
    }
    
    let r = 255, g = 255, b = 255
    const m = eraseColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (m) {
      r = parseInt(m[1])
      g = parseInt(m[2])
      b = parseInt(m[3])
    } else if (eraseColor.startsWith('#')) {
      const hex = eraseColor.replace('#', '')
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    }

    let head = 0
    let tail = 1

    while (head < tail) {
      const curr = queue[head++]
      const cy = Math.floor(curr / width)
      const cx = curr % width

      const idx = curr * 4
      maskData[idx] = r
      maskData[idx + 1] = g
      maskData[idx + 2] = b
      maskData[idx + 3] = 255 // Opaque

      const neighbors = [
        { x: cx + 1, y: cy },
        { x: cx - 1, y: cy },
        { x: cx, y: cy + 1 },
        { x: cx, y: cy - 1 }
      ]

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
          const nIdx = n.y * width + n.x
          if (!visited[nIdx]) {
            visited[nIdx] = 1
            const pIdx = nIdx * 4
            const nr = data[pIdx]
            const ng = data[pIdx + 1]
            const nb = data[pIdx + 2]
            
            const d = Math.sqrt((nr - startR) ** 2 + (ng - startG) ** 2 + (nb - startB) ** 2)
            const brightness = (nr * 299 + ng * 587 + nb * 114) / 1000

            if (d <= tolerance && brightness > 40) {
              queue[tail++] = nIdx
            }
          }
        }
      }
    }

    tempCtx.putImageData(maskImgData, 0, 0)
    const magicMaskUrl = tempCanvas.toDataURL('image/png')

    onUpdateBlock?.(blockIndex, {
      magicMaskUrl,
      magicMaskBbox: { x: bx, y: by, w: bw, h: bh }
    })
  }, [blocks, dimensions, sampleBgColor, onUpdateBlock])

  // Apply Transformer when selection changes
  useEffect(() => {
    if (transformerRef.current) {
      if (selectedIndex != null && selectedNodeRef.current) {
        transformerRef.current.nodes([selectedNodeRef.current])
        transformerRef.current.getLayer()?.batchDraw()
      } else {
        transformerRef.current.nodes([])
        transformerRef.current.getLayer()?.batchDraw()
      }
    }
  }, [selectedIndex])

  // Support file export
  useImperativeHandle(ref, () => ({
    async exportBlob() {
      const stage = stageRef.current
      if (!stage) return null

      // Temporarily deselect any active transformer nodes
      const oldNodes = transformerRef.current?.nodes() || []
      transformerRef.current?.nodes([])
      stage.batchDraw()

      return new Promise<Blob | null>((resolve) => {
        try {
          const dataUrl = stage.toDataURL({ pixelRatio: 1 })
          fetch(dataUrl)
            .then(res => res.blob())
            .then(resolve)
            .catch(() => resolve(null))
        } catch (e) {
          console.error('Failed to export canvas blob:', e)
          resolve(null)
        } finally {
          // Re-apply transformer
          if (oldNodes.length > 0) {
            transformerRef.current?.nodes(oldNodes)
            stage.batchDraw()
          }
        }
      })
    },
  }))

  const handleStageMouseDown = (e: any) => {
    const clickedOnEmptySpace = e.target === e.target.getStage() || e.target.name() === 'background-image'

    if (isDrawingPoly) {
      // Add polygon vertex
      const stage = stageRef.current
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      
      const nx = pos.x / dimensions.width
      const ny = pos.y / dimensions.height

      // Check if clicking near the first point to close the polygon
      if (polyPts.length >= 3) {
        const first = polyPts[0]
        const dist = Math.hypot(nx - first.x, ny - first.y)
        if (dist < 0.025) {
          commitPolygon(polyPts)
          return
        }
      }
      setPolyPts(prev => [...prev, { x: nx, y: ny }])
      return
    }

    if (typeof selectedIndex === 'number' && blocks[selectedIndex]) {
      const selBlock = blocks[selectedIndex]
      if (selBlock.maskShape === 'magic-wand') {
        const stage = stageRef.current
        if (stage) {
          const pos = stage.getPointerPosition()
          if (pos) {
            const bx = selBlock.bbox.x * dimensions.width
            const by = selBlock.bbox.y * dimensions.height
            const bw = selBlock.bbox.w * dimensions.width
            const bh = selBlock.bbox.h * dimensions.height
            if (pos.x >= bx && pos.x <= bx + bw && pos.y >= by && pos.y <= by + bh) {
              runFloodFill(pos.x, pos.y, selectedIndex)
              return
            }
          }
        }
      }
    }

    if (clickedOnEmptySpace) {
      onSelect?.(null)
      setNewBlockForm(null)

      // Start drawing a rectangle
      const stage = stageRef.current
      if (!stage) return
      const pos = stage.getPointerPosition()
      if (!pos) return
      
      setIsDrawingRect(true)
      setStartPos({ x: pos.x, y: pos.y })
      setCurrentPos({ x: pos.x, y: pos.y })
    }
  }

  const handleStageMouseMove = () => {
    if (!isDrawingRect) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    
    setCurrentPos({ x: pos.x, y: pos.y })
  }

  const handleStageMouseUp = () => {
    if (!isDrawingRect) return
    setIsDrawingRect(false)

    const w = currentPos.x - startPos.x
    const h = currentPos.y - startPos.y
    const absW = Math.abs(w)
    const absH = Math.abs(h)

    // Minimum creation size
    if (absW > 10 && absH > 10) {
      const x = Math.min(startPos.x, currentPos.x)
      const y = Math.min(startPos.y, currentPos.y)
      
      setNewBlockForm({
        x, y, w: absW, h: absH,
        normX: x / dimensions.width,
        normY: y / dimensions.height,
        normW: absW / dimensions.width,
        normH: absH / dimensions.height,
      })
      setNewTranslation('')
      setNewType('bubble')
      setNewDirection('horizontal')
    }
  }

  const confirmNewBlock = () => {
    if (!newBlockForm || !newTranslation.trim()) return
    onAddBlock?.({
      original: '',
      translation: newTranslation.trim(),
      type: newType,
      direction: newDirection,
      bbox: {
        x: newBlockForm.normX,
        y: newBlockForm.normY,
        w: newBlockForm.normW,
        h: newBlockForm.normH,
      },
    })
    setNewBlockForm(null)
  }

  const commitPolygon = (pts: Array<{ x: number; y: number }>) => {
    if (drawPolygonForIndex == null || pts.length < 3) return
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    
    onUpdateBlock?.(drawPolygonForIndex, {
      polygon: pts,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    })
    setPolyPts([])
    onPolygonDrawn?.()
  }

  const cancelPolygon = () => {
    setPolyPts([])
    onPolygonDrawn?.()
  }

  if (!imageEl) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-gray-400">
        正在加载编辑器...
      </div>
    )
  }

  // Selected block bounding coordinates for absolute controls (e.g. Delete Button)
  const selectedBlock = selectedIndex != null ? blocks[selectedIndex] : null
  let deleteBtnStyle: React.CSSProperties | null = null
  if (selectedBlock) {
    const rx = Math.round(selectedBlock.bbox.x * 100)
    const ry = Math.round(selectedBlock.bbox.y * 100)
    deleteBtnStyle = {
      position: 'absolute',
      left: `calc(${rx}% + ${Math.round(selectedBlock.bbox.w * 100)}% + 4px)`,
      top: `calc(${ry}% - 12px)`,
      zIndex: 30,
    }
  }

  return (
    <div className="relative select-none" style={{ touchAction: 'none' }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
        style={{ cursor: isDrawingPoly ? 'crosshair' : 'default' }}
        onMouseDown={handleStageMouseDown}
        onTouchStart={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onTouchMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchEnd={handleStageMouseUp}
      >
        <Layer>
          {/* Background image */}
          <KonvaImage
            image={imageEl}
            width={dimensions.width}
            height={dimensions.height}
            name="background-image"
          />

          {/* Text blocks */}
          {blocks.map((block, i) => {
            const x = Math.round(block.bbox.x * dimensions.width)
            const y = Math.round(block.bbox.y * dimensions.height)
            const w = Math.round(block.bbox.w * dimensions.width)
            const h = Math.round(block.bbox.h * dimensions.height)
            if (w <= 0 || h <= 0) return null

            const isSelected = selectedIndex === i
            const dir = block.direction || 'horizontal'
            const isVertical = dir === 'vertical'
            const isSFX = block.type === 'sfx'
            const isCaption = block.type === 'caption'

            // Sample background
            const sampledBg = sampleBgColor(x, y, w, h)
            const autoText = getAutoTextColor(sampledBg)
            
            // Adjust Background Color based on fillColorMode
            let eraseColor = sampledBg
            const activeShape = block.maskShape || (
              (block.polygon && block.polygon.length >= 3) ? 'polygon' :
              isCaption ? 'rounded-rect' :
              isSFX ? 'none' : 'ellipse'
            )
            let shouldErase = activeShape !== 'none'
            
            if (block.fillColorMode === 'transparent') {
              shouldErase = false
            } else if (block.fillColorMode === 'custom' && block.fillColorCustom) {
              eraseColor = block.fillColorCustom
            }
            const opacity = block.fillOpacity ?? 1

            // Adjust Text styles
            const isBold = block.fontWeight === 'bold'
            const isItalic = block.fontStyle === 'italic'
            const textFill = block.textColor || (isCaption ? '#222222' : autoText)
            const blockFontFamily = block.fontFamilyCustom || fontFamily
            const strokeColor = block.strokeColor || '#ffffff'
            const strokeWidth = block.strokeWidth ?? 3


            // Calculate font size
            let computedFontSize = 16
            if (block.fontSizeMode === 'custom' && block.fontSizeCustom) {
              computedFontSize = block.fontSizeCustom
            } else {
              const baseFit = fitFontSize(block.translation, w * 0.85, h * 0.85, blockFontFamily, dir, isBold)
              computedFontSize = Math.max(8, baseFit * (block.fontSizeMultiplier ?? 1))
            }

            // Text formatting
            let textToDraw = block.translation
            if (isVertical) {
              // Convert text to vertical representation
              textToDraw = [...block.translation].join('\n')
            }

            // Word wrap configurations (for Konva Text)
            const hasSpaces = block.translation.includes(' ')
            const wrapMode = hasSpaces ? 'word' : 'char'

            // Polygon points if custom mask is defined
            let polygonPts: number[] = []
            if (block.polygon && block.polygon.length >= 3) {
              polygonPts = block.polygon.reduce((acc: number[], pt) => {
                acc.push(pt.x * dimensions.width, pt.y * dimensions.height)
                return acc
              }, [])
            }

            return (
              <Group
                key={i}
                x={x + w / 2}
                y={y + h / 2}
                width={w}
                height={h}
                rotation={block.rotation ?? 0}
                offsetX={w / 2}
                offsetY={h / 2}
                ref={(node) => {
                  if (isSelected) {
                    selectedNodeRef.current = node
                  }
                }}
                draggable={!isDrawingPoly}
                onMouseDown={() => !isDrawingPoly && onSelect?.(i, 'canvas')}
                onTouchStart={() => !isDrawingPoly && onSelect?.(i, 'canvas')}
                onDragStart={() => !isDrawingPoly && onSelect?.(i, 'canvas')}
                onDragEnd={(e) => {
                  const node = e.target
                  // Convert center coordinates back to relative x,y (top-left bounding box)
                  const newX = (node.x() - node.width() / 2) / dimensions.width
                  const newY = (node.y() - node.height() / 2) / dimensions.height
                  onUpdateBlock?.(i, {
                    bbox: {
                      x: Math.max(0, Math.min(1 - block.bbox.w, newX)),
                      y: Math.max(0, Math.min(1 - block.bbox.h, newY)),
                      w: block.bbox.w,
                      h: block.bbox.h,
                    },
                  })
                }}
                onTransformEnd={(e) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  
                  // Reset scale so attributes represent absolute sizes
                  node.scaleX(1)
                  node.scaleY(1)

                  const rotatedW = node.width() * scaleX
                  const rotatedH = node.height() * scaleY
                  
                  // Compute new relative x/y (top-left of bounding box)
                  const newX = (node.x() - rotatedW / 2) / dimensions.width
                  const newY = (node.y() - rotatedH / 2) / dimensions.height
                  const newW = rotatedW / dimensions.width
                  const newH = rotatedH / dimensions.height

                  onUpdateBlock?.(i, {
                    bbox: {
                      x: Math.max(0, Math.min(1 - newW, newX)),
                      y: Math.max(0, Math.min(1 - newH, newY)),
                      w: Math.max(0.01, newW),
                      h: Math.max(0.01, newH),
                    },
                    rotation: Math.round(node.rotation()),
                  })
                }}
              >
                {/* Layer 1: Background Cleanup Mask */}
                {shouldErase && (
                  activeShape === 'polygon' && polygonPts.length >= 6 ? (
                    // Polygon Mask: Offset to group coordinate system
                    <Line
                      points={polygonPts.map((val, idx) => {
                        const offset = idx % 2 === 0 ? x : y
                        return val - offset
                      })}
                      fill={eraseColor}
                      closed
                      opacity={opacity}
                    />
                  ) : activeShape === 'rect' ? (
                    // Rect Mask
                    <Rect
                      x={0}
                      y={0}
                      width={w}
                      height={h}
                      fill={eraseColor}
                      opacity={opacity}
                    />
                  ) : activeShape === 'rounded-rect' ? (
                    // Rounded Rect Mask
                    <Rect
                      x={0}
                      y={0}
                      width={w}
                      height={h}
                      fill={eraseColor}
                      cornerRadius={8}
                      opacity={opacity}
                    />
                  ) : activeShape === 'circle' ? (
                    // Circle Mask
                    <Circle
                      x={w / 2}
                      y={h / 2}
                      radius={Math.min(w, h) / 2}
                      fill={eraseColor}
                      opacity={opacity}
                    />
                  ) : activeShape === 'capsule' ? (
                    // Capsule Mask
                    <Rect
                      x={0}
                      y={0}
                      width={w}
                      height={h}
                      fill={eraseColor}
                      cornerRadius={Math.min(w, h) / 2}
                      opacity={opacity}
                    />
                  ) : activeShape === 'diamond' ? (
                    // Diamond Mask
                    <Line
                      points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
                      fill={eraseColor}
                      closed
                      opacity={opacity}
                    />
                  ) : activeShape === 'burst' ? (
                    // Burst Mask
                    <Line
                      points={getBurstPoints(w, h)}
                      fill={eraseColor}
                      closed
                      opacity={opacity}
                    />
                  ) : activeShape === 'ellipse' ? (
                    // Bubble Mask: Ellipse
                    <Ellipse
                      x={w / 2}
                      y={h / 2}
                      radiusX={w / 2}
                      radiusY={h / 2}
                      fill={eraseColor}
                      opacity={opacity}
                    />
                  ) : activeShape === 'magic-wand' && block.magicMaskUrl ? (
                    // Magic Wand Mask
                    <WandMask
                      url={block.magicMaskUrl}
                      w={w}
                      h={h}
                      opacity={opacity}
                    />
                  ) : null
                )}

                {/* Layer 2: Text Inlay */}
                {block.translation && (
                  isVertical ? (
                    (() => {
                      const columns = getVerticalColumns(block.translation, computedFontSize, h * 0.85)
                      const colW = computedFontSize
                      const colSpacing = computedFontSize * 0.35
                      const totalColsW = columns.length * colW + (columns.length - 1) * colSpacing
                      const startX = (w * 0.85 - totalColsW) / 2

                      return (
                        <>
                          {columns.map((colText, colIdx) => {
                            const colX = w * 0.075 + startX + (columns.length - 1 - colIdx) * (colW + colSpacing)
                            return (
                              <Text
                                key={colIdx}
                                x={colX}
                                y={h * 0.075}
                                width={colW}
                                height={h * 0.85}
                                text={colText}
                                fontSize={computedFontSize}
                                fontFamily={blockFontFamily.replace(/"/g, '')}
                                fontStyle={`${isItalic ? 'italic ' : ''}${isBold ? 'bold' : 'normal'}`}
                                fill={textFill}
                                align="center"
                                verticalAlign="middle"
                                lineHeight={1.2}
                                wrap="char"
                                stroke={block.strokeEnabled ?? isSFX ? strokeColor : undefined}
                                strokeWidth={block.strokeEnabled ?? isSFX ? strokeWidth : 0}
                                strokeScaleEnabled={false}
                              />
                            )
                          })}
                        </>
                      )
                    })()
                  ) : (
                    <Text
                      x={w * 0.075}
                      y={h * 0.075}
                      width={w * 0.85}
                      height={h * 0.85}
                      text={textToDraw}
                      fontSize={computedFontSize}
                      fontFamily={blockFontFamily.replace(/"/g, '')}
                      fontStyle={`${isItalic ? 'italic ' : ''}${isBold ? 'bold' : 'normal'}`}
                      fill={textFill}
                      align={block.textAlign || 'center'}
                      verticalAlign="middle"
                      lineHeight={block.lineHeight || 1.3}
                      wrap={wrapMode}
                      
                      // Stroke properties
                      stroke={block.strokeEnabled ?? isSFX ? strokeColor : undefined}
                      strokeWidth={block.strokeEnabled ?? isSFX ? strokeWidth : 0}
                      strokeScaleEnabled={false}
                    />
                  )
                )}
              </Group>
            )
          })}

          {/* Render in-progress drawn rectangle */}
          {isDrawingRect && (
            <Rect
              x={Math.min(startPos.x, currentPos.x)}
              y={Math.min(startPos.y, currentPos.y)}
              width={Math.abs(currentPos.x - startPos.x)}
              height={Math.abs(currentPos.y - startPos.y)}
              stroke="#10b981"
              strokeWidth={2}
              dash={[6, 4]}
              fill="rgba(16,185,129,0.08)"
            />
          )}

          {/* Render in-progress drawn polygon lines */}
          {isDrawingPoly && polyPts.length >= 1 && (
            <>
              <Line
                points={polyPts.reduce((acc: number[], pt) => {
                  acc.push(pt.x * dimensions.width, pt.y * dimensions.height)
                  return acc
                }, [])}
                stroke="#10b981"
                strokeWidth={2}
                dash={[5, 3]}
                fill="rgba(16,185,129,0.1)"
                closed={polyPts.length >= 3}
              />
              {/* Vertex anchors */}
              {polyPts.map((pt, idx) => (
                <Circle
                  key={idx}
                  x={pt.x * dimensions.width}
                  y={pt.y * dimensions.height}
                  radius={5}
                  fill={idx === 0 && polyPts.length >= 3 ? '#f59e0b' : '#10b981'}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </>
          )}

          {/* Konva Transformer handles */}
          {!isDrawingPoly && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // Enforce minimum box dimensions during resize
                if (newBox.width < 10 || newBox.height < 10) {
                  return oldBox
                }
                return newBox
              }}
              rotateEnabled={true}
              enabledAnchors={['nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w']}
              anchorSize={7}
              anchorCornerRadius={2}
              anchorStroke="#3b82f6"
              anchorFill="#ffffff"
              borderStroke="#3b82f6"
              borderStrokeWidth={1.5}
            />
          )}
        </Layer>
      </Stage>

      {/* ── HTML Overlays (rendered absolute on top of parent element) ── */}

      {/* Delete Button overlay next to selection */}
      {selectedBlock && onDeleteBlock && deleteBtnStyle && (
        <button
          type="button"
          aria-label="删除此文本块"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteBlock(selectedIndex!)
            onSelect?.(null)
          }}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md transition-colors"
          style={deleteBtnStyle}
        >
          ×
        </button>
      )}

      {/* Magic Wand Guidance Tooltip */}
      {selectedBlock && selectedBlock.maskShape === 'magic-wand' && !selectedBlock.magicMaskUrl && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-blue-500/90 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-blue-400 backdrop-blur-md animate-bounce"
          onClick={(e) => e.stopPropagation()}
        >
          <span>🪄 <b>魔棒模式已开启</b>：请在画布上该气泡内的白色背景处点击一下以智能追踪并识别轮廓</span>
        </div>
      )}

      {/* Polygon Drawing Control Bar */}
      {isDrawingPoly && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-black/80 dark:bg-gray-900/90 text-white text-xs px-3.5 py-2 rounded-full shadow-lg border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          <span>
            {polyPts.length < 3
              ? `点击添加顶点 (${polyPts.length}/3+)`
              : `${polyPts.length}个顶点 · 点击首点或按钮完成`}
          </span>
          {polyPts.length >= 3 && (
            <button
              type="button"
              onClick={() => commitPolygon(polyPts)}
              className="px-2.5 py-0.5 rounded-full bg-green-500 hover:bg-green-600 font-bold text-[11px] transition-colors"
            >
              完成
            </button>
          )}
          <button
            type="button"
            onClick={cancelPolygon}
            className="px-2.5 py-0.5 rounded-full bg-gray-500 hover:bg-gray-600 font-bold text-[11px] transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* New Block Input Popup Form */}
      {newBlockForm && (
        <div
          className="absolute z-20 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-3 space-y-2"
          style={{
            left: `${Math.min(newBlockForm.normX * 100, 60)}%`,
            top: `${(newBlockForm.normY + newBlockForm.normH) * 100}%`,
            minWidth: 210,
            marginTop: 6,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            type="text"
            value={newTranslation}
            onChange={(e) => setNewTranslation(e.target.value)}
            placeholder="输入译文"
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-green-400"
            onKeyDown={(e) => { if (e.key === 'Enter') confirmNewBlock() }}
          />
          <div className="flex gap-1.5">
            <select
              aria-label="块类型"
              value={newType}
              onChange={(e) => setNewType(e.target.value as TextBlockType)}
              className="flex-1 text-[10px] px-1.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="bubble">对话</option>
              <option value="sfx">音效</option>
              <option value="caption">标注</option>
            </select>
            <select
              aria-label="文字流方向"
              value={newDirection}
              onChange={(e) => setNewDirection(e.target.value as TextDirection)}
              className="flex-1 text-[10px] px-1.5 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <option value="horizontal">横排</option>
              <option value="vertical">竖排</option>
            </select>
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={confirmNewBlock}
              className="flex-1 text-[10px] py-1.5 rounded-md bg-green-500 hover:bg-green-600 text-white font-bold shadow-sm transition-colors"
            >
              添加气泡
            </button>
            <button
              type="button"
              onClick={() => setNewBlockForm(null)}
              className="flex-1 text-[10px] py-1.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

ImageEditor.displayName = 'ImageEditor'
