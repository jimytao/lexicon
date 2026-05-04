import { useRef, useState, useCallback, useEffect } from 'react'
import type { TextBlock, TextBlockType, TextDirection } from '../../types'

interface Props {
  blocks: TextBlock[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onUpdateBlock: (index: number, partial: Partial<TextBlock>) => void
  onDeleteBlock: (index: number) => void
  onAddBlock: (block: TextBlock) => void
  drawPolygonForIndex?: number | null   // activate polygon-draw mode for this block
  onPolygonDrawn?: () => void           // called when drawing finishes or is cancelled
}

type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface DragState {
  kind: 'move' | 'resize' | 'draw' | 'rotate'
  blockIndex?: number
  handle?: HandlePos
  startNX: number
  startNY: number
  startBbox?: { x: number; y: number; w: number; h: number }
  startPolygon?: Array<{ x: number; y: number }>
  drawEndNX?: number
  drawEndNY?: number
}

const HANDLE_POSITIONS: HandlePos[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const HANDLE_STYLE: Record<HandlePos, React.CSSProperties> = {
  nw: { top: -5, left: -5, cursor: 'nw-resize' },
  n:  { top: -5, left: 'calc(50% - 5px)', cursor: 'n-resize' },
  ne: { top: -5, right: -5, cursor: 'ne-resize' },
  e:  { top: 'calc(50% - 5px)', right: -5, cursor: 'e-resize' },
  se: { bottom: -5, right: -5, cursor: 'se-resize' },
  s:  { bottom: -5, left: 'calc(50% - 5px)', cursor: 's-resize' },
  sw: { bottom: -5, left: -5, cursor: 'sw-resize' },
  w:  { top: 'calc(50% - 5px)', left: -5, cursor: 'w-resize' },
}

function getPointer(e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  let clientX: number, clientY: number
  if ('touches' in e) {
    if (e.touches.length === 0) return null
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else {
    clientX = (e as MouseEvent).clientX
    clientY = (e as MouseEvent).clientY
  }
  return {
    nx: (clientX - rect.left) / rect.width,
    ny: (clientY - rect.top) / rect.height,
  }
}

function applyHandleDelta(
  handle: HandlePos,
  bbox: { x: number; y: number; w: number; h: number },
  dnx: number,
  dny: number,
) {
  let { x, y, w, h } = bbox
  if (handle.includes('w')) { x += dnx; w -= dnx }
  if (handle.includes('e')) { w += dnx }
  if (handle.includes('n')) { y += dny; h -= dny }
  if (handle.includes('s')) { h += dny }
  w = Math.max(0.02, w)
  h = Math.max(0.02, h)
  x = Math.max(0, Math.min(1 - w, x))
  y = Math.max(0, Math.min(1 - h, y))
  return { x, y, w, h }
}

export function BlockOverlay({
  blocks, selectedIndex, onSelect,
  onUpdateBlock, onDeleteBlock, onAddBlock,
  drawPolygonForIndex, onPolygonDrawn,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [newBlockForm, setNewBlockForm] = useState<{ nx: number; ny: number; nw: number; nh: number } | null>(null)
  const [newTranslation, setNewTranslation] = useState('')
  const [newType, setNewType] = useState<TextBlockType>('bubble')
  const [newDirection, setNewDirection] = useState<TextDirection>('horizontal')
  // Polygon drawing state
  const [polyPts, setPolyPts] = useState<Array<{ x: number; y: number }>>([])

  const isDrawingPoly = drawPolygonForIndex != null

  // Reset polygon points when target block changes
  useEffect(() => {
    setPolyPts([])
  }, [drawPolygonForIndex])

  const getPtr = useCallback((e: MouseEvent | TouchEvent) => {
    if (!overlayRef.current) return null
    return getPointer(e, overlayRef.current)
  }, [])

  const handlePointerDown = useCallback((
    e: MouseEvent | TouchEvent,
    kind: 'move' | 'resize' | 'draw' | 'rotate',
    blockIndex?: number,
    handle?: HandlePos,
  ) => {
    const ptr = getPtr(e)
    if (!ptr) return
    const block = blockIndex !== undefined ? blocks[blockIndex] : undefined
    dragRef.current = {
      kind, blockIndex, handle,
      startNX: ptr.nx,
      startNY: ptr.ny,
      startBbox: block ? { ...block.bbox } : undefined,
      startPolygon: block?.polygon ? block.polygon.map(p => ({ ...p })) : undefined,
    }
  }, [blocks, getPtr])

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const ptr = getPtr(e)
    if (!ptr) return
    const dnx = ptr.nx - drag.startNX
    const dny = ptr.ny - drag.startNY

    if (drag.kind === 'move' && drag.blockIndex !== undefined && drag.startBbox) {
      const bbox = drag.startBbox
      const newBbox = {
        x: Math.max(0, Math.min(1 - bbox.w, bbox.x + dnx)),
        y: Math.max(0, Math.min(1 - bbox.h, bbox.y + dny)),
        w: bbox.w, h: bbox.h,
      }
      const update: Partial<TextBlock> = { bbox: newBbox }
      if (drag.startPolygon) {
        update.polygon = drag.startPolygon.map(p => ({
          x: Math.max(0, Math.min(1, p.x + dnx)),
          y: Math.max(0, Math.min(1, p.y + dny)),
        }))
      }
      onUpdateBlock(drag.blockIndex, update)
    } else if (drag.kind === 'resize' && drag.blockIndex !== undefined && drag.startBbox && drag.handle) {
      const newBbox = applyHandleDelta(drag.handle, drag.startBbox, dnx, dny)
      const update: Partial<TextBlock> = { bbox: newBbox }
      if (drag.startPolygon && drag.startBbox.w > 0 && drag.startBbox.h > 0) {
        update.polygon = drag.startPolygon.map(p => ({
          x: Math.max(0, Math.min(1, newBbox.x + ((p.x - drag.startBbox!.x) / drag.startBbox!.w) * newBbox.w)),
          y: Math.max(0, Math.min(1, newBbox.y + ((p.y - drag.startBbox!.y) / drag.startBbox!.h) * newBbox.h)),
        }))
      }
      onUpdateBlock(drag.blockIndex, update)
    } else if (drag.kind === 'rotate' && drag.blockIndex !== undefined && drag.startBbox) {
      const block = blocks[drag.blockIndex]
      if (!block) return
      const cx = block.bbox.x + block.bbox.w / 2
      const cy = block.bbox.y + block.bbox.h / 2
      const angle = Math.atan2(ptr.ny - cy, ptr.nx - cx) * 180 / Math.PI + 90
      onUpdateBlock(drag.blockIndex, { rotation: Math.round(angle) })
    } else if (drag.kind === 'draw') {
      const x = Math.min(drag.startNX, ptr.nx)
      const y = Math.min(drag.startNY, ptr.ny)
      const w = Math.abs(ptr.nx - drag.startNX)
      const h = Math.abs(ptr.ny - drag.startNY)
      drag.drawEndNX = ptr.nx
      drag.drawEndNY = ptr.ny
      setDrawingRect({ x, y, w, h })
    }
  }, [blocks, getPtr, onUpdateBlock])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.kind === 'draw' && drawingRect && drawingRect.w > 0.02 && drawingRect.h > 0.02) {
      setNewBlockForm({ nx: drawingRect.x, ny: drawingRect.y, nw: drawingRect.w, nh: drawingRect.h })
      setNewTranslation('')
      setNewType('bubble')
      setNewDirection('horizontal')
    }
    setDrawingRect(null)
  }, [drawingRect])

  useEffect(() => {
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove, { passive: false })
    window.addEventListener('touchend', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  function confirmNewBlock() {
    if (!newBlockForm || !newTranslation.trim()) return
    onAddBlock({
      original: '', translation: newTranslation.trim(),
      type: newType, direction: newDirection,
      bbox: { x: newBlockForm.nx, y: newBlockForm.ny, w: newBlockForm.nw, h: newBlockForm.nh },
    })
    setNewBlockForm(null)
  }

  function commitPolygon(pts: Array<{ x: number; y: number }>) {
    if (drawPolygonForIndex == null || pts.length < 3) return
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    onUpdateBlock(drawPolygonForIndex, {
      polygon: pts,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    })
    setPolyPts([])
    onPolygonDrawn?.()
  }

  function cancelPolygon() {
    setPolyPts([])
    onPolygonDrawn?.()
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (!overlayRef.current) return
    const ptr = getPointer(e, overlayRef.current)
    if (!ptr) return

    if (isDrawingPoly) {
      // Check if clicking near the first point to close the polygon
      if (polyPts.length >= 3) {
        const first = polyPts[0]
        const dist = Math.hypot(ptr.nx - first.x, ptr.ny - first.y)
        if (dist < 0.025) {
          commitPolygon(polyPts)
          return
        }
      }
      setPolyPts(prev => [...prev, { x: ptr.nx, y: ptr.ny }])
    }
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0"
      style={{ touchAction: 'none', cursor: isDrawingPoly ? 'crosshair' : 'default' }}
      onClick={isDrawingPoly ? handleOverlayClick : undefined}
      onMouseDown={!isDrawingPoly ? (e) => {
        if (e.target === overlayRef.current) {
          onSelect(null)
          handlePointerDown(e.nativeEvent, 'draw')
        }
      } : undefined}
      onTouchStart={!isDrawingPoly ? (e) => {
        if (e.target === overlayRef.current && e.touches.length === 1) {
          onSelect(null)
          handlePointerDown(e.nativeEvent, 'draw')
        }
      } : undefined}
    >
      {/* SVG polygon outlines + drawing preview */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {blocks.map((block, i) =>
          block.polygon && block.polygon.length >= 3 ? (
            <polygon
              key={i}
              points={block.polygon.map(p => `${p.x},${p.y}`).join(' ')}
              fill={
                selectedIndex === i
                  ? 'rgba(59,130,246,0.18)'
                  : 'rgba(59,130,246,0.06)'
              }
              stroke="#3b82f6"
              strokeWidth={selectedIndex === i ? '0.003' : '0.002'}
              strokeDasharray={selectedIndex === i ? undefined : '0.012,0.006'}
            />
          ) : null
        )}

        {/* In-progress polygon drawing */}
        {isDrawingPoly && polyPts.length >= 2 && (
          <polygon
            points={polyPts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(16,185,129,0.12)"
            stroke="#10b981"
            strokeWidth="0.003"
            strokeDasharray="0.01,0.005"
          />
        )}
        {isDrawingPoly && polyPts.length >= 1 && polyPts.length < 2 && (
          <circle cx={polyPts[0].x} cy={polyPts[0].y} r="0.006" fill="#10b981" />
        )}
        {isDrawingPoly && polyPts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x} cy={pt.y} r="0.005"
            fill={i === 0 && polyPts.length >= 3 ? '#f59e0b' : '#10b981'}
            stroke="#fff" strokeWidth="0.002"
          />
        ))}
      </svg>

      {/* Polygon drawing controls */}
      {isDrawingPoly && (
        <div
          className="absolute top-2 left-1/2 z-20 flex gap-2 items-center bg-black/70 text-white text-xs px-3 py-1.5 rounded-full"
          style={{ transform: 'translateX(-50%)', pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{polyPts.length < 3 ? `点击添加顶点 (${polyPts.length}/3+)` : `${polyPts.length}点 · 点首点闭合`}</span>
          {polyPts.length >= 3 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); commitPolygon(polyPts) }}
              className="px-2 py-0.5 rounded bg-green-500 hover:bg-green-400 font-medium transition-colors"
            >
              完成
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); cancelPolygon() }}
            className="px-2 py-0.5 rounded bg-gray-500 hover:bg-gray-400 transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* Existing blocks */}
      {!isDrawingPoly && blocks.map((block, i) => {
        const { x, y, w, h } = block.bbox
        const isSelected = selectedIndex === i
        const hasPolygon = !!(block.polygon && block.polygon.length >= 3)
        const rotation = block.rotation ?? 0
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              boxSizing: 'border-box',
              transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: 'center center',
              border: hasPolygon ? (isSelected ? '1px solid rgba(59,130,246,0.3)' : 'none') : (isSelected ? '2px solid #3b82f6' : '1px dashed rgba(59,130,246,0.5)'),
              backgroundColor: hasPolygon ? (isSelected ? 'rgba(59,130,246,0.04)' : 'transparent') : (isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)'),
              cursor: 'move',
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              onSelect(i)
              handlePointerDown(e.nativeEvent, 'move', i)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
              onSelect(i)
              handlePointerDown(e.nativeEvent, 'move', i)
            }}
          >
            {/* Block number label */}
            <div
              className="absolute text-[9px] font-medium px-1 leading-none rounded-sm select-none pointer-events-none"
              style={{ top: -14, left: 0, backgroundColor: '#3b82f6', color: '#fff' }}
            >
              {i + 1}
            </div>

            {/* Rotation handle */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute', top: -36, left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: '#fff', border: '2px solid #6366f1',
                    cursor: 'grab', pointerEvents: 'auto', marginBottom: 2,
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e.nativeEvent, 'rotate', i) }}
                  onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e.nativeEvent, 'rotate', i) }}
                />
                <div style={{ width: 2, height: 18, backgroundColor: '#6366f1' }} />
              </div>
            )}

            {/* Delete button */}
            {isSelected && (
              <button
                type="button"
                aria-label="删除此块"
                className="absolute flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                style={{ top: -12, right: -12, width: 18, height: 18, fontSize: 10 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDeleteBlock(i); onSelect(null) }}
              >
                ×
              </button>
            )}

            {/* Resize handles */}
            {isSelected && HANDLE_POSITIONS.map((hp) => (
              <div
                key={hp}
                style={{
                  position: 'absolute',
                  width: 10, height: 10,
                  backgroundColor: '#fff',
                  border: `2px solid #3b82f6`,
                  borderRadius: 2,
                  ...HANDLE_STYLE[hp],
                }}
                onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e.nativeEvent, 'resize', i, hp) }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e.nativeEvent, 'resize', i, hp) }}
              />
            ))}
          </div>
        )
      })}

      {/* Drawing rect preview */}
      {drawingRect && drawingRect.w > 0.005 && (
        <div
          style={{
            position: 'absolute',
            left: `${drawingRect.x * 100}%`,
            top: `${drawingRect.y * 100}%`,
            width: `${drawingRect.w * 100}%`,
            height: `${drawingRect.h * 100}%`,
            border: '2px dashed #10b981',
            backgroundColor: 'rgba(16,185,129,0.08)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* New block form */}
      {newBlockForm && (
        <div
          className="absolute z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2"
          style={{
            left: `${Math.min(newBlockForm.nx * 100, 60)}%`,
            top: `${(newBlockForm.ny + newBlockForm.nh) * 100}%`,
            minWidth: 200, marginTop: 4,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus type="text"
            value={newTranslation}
            onChange={(e) => setNewTranslation(e.target.value)}
            placeholder="输入译文"
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-green-400"
            onKeyDown={(e) => { if (e.key === 'Enter') confirmNewBlock() }}
          />
          <div className="flex gap-2">
            <select aria-label="文字类型" value={newType} onChange={(e) => setNewType(e.target.value as TextBlockType)}
              className="flex-1 text-xs px-1.5 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              <option value="bubble">对话</option>
              <option value="sfx">音效</option>
              <option value="caption">标注</option>
            </select>
            <select aria-label="排版方向" value={newDirection} onChange={(e) => setNewDirection(e.target.value as TextDirection)}
              className="flex-1 text-xs px-1.5 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              <option value="horizontal">横排</option>
              <option value="vertical">竖排</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmNewBlock}
              className="flex-1 text-xs py-1 rounded bg-green-500 hover:bg-green-600 text-white font-medium transition-colors">
              添加
            </button>
            <button type="button" onClick={() => setNewBlockForm(null)}
              className="flex-1 text-xs py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
