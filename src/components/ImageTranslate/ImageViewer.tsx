import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, ReactNode } from 'react'

interface Props {
  children: ReactNode
  onScaleChange?: (scale: number) => void
  compact?: boolean
  className?: string
}

export interface ImageViewerHandle {
  resetTransform: () => void
  getScale: () => number
}

export const ImageViewer = forwardRef<ImageViewerHandle, Props>(({ children, onScaleChange, compact, className }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  // Panning state
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  // Pinch state
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)

  function applyTransform() {
    if (!innerRef.current) return
    const { x, y } = offsetRef.current
    const s = scaleRef.current
    innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`
    onScaleChange?.(s)
  }

  function resetTransform() {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    applyTransform()
  }

  useImperativeHandle(ref, () => ({
    resetTransform,
    getScale: () => scaleRef.current,
  }))

  // ── Ctrl+Wheel zoom (also catches touchpad pinch which browsers send as ctrlKey+wheel) ──
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return  // plain scroll → let browser handle normally
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const factor = e.deltaY > 0 ? 0.88 : 1.14
    const newScale = Math.max(0.5, Math.min(6, scaleRef.current * factor))
    const ratio = newScale / scaleRef.current

    offsetRef.current = {
      x: mx - (mx - offsetRef.current.x) * ratio,
      y: my - (my - offsetRef.current.y) * ratio,
    }
    scaleRef.current = newScale
    applyTransform()
  }, [])

  // ── Ctrl + drag pan (PC) ──
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanningRef.current) return
    offsetRef.current = {
      x: panStartRef.current.ox + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.oy + (e.clientY - panStartRef.current.y),
    }
    applyTransform()
  }, [])

  const handleMouseUp = useCallback(() => { isPanningRef.current = false }, [])

  // ── Touch pinch zoom + single-finger pan ──
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      pinchRef.current = { dist: Math.hypot(dx, dy), scale: scaleRef.current }
    } else if (e.touches.length === 1) {
      // Single finger — pan only if not on a block (target check happens in BlockOverlay)
      // We allow pan from the container itself; BlockOverlay stops propagation for block drags
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      }
      isPanningRef.current = false  // will be enabled on move if no block drag intercepted
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const newDist = Math.hypot(dx, dy)
      const newScale = Math.max(0.5, Math.min(6, pinchRef.current.scale * (newDist / pinchRef.current.dist)))

      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        const ratio = newScale / scaleRef.current
        offsetRef.current = {
          x: midX - (midX - offsetRef.current.x) * ratio,
          y: midY - (midY - offsetRef.current.y) * ratio,
        }
      }
      scaleRef.current = newScale
      applyTransform()
    } else if (e.touches.length === 1) {
      // Single finger pan (only when not dragging a block — block overlay stops propagation)
      const dx = e.touches[0].clientX - panStartRef.current.x
      const dy = e.touches[0].clientY - panStartRef.current.y
      if (Math.hypot(dx, dy) > 5) isPanningRef.current = true
      if (isPanningRef.current) {
        e.preventDefault()
        offsetRef.current = {
          x: panStartRef.current.ox + dx,
          y: panStartRef.current.oy + dy,
        }
        applyTransform()
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null
    isPanningRef.current = false
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })  // passive:false needed to call preventDefault on Ctrl+wheel
    el.addEventListener('mousedown', handleMouseDown)
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('mousedown', handleMouseDown)
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800${className ? ` ${className}` : ''}`}
      style={{ minHeight: 200, touchAction: 'none', userSelect: 'none' }}
    >
      <div
        ref={innerRef}
        style={{ transformOrigin: '0 0', position: 'relative', display: 'inline-block', width: '100%' }}
      >
        {children}
      </div>

      {/* Zoom hint */}
      {!compact && (
        <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none select-none bg-white/70 dark:bg-gray-900/70 px-1.5 py-0.5 rounded">
          Ctrl+滚轮/双指捏合缩放 · Ctrl+拖拽平移
        </div>
      )}
    </div>
  )
})

ImageViewer.displayName = 'ImageViewer'
