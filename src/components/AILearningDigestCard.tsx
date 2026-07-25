import { useState, useEffect } from 'react'
import { getProfile } from '../services/profile'
import type { UserLanguageProfile } from '../types'
import { useT } from '../i18n'

interface AILearningDigestCardProps {
  onSelectCoreConcept: (conceptOrWord: string) => void
}

export function AILearningDigestCard({ onSelectCoreConcept }: AILearningDigestCardProps) {
  const t = useT()
  const [profile, setProfile] = useState<UserLanguageProfile | null>(null)

  useEffect(() => {
    setProfile(getProfile())
    const onVisible = () => {
      if (document.visibilityState === 'visible') setProfile(getProfile())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const activeWeaknesses = profile?.weaknessPatterns.filter((w) => w.status !== 'mastered') ?? []
  const recommendations = profile?.recommendations ?? []

  if (activeWeaknesses.length === 0 && recommendations.length === 0) {
    return (
      <div className="mx-4 my-6 p-5 rounded-3xl bg-background-soft/40 border border-border/60 shadow-sm transition-all hover:border-accent/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-sm">
            ✨
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('digest.title')}</h3>
            <p className="text-[11px] text-foreground-muted">{t('digest.desc')}</p>
          </div>
        </div>
        <p className="text-xs text-foreground-muted/80 leading-relaxed mt-2 pl-1">
          {t('digest.emptyState')}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-4 my-6 p-5 rounded-3xl bg-background-soft/60 border border-border shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🧠</span>
          <div>
            <h3 className="text-xs font-bold text-foreground tracking-tight">{t('digest.title')}</h3>
            <p className="text-[10px] text-foreground-muted">
              {profile?.totalDiagnosticsRun
                ? t('digest.runCount').replace('{count}', String(profile.totalDiagnosticsRun))
                : t('digest.personalized')}
            </p>
          </div>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
          {t('digest.activeGaps')} ({activeWeaknesses.length})
        </span>
      </div>

      {/* Active Weakness Items */}
      {activeWeaknesses.length > 0 && (
        <div className="space-y-2">
          {activeWeaknesses.slice(0, 3).map((w) => (
            <div
              key={w.id}
              className="p-3 rounded-2xl bg-background border border-border/80 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="font-medium text-foreground truncate">{w.description}</span>
              </div>
              <span className="text-[9px] font-bold text-foreground-muted shrink-0 uppercase">
                {w.track}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI Concept Recommendations */}
      {recommendations.length > 0 && (
        <div className="pt-2 border-t border-border/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
              {t('digest.recommendTitle')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recommendations.map((rec, i) => (
              <button
                key={i}
                onClick={() => onSelectCoreConcept(rec.conceptOrWord)}
                className="p-3 rounded-2xl bg-accent/5 border border-accent/20 hover:border-accent hover:bg-accent/10 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent group-hover:underline">
                    {rec.conceptOrWord}
                  </span>
                </div>
                <p className="text-[10px] text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
                  {rec.reason}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
