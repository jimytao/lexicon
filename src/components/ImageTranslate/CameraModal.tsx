import { useEffect, useRef, useState } from 'react'
import { isDesktopDevice } from '../../services/platform'
import { useT } from '../../i18n'

interface CameraModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (file: File) => void
}

export function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Smart initial facing mode: PC/macOS defaults to 'user' (webcam), Mobile defaults to 'environment' (rear)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() =>
    isDesktopDevice() ? 'user' : 'environment'
  )
  const [isMirrored, setIsMirrored] = useState<boolean>(() => isDesktopDevice())
  const [isStarting, setIsStarting] = useState<boolean>(true)

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    let active = true
    setIsStarting(true)
    setError(null)

    async function startCamera() {
      stopCamera()
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }

        // Detect active camera track settings & automatically set mirroring behavior:
        // Front camera / PC webcam -> Mirror preview for user intuition, un-mirror canvas on capture for OCR & UI viewing
        // Rear camera -> Normal preview, normal canvas capture
        const track = stream.getVideoTracks()[0]
        const settings = track?.getSettings?.() ?? {}
        const detectedFacing = settings.facingMode || facingMode
        const shouldMirror = detectedFacing === 'user' || isDesktopDevice()
        setIsMirrored(shouldMirror)

        setIsStarting(false)
      } catch (err: any) {
        if (!active) return
        setIsStarting(false)
        console.error('Camera access error:', err)
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(t('image.cameraPermissionDenied'))
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError(t('image.cameraNotFound'))
        } else {
          setError(err.message || t('image.cameraError'))
        }
      }
    }

    if (typeof navigator?.mediaDevices?.getUserMedia === 'function') {
      startCamera()
    } else {
      setIsStarting(false)
      setError(t('image.cameraNotSupported'))
    }

    return () => {
      active = false
      stopCamera()
    }
  }, [isOpen, facingMode, t])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function handleCapture() {
    const video = videoRef.current
    if (!video || !streamRef.current) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // When preview is mirrored (front camera / webcam), horizontally un-mirror canvas output
    // so that BOTH the Lexicon UI image viewer AND AI/OCR receive the exact same normal readable text!
    if (isMirrored) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' })
        stopCamera()
        onCapture(file)
        onClose()
      },
      'image/png',
      0.95
    )
  }

  function toggleFacingMode() {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    setIsMirrored(nextMode === 'user')
  }

  function toggleMirror() {
    setIsMirrored((prev) => !prev)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-lg bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 text-white">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <span className="text-sm font-semibold">{t('image.cameraModalTitle')}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera()
              onClose()
            }}
            aria-label={t('image.closeCamera')}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Area */}
        <div className="relative min-h-[320px] max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-3">
              <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{t('image.cameraStarting')}</span>
            </div>
          )}

          {error ? (
            <div className="p-6 text-center text-red-400 text-sm space-y-3">
              <svg className="w-10 h-10 mx-auto text-red-400 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p>{error}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain max-h-[60vh] transition-transform duration-300 ${
                isMirrored ? '-scale-x-100' : 'scale-x-100'
              }`}
            />
          )}

          {/* Controls Badge & Buttons */}
          {!error && !isStarting && (
            <>
              {/* Mirror Indicator Badge */}
              <div className="absolute top-3 left-3 text-[11px] font-medium px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white/80 border border-white/10 flex items-center gap-1.5 pointer-events-none">
                <span className={`w-2 h-2 rounded-full ${isMirrored ? 'bg-amber-400' : 'bg-green-400'}`} />
                <span>{isMirrored ? t('image.cameraMirroredText') : t('image.cameraNormalText')}</span>
              </div>

              {/* Action Buttons: Mirror Toggle & Camera Switch */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                {/* Mirror Toggle */}
                <button
                  type="button"
                  onClick={toggleMirror}
                  title={t('image.toggleMirror')}
                  aria-label={t('image.toggleMirror')}
                  className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-xs text-white hover:bg-black/80 active:scale-95 transition-all border border-white/10 flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  <span>{t('image.toggleMirror')}</span>
                </button>

                {/* Switch Camera */}
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  aria-label={t('image.switchCamera')}
                  title={t('image.switchCamera')}
                  className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80 active:scale-95 transition-all border border-white/10"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer / Capture Controls */}
        <div className="flex flex-col items-center justify-center p-4 border-t border-gray-800 bg-gray-900 gap-2">
          {!error && (
            <>
              <button
                type="button"
                onClick={handleCapture}
                disabled={isStarting}
                aria-label={t('image.takePhoto')}
                className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-white text-gray-900 hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-white/10"
              >
                <span className="w-13 h-13 rounded-full border-2 border-gray-900 group-hover:bg-blue-50 transition-colors" />
              </button>
              <span className="text-[11px] text-gray-400">{t('image.captureHintText')}</span>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
