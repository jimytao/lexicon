import React, { useState } from 'react'
import { useUpdateStore } from '../../stores/updateStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useT } from '../../i18n'

interface UpdateModalProps {
  onClose?: () => void
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ onClose }) => {
  const { status, progress, manifest, startDownload, installUpdate, error, reset, closeModal, ignoreVersion } = useUpdateStore()
  const appLanguage = useSettingsStore((s) => s.appLanguage)
  const t = useT()
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

  // Select localized release notes based on current app language preference
  const displayNotes = (appLanguage === 'zh' ? manifest.notes_zh : manifest.notes_en) || manifest.notes || ''

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-500" style={{ paddingTop: 'calc(1.5rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))', paddingBottom: 'calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={handleDismiss} />
      
      <div className="relative w-full max-w-md bg-background/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-xl font-black tracking-tight text-foreground">{t('update.title')}</h3>
            <p className="text-foreground-muted text-xs leading-relaxed">{t('update.desc')}</p>
          </div>

          {/* Version & Notes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-3.5 py-1 rounded-full bg-accent text-white text-[10px] font-black uppercase tracking-wider">
                v{manifest?.version?.replace(/^v/i, '')}
              </span>
              <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest">
                {manifest?.pub_date ? new Date(manifest.pub_date).toLocaleDateString() : t('update.recentRelease')}
              </span>
            </div>
            
            <div className="bg-foreground/5 rounded-2xl p-4 max-h-48 overflow-y-auto border border-border/40">
              <pre className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-foreground/80">
                {displayNotes}
              </pre>
            </div>
          </div>

          {/* Progress or Error */}
          {(isDownloading || isReady || isError) && (
            <div className="space-y-3">
              {isError ? (
                <div className="text-xs font-bold text-red-500 bg-red-500/10 p-3.5 rounded-2xl border border-red-500/20">
                  {error}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                    <span>{isReady ? t('update.downloadComplete') : t('update.downloading')}</span>
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
          <div className="flex flex-col gap-3 pt-2">
            {!isDownloading && !isReady && !isError && (
              <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer hover:text-foreground transition-colors self-start px-1">
                <input 
                  type="checkbox" 
                  checked={isIgnored} 
                  onChange={(e) => setIsIgnored(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-foreground/5 text-accent focus:ring-accent/50"
                />
                {t('update.skipVersion')}
              </label>
            )}
            
            <div className="flex gap-3">
              {!isDownloading && !isReady ? (
                <>
                  <button
                    onClick={handleDismiss}
                    className="flex-1 h-12 rounded-xl font-bold text-xs uppercase tracking-wider text-foreground-muted hover:bg-foreground/5 transition-all border border-border"
                  >
                    {t('update.dismiss')}
                  </button>
                  <button
                    onClick={startDownload}
                    className="flex-[2] h-12 rounded-xl font-bold text-xs uppercase tracking-wider bg-accent text-white hover:opacity-90 active:scale-95 transition-all shadow-md shadow-accent/20 cursor-pointer"
                  >
                    {t('update.updateNow')}
                  </button>
                </>
              ) : isReady ? (
                <button
                  onClick={installUpdate}
                  className="w-full h-12 rounded-xl font-bold text-xs uppercase tracking-wider bg-foreground text-background hover:opacity-90 active:scale-95 transition-all shadow-xl cursor-pointer"
                >
                  {t('update.installRelaunch')}
                </button>
              ) : isError ? (
                <button
                  onClick={reset}
                  className="w-full h-12 rounded-xl font-bold text-xs uppercase tracking-wider bg-foreground text-background hover:opacity-90 transition-all cursor-pointer"
                >
                  {t('update.retryDownload')}
                </button>
              ) : (
                <div className="w-full h-12 rounded-xl bg-foreground/5 flex items-center justify-center">
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
