import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, ReactNode, useState } from 'react'
import { useT } from '../../i18n'

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
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const [currentScale, setCurrentScale] = useState(1)

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
    setCurrentScale(s)
    onScaleChange?.(s)
  }

  function resetTransform() {
    if (!containerRef.current || !innerRef.current) return
    // Clear transform first so we measure the natural (unscaled) dimensions
    innerRef.current.style.transform = 'none'
    // Reading offsetHeight forces a synchronous reflow with the cleared transform
    const naturalH = innerRef.current.offsetHeight
    const naturalW = innerRef.current.offsetWidth
    const containerH = containerRef.current.clientHeight
    const containerW = containerRef.current.clientWidth
    let scale = 1
    if (naturalH > containerH && containerH > 0) scale = containerH / naturalH
    if (naturalW * scale > containerW && containerW > 0) scale = containerW / naturalW
    
    // Calculate centered offsets when scaled dimensions are smaller than container dimensions
    let ox = 0
    let oy = 0
    if (naturalW * scale < containerW && containerW > 0) {
      ox = (containerW - (naturalW * scale)) / 2
    }
    if (naturalH * scale < containerH && containerH > 0) {
      oy = (containerH - (naturalH * scale)) / 2
    }
    
    scaleRef.current = scale
    offsetRef.current = { x: ox, y: oy }
    applyTransform()
  }

  useImperativeHandle(ref, () => ({
    resetTransform,
    getScale: () => scaleRef.current,
  }))

  // ── Scroll Wheel Pan & Zoom (No keys required for panning, Ctrl+Wheel to Zoom) ──
  const handleWheel = useCallback((e: WheelEvent) => {
    const container = containerRef.current
    if (!container) return

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const factor = e.deltaY > 0 ? 0.88 : 1.14
      const newScale = Math.max(0.2, Math.min(8, scaleRef.current * factor))
      const ratio = newScale / scaleRef.current

      offsetRef.current = {
        x: mx - (mx - offsetRef.current.x) * ratio,
        y: my - (my - offsetRef.current.y) * ratio,
      }
      scaleRef.current = newScale
      applyTransform()
    } else {
      // In compact (list view) mode, let the page handle scrolling naturally
      if (compact) return
      // Regular scroll: perform natural vertical or horizontal panning
      e.preventDefault()
      if (e.shiftKey) {
        offsetRef.current.x -= e.deltaY
      } else {
        offsetRef.current.y -= e.deltaY
        offsetRef.current.x -= e.deltaX
      }
      applyTransform()
    }
  }, [compact])

  // ── Ctrl + drag pan (PC) ──
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    if (scaleRef.current <= 1) return
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
      if (Math.hypot(dx, dy) > 5 && scaleRef.current > 1) isPanningRef.current = true
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

  // Auto-fit on mount, layout changes, or browser window resizing
  useEffect(() => {
    const handleResize = () => {
      resetTransform()
    }
    const timer = setTimeout(handleResize, 150)
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [children])


  // Immersive floating control actions
  const zoomIn = () => {
    scaleRef.current = Math.min(6, scaleRef.current * 1.25)
    applyTransform()
  }

  const zoomOut = () => {
    scaleRef.current = Math.max(0.15, scaleRef.current / 1.25)
    applyTransform()
  }

  const zoomActual = () => {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    applyTransform()
  }

  const zoomFit = () => {
    resetTransform()
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800${className ? ` ${className}` : ''}`}
      style={{ minHeight: 200, touchAction: 'none', userSelect: 'none' }}
    >
      <div
        ref={innerRef}
        style={{ transformOrigin: '0 0', position: 'relative', display: 'inline-block' }}
      >
        {children}
      </div>

      {/* Floating Glassmorphic Zoom Controls for Novice Users */}
      {!compact && (
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50">
          <button
            type="button"
            onClick={zoomOut}
            className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 active:scale-95 transition-all font-bold text-base"
            title={t('image.zoomOut')}
          >
            －
          </button>
          <span className="text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300 min-w-[42px] text-center">
            {Math.round(currentScale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 active:scale-95 transition-all font-bold text-base"
            title={t('image.zoomIn')}
          >
            ＋
          </button>
          <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1.5" />
          <button
            type="button"
            onClick={zoomActual}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 active:scale-95 transition-all"
            title={t('image.zoomActual')}
          >
            1:1
          </button>
          <button
            type="button"
            onClick={zoomFit}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all"
            title={t('image.zoomFit')}
          >
            {t('image.zoomFitShort')}
          </button>
        </div>
      )}

      {/* Zoom hint */}
      {!compact && (
        <div className="absolute bottom-3 right-3 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none select-none bg-white/70 dark:bg-gray-900/70 px-2 py-1 rounded-md">
          {t('image.viewerHint')}
        </div>
      )}
    </div>
  )
})

ImageViewer.displayName = 'ImageViewer'
