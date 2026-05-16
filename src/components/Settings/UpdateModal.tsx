import React, { useState } from 'react'
import { useUpdateStore } from '../../stores/updateStore'

interface UpdateModalProps {
  onClose?: () => void
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ onClose }) => {
  const { status, progress, manifest, startDownload, installUpdate, error, reset, closeModal, ignoreVersion } = useUpdateStore()
  const [isIgnored, setIsIgnored] = useState(false)

  if (!manifest) return null

  const isDownloading = status === 'downloading'
  const isReady = status === 'ready'
  const isError = status === 'error'

  const handleDismiss = () => {
    if (isIgnored && manifest) {
      ignoreVersion(manifest.version)
    }
    closeModal()
    if (onClose) onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-500" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={handleDismiss} />
      
      <div className="relative w-full max-w-md bg-background/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-10 space-y-8">
          {/* Header */}
          <div className="space-y-3">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-2xl font-black tracking-tight">Software Update</h3>
            <p className="text-foreground-muted text-sm leading-relaxed">A new version of Lexicon is available. Updating ensures you have the latest AI models and performance fixes.</p>
          </div>

          {/* Version & Notes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-4 py-1.5 rounded-full bg-accent text-white text-[10px] font-black uppercase tracking-wider">
                v{manifest?.version?.replace(/^v/i, '')}
              </span>
              <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest">
                {manifest?.pub_date ? new Date(manifest.pub_date).toLocaleDateString() : 'Recent Release'}
              </span>
            </div>
            
            <div className="bg-foreground/5 rounded-3xl p-6 max-h-48 overflow-y-auto border border-foreground/5">
              <pre className="text-xs font-sans whitespace-pre-wrap leading-loose text-foreground/70 italic">
                {manifest?.notes || 'Refining the dictionary experience with advanced AI integration.'}
              </pre>
            </div>
          </div>

          {/* Progress or Error */}
          {(isDownloading || isReady || isError) && (
            <div className="space-y-4">
              {isError ? (
                <div className="text-xs font-bold text-red-500 bg-red-500/10 p-4 rounded-2xl border border-red-500/20">
                  {error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                    <span>{isReady ? 'Download Complete' : 'Downloading Update'}</span>
                    <span className="text-accent">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-4 pt-4">
            {!isDownloading && !isReady && !isError && (
              <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer hover:text-foreground transition-colors self-start mb-2 px-2">
                <input 
                  type="checkbox" 
                  checked={isIgnored} 
                  onChange={(e) => setIsIgnored(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-foreground/5 text-accent focus:ring-accent/50"
                />
                Skip this version
              </label>
            )}
            
            <div className="flex gap-4">
            {!isDownloading && !isReady ? (
              <>
                <button
                  onClick={handleDismiss}
                  className="flex-1 h-14 rounded-2xl font-bold text-xs uppercase tracking-widest text-foreground-muted hover:bg-foreground/5 transition-all"
                >
                  Dismiss
                </button>
                <button
                  onClick={startDownload}
                  className="flex-[2] h-14 rounded-2xl font-bold text-xs uppercase tracking-widest bg-accent text-white hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-accent/20"
                >
                  Update Now
                </button>
              </>
            ) : isReady ? (
              <button
                onClick={installUpdate}
                className="w-full h-14 rounded-2xl font-bold text-xs uppercase tracking-widest bg-foreground text-background hover:opacity-90 active:scale-95 transition-all shadow-xl"
              >
                Install & Relaunch
              </button>
            ) : isError ? (
              <button
                onClick={reset}
                className="w-full h-14 rounded-2xl font-bold text-xs uppercase tracking-widest bg-foreground text-background hover:opacity-90 transition-all"
              >
                Retry Download
              </button>
            ) : (
              <div className="w-full h-14 rounded-2xl bg-foreground/5 flex items-center justify-center">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
