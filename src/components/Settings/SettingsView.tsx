import { CSS } from '@dnd-kit/utilities'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useState, useRef, useMemo } from 'react'
import { useSettingsStore, DEFAULT_CORE_PHRASE_MODULES } from '../../stores/settingsStore'
import type { AppModule } from '../../stores/settingsStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useResultStore } from '../../stores/resultStore'
import { testConnection } from '../../services/ai'
import { useUpdateStore } from '../../stores/updateStore'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'
import { SETTINGS_CHOICE_ROW_LAYOUT } from '../../utils/settingsChoiceRowLayout'
import { Accordion } from './Accordion'
import { ProfileModal } from './ProfileModal'
import { resetProfile } from '../../services/profile'


interface ProviderDef {
  id: string
  name: string
  endpoint: string
  staticModels?: string[]
}

const PROVIDERS: ProviderDef[] = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
  {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    staticModels: [
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-2.5-flash-preview-05-20', 'gemini-2.5-pro-preview-05-06',
      'gemini-1.5-pro', 'gemini-1.5-flash',
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1',
    staticModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
  {
    id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1',
    staticModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  { id: 'mistral', name: 'Mistral', endpoint: 'https://api.mistral.ai/v1' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1' },
  { id: 'together', name: 'Together AI', endpoint: 'https://api.together.xyz/v1' },
  {
    id: 'xai', name: 'xAI / Grok', endpoint: 'https://api.x.ai/v1',
    staticModels: ['grok-3', 'grok-3-mini', 'grok-2-1212'],
  },
  {
    id: 'perplexity', name: 'Perplexity', endpoint: 'https://api.perplexity.ai',
    staticModels: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
  },
  {
    id: 'moonshot', name: 'Moonshot / Kimi', endpoint: 'https://api.moonshot.cn/v1',
    staticModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1' },
  { id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'yi', name: '零一万物', endpoint: 'https://api.lingyiwanwu.com/v1' },
  { id: 'custom', name: '自定义', endpoint: '' },
]

type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

function normalizeModelQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function scoreModelMatch(model: string, query: string) {
  const qTokens = normalizeModelQuery(query)
  if (qTokens.length === 0) return 0
  const mNormalized = model.toLowerCase()
  const mCompact = mNormalized.replace(/[^a-z0-9.]+/g, '')
  const mTokens = mNormalized.split(/[^a-z0-9.]+/).filter(Boolean)
  let score = 0, matchedCount = 0, lastIndex = -1, inOrderCount = 0
  for (const qToken of qTokens) {
    let found = false, tokenScore = 0
    if (mTokens.includes(qToken)) { tokenScore = 100; found = true }
    else {
      const idx = mNormalized.indexOf(qToken)
      if (idx !== -1) { tokenScore = /[0-9.]/.test(qToken) ? 80 : 60; found = true }
      else if (mCompact.includes(qToken.replace(/\./g, ''))) { tokenScore = 40; found = true }
    }
    if (found) {
      matchedCount++; score += tokenScore
      const firstIdx = mNormalized.indexOf(qToken)
      if (firstIdx > lastIndex) inOrderCount++
      lastIndex = firstIdx
      if (firstIdx === 0 || !/[a-z0-9]/.test(mNormalized[firstIdx - 1])) score += 20
    }
  }
  if (matchedCount === 0) return -100
  if (matchedCount === qTokens.length) { score += 200; if (inOrderCount === qTokens.length) score += 50 }
  else score += (matchedCount / qTokens.length) * 100
  if (mNormalized === query.toLowerCase().trim()) score += 1000
  score -= mNormalized.length * 0.1
  return score
}

interface SortableModuleRowProps {
  module: AppModule; index: number; total: number
  hoveredId: string | null; onHoverChange: (id: string | null) => void
  onToggle: (id: string) => void; onMove: (index: number, direction: 'up' | 'down') => void
}
function SortableModuleRow({ module, index, total, hoveredId, onHoverChange, onToggle, onMove }: SortableModuleRowProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef} style={style}
      className={`flex items-center justify-between p-3 rounded-xl bg-background-soft border border-border group ${isDragging ? 'opacity-70 shadow-lg border-accent/40' : ''}`}
      onMouseEnter={() => onHoverChange(module.id)} onMouseLeave={() => onHoverChange(null)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => onToggle(module.id)}
          className={`w-5 h-5 rounded border transition-all flex items-center justify-center shrink-0 ${module.enabled ? 'bg-accent border-accent text-white' : 'border-border bg-background'}`}
        >
          {module.enabled && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <span className={`text-sm font-medium transition-colors truncate ${module.enabled ? 'text-foreground' : 'text-foreground-muted opacity-50'}`}>
          {t(`module.${module.id}`) || module.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-2">
        <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
          <button onClick={() => onMove(index, 'up')} disabled={hoveredId !== module.id || index === 0} className="p-1 text-foreground-muted hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={() => onMove(index, 'down')} disabled={hoveredId !== module.id || index === total - 1} className="p-1 text-foreground-muted hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
        <button type="button" className={`p-1.5 -mr-1 rounded-md transition-colors cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'text-accent bg-accent/10' : 'text-foreground-muted/60 hover:text-foreground'}`} {...attributes} {...listeners}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h8" /></svg>
        </button>
      </div>
    </div>
  )
}

// ── Reusable Toggle Row ────────────────────────────────────────────────────────
function ToggleRow({ label, desc, value, onChange, indent = false }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; indent?: boolean
}) {
  return (
    <button type="button" onClick={() => onChange(!value)} className={`w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5 transition-colors cursor-pointer text-left ${indent ? 'pl-8' : ''}`}>
      <div className="flex-1 min-w-0 pr-3">
        <span className="text-sm font-bold text-foreground block">{label}</span>
        {desc && <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{desc}</p>}
      </div>
      <div className="flex items-center h-7 px-1 shrink-0">
        <div className={`w-8 h-[18px] rounded-full transition-all duration-300 relative ${value ? 'bg-accent' : 'bg-foreground/10'}`}>
          <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${value ? 'translate-x-3.5' : 'translate-x-0'}`} />
        </div>
      </div>
    </button>
  )
}

/** Multi-option row: title + controls on row 1; full-width description on row 2. */
function ChoiceRow({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  const L = SETTINGS_CHOICE_ROW_LAYOUT
  return (
    <div className={L.root}>
      <div className={L.titleRow}>
        <span className={L.title}>{label}</span>
        {children}
      </div>
      {desc && <p className={L.desc}>{desc}</p>}
    </div>
  )
}

// ── Group Header ───────────────────────────────────────────────────────────────
function GroupHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm">{icon}</span>
      <span className="text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  )
}

// ── Group Wrapper ──────────────────────────────────────────────────────────────
function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background-soft/20 py-2 overflow-hidden flex flex-col">
      {children}
    </div>
  )
}

// ── Row Divider (inside group) ─────────────────────────────────────────────────
function RowDivider() {
  return <div className="border-t border-border/30 mx-4" />
}

// ══════════════════════════════════════════════════════════════════════════════
export function SettingsView() {
  const t = useT()
  const {
    aiProvider, aiEndpoint, aiModel, aiApiKeys, aiModels, historyEnabled, appearance,
    webSearchEnabled, tavilyApiKey, maxExercises,
    setAiProvider, setAiEndpoint, setAiModel, setApiKeyForProvider,
    setHistoryEnabled, setAppearance, setWebSearchEnabled, setTavilyApiKey, setMaxExercises,
    performanceMode, setPerformanceMode,
    defaultSearchMode, setDefaultSearchMode,
    historyPreferCognitive, setHistoryPreferCognitive,
    triLingualExamples, setTriLingualExamples,
    modules, setModules,
    coreModules = [], setCoreModules,
    corePhraseModules = DEFAULT_CORE_PHRASE_MODULES, setCorePhraseModules,
    appLanguage, setAppLanguage,
    monolingualWord, setMonolingualWord,
    monolingualPhrase, setMonolingualPhrase,
    monolingualSentence, setMonolingualSentence,
    activeDictionary, setActiveDictionary,
    autoSwitchDictionary, setAutoSwitchDictionary,
    chatRichContextDefault, setChatRichContextDefault,
    pronunciationAccent, setPronunciationAccent,
    autoPlayPronunciation, setAutoPlayPronunciation,
    enableProfileDiagnostic, setEnableProfileDiagnostic,
  } = useSettingsStore()

  const { status, checkUpdate, currentVersion } = useUpdateStore()
  const currentApiKey = aiApiKeys[aiProvider] ?? ''

  const [showKey, setShowKey] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle')
  const [showModelList, setShowModelList] = useState(false)
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)
  const [coreModuleScope, setCoreModuleScope] = useState<'word' | 'phrase'>('word')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  type TestStatus = 'idle' | 'testing' | 'success' | 'error'
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const testAbortRef = useRef<AbortController | null>(null)

  function handleProviderSelect(p: ProviderDef) {
    setAiProvider(p.id)
    if (p.endpoint) setAiEndpoint(p.endpoint)
    if (!aiModels[p.id] && p.staticModels?.length) setAiModel(p.staticModels[0])
    setFetchedModels([]); setFetchStatus('idle'); setShowModelList(false)
    setTestStatus('idle'); setTestMessage('')
  }

  async function handleTest() {
    testAbortRef.current?.abort()
    testAbortRef.current = new AbortController()
    setTestStatus('testing'); setTestMessage('')
    try {
      const reply = await testConnection(testAbortRef.current.signal)
      setTestStatus('success'); setTestMessage(reply)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setTestStatus('error'); setTestMessage((e as Error).message)
    }
  }

  async function handleFetchModels() {
    if (!aiEndpoint || !currentApiKey) return
    setFetchStatus('loading'); setShowModelList(false)
    const provider = PROVIDERS.find(p => p.id === aiProvider)
    try {
      const res = await fetch(`${aiEndpoint}/models`, { headers: { Authorization: `Bearer ${currentApiKey}` } })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = (await res.json()) as { data?: Array<{ id: string }> }
      const ids = (data.data ?? []).map(m => m.id).sort()
      if (ids.length === 0) throw new Error('empty')
      setFetchedModels(ids); setFetchStatus('success'); setShowModelList(true)
    } catch {
      const statics = provider?.staticModels ?? []
      if (statics.length > 0) { setFetchedModels(statics); setFetchStatus('success'); setShowModelList(true) }
      else setFetchStatus('error')
    }
  }

  function handleModelSelect(m: string) { setAiModel(m); setShowModelList(false) }

  const { words, clear: clearHistory } = useHistoryStore()
  const { aiCache, aiFullCache, phraseCache, clearCache } = useResultStore()

  const cacheSize = useMemo(() => {
    const total = JSON.stringify(aiCache).length + JSON.stringify(aiFullCache).length + JSON.stringify(phraseCache).length
    if (total < 1024) return `${total} B`
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`
    return `${(total / (1024 * 1024)).toFixed(1)} MB`
  }, [aiCache, aiFullCache, phraseCache])

  const sortedModels = useMemo(() => {
    const query = aiModel.trim()
    return fetchedModels
      .map((model, index) => ({ model, index, score: scoreModelMatch(model, query) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(item => item.model)
  }, [fetchedModels, aiModel])

  function toggleModule(id: string) { setModules(modules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m)) }
  function moveModule(index: number, dir: 'up' | 'down') {
    const a = [...modules], t = dir === 'up' ? index - 1 : index + 1
    if (t < 0 || t >= a.length) return
    const [m] = a.splice(index, 1); a.splice(t, 0, m); setModules(a)
  }
  function toggleCoreModule(id: string) { setCoreModules(coreModules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m)) }
  function moveCoreModule(index: number, dir: 'up' | 'down') {
    const a = [...coreModules], t = dir === 'up' ? index - 1 : index + 1
    if (t < 0 || t >= a.length) return
    const [m] = a.splice(index, 1); a.splice(t, 0, m); setCoreModules(a)
  }
  function toggleCorePhraseModule(id: string) {
    setCorePhraseModules(corePhraseModules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))
  }
  function moveCorePhraseModule(index: number, dir: 'up' | 'down') {
    const a = [...corePhraseModules], t = dir === 'up' ? index - 1 : index + 1
    if (t < 0 || t >= a.length) return
    const [m] = a.splice(index, 1); a.splice(t, 0, m); setCorePhraseModules(a)
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )
  function handleModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event; if (!over || active.id === over.id) return
    const oi = modules.findIndex(m => m.id === active.id), ni = modules.findIndex(m => m.id === over.id)
    if (oi < 0 || ni < 0) return; setModules(arrayMove(modules, oi, ni))
  }
  function handleCoreModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event; if (!over || active.id === over.id) return
    const oi = coreModules.findIndex(m => m.id === active.id), ni = coreModules.findIndex(m => m.id === over.id)
    if (oi < 0 || ni < 0) return; setCoreModules(arrayMove(coreModules, oi, ni))
  }
  function handleCorePhraseModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event; if (!over || active.id === over.id) return
    const oi = corePhraseModules.findIndex(m => m.id === active.id)
    const ni = corePhraseModules.findIndex(m => m.id === over.id)
    if (oi < 0 || ni < 0) return
    setCorePhraseModules(arrayMove(corePhraseModules, oi, ni))
  }

  const isCacheEmpty = Object.keys(aiCache).length === 0 && Object.keys(aiFullCache).length === 0 && Object.keys(phraseCache).length === 0

  // Group label i18n
  const g1 = t('settings.group.ai')
  const g2 = t('settings.group.search')
  const g3 = t('settings.group.appearance')
  const g4 = t('settings.group.data')
  const g5 = t('settings.group.about')

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-nav-safe max-h-screen overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-safe pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('nav.settings')}</h2>
      </div>

      <div className="px-5 space-y-6 pb-10">

        {/* ═══════════════════════════════════════════════════════════════════
            GROUP 1 — AI & Search Providers
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <GroupHeader icon="🤖" label={g1} />
          <Group>
            {/* AI Provider & Model (Accordion) */}
            <Accordion
              title={t('settings.aiProvider')}
              subtitle={currentApiKey ? `${aiProvider} · ${aiModel}` : t('settings.aiProviderDesc')}
              defaultOpen={!currentApiKey}
            >
              <div className="space-y-4 pt-2">
                {/* Provider Grid */}
                <div>
                  <label className="block text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest mb-2">
                    {t('settings.aiProviderLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PROVIDERS.map(p => {
                      const displayName =
                        p.id === 'zhipu' ? t('settings.provider.zhipu') :
                        p.id === 'yi' ? t('settings.provider.yi') :
                        p.id === 'custom' ? t('settings.provider.custom') : p.name
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleProviderSelect(p)}
                          className={`text-xs px-3 py-2.5 rounded-xl border transition-all text-left truncate font-medium cursor-pointer ${
                            aiProvider === p.id
                              ? 'bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/5'
                              : 'bg-background border-border text-foreground-muted hover:border-foreground-muted/30 hover:text-foreground'
                          }`}
                        >
                          {displayName}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Endpoint */}
                <div>
                  <label className="block text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest mb-1.5">{t('settings.apiEndpoint')}</label>
                  <input
                    type="text" value={aiEndpoint}
                    onChange={(e) => { setAiEndpoint(e.target.value); setAiProvider('custom') }}
                    placeholder="https://api.example.com/v1"
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background text-foreground placeholder-foreground-muted/30 font-mono transition-all"
                  />
                </div>

                {/* API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest">{t('settings.apiKey')}</label>
                    {currentApiKey && (
                      <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> {t('settings.keySaved')}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'} value={currentApiKey}
                      onChange={(e) => setApiKeyForProvider(aiProvider || 'custom', e.target.value)}
                      placeholder="sk-..."
                      className="w-full text-sm border border-border rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background text-foreground placeholder-foreground-muted/30 transition-all"
                    />
                    <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted/50 hover:text-foreground transition-colors cursor-pointer" tabIndex={-1}>
                      {showKey
                        ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7 0-1.3.6-2.5 1.6-3.5M6.1 6.1A9.97 9.97 0 0112 5c5 0 9 4 9 7 0 1.3-.6 2.5-1.6 3.5M3 3l18 18" /></svg>
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* Model Selector */}
                <div>
                  <label className="block text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest mb-1.5">{t('settings.modelName')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text" value={aiModel}
                      onChange={(e) => { setAiModel(e.target.value); if (fetchedModels.length > 0) setShowModelList(true) }}
                      onFocus={() => { if (fetchedModels.length > 0) setShowModelList(true) }}
                      placeholder="gemini-2.0-flash"
                      className="flex-1 text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background text-foreground placeholder-foreground-muted/30 font-mono transition-all min-w-0"
                    />
                    <button
                      onClick={handleFetchModels}
                      disabled={fetchStatus === 'loading' || !aiEndpoint || !currentApiKey}
                      className="shrink-0 text-[10px] font-bold px-3 py-2.5 rounded-xl border border-border text-foreground-muted hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer"
                    >
                      {fetchStatus === 'loading' ? t('settings.fetchingModels') : t('settings.fetchModels')}
                    </button>
                  </div>
                  {showModelList && fetchedModels.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-border bg-background shadow-2xl max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background-soft/50">
                        <span className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">{t('settings.modelsCount').replace('{count}', String(fetchedModels.length))}</span>
                        <button onClick={() => setShowModelList(false)} className="text-foreground-muted hover:text-foreground cursor-pointer">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      {sortedModels.map(m => (
                        <button key={m} onClick={() => handleModelSelect(m)} className={`w-full text-left px-4 py-3 text-xs hover:bg-foreground/5 transition-colors font-mono truncate cursor-pointer ${m === aiModel ? 'text-accent font-bold bg-accent/5' : 'text-foreground font-medium'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Test Connection */}
                <div>
                  <button
                    onClick={handleTest}
                    disabled={testStatus === 'testing' || !currentApiKey || !aiEndpoint || !aiModel}
                    className={`w-full text-xs font-bold py-3 rounded-xl border transition-all flex items-center justify-center gap-2 uppercase tracking-widest cursor-pointer ${
                      testStatus === 'testing'
                        ? 'bg-background border-border text-foreground-muted opacity-50 cursor-not-allowed'
                        : 'bg-accent text-white border-transparent hover:bg-accent/90 shadow-md shadow-accent/20'
                    }`}
                  >
                    {testStatus === 'testing' ? t('settings.testing') : t('settings.testConnection')}
                  </button>
                  {testStatus === 'success' && (
                    <p className="mt-2 text-[10px] font-bold text-green-500 uppercase tracking-tight flex items-center gap-1 justify-center animate-in fade-in">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {t('settings.connected')}
                    </p>
                  )}
                  {testStatus === 'error' && (
                    <p className="mt-2 text-[10px] font-bold text-red-500 uppercase tracking-tight text-center animate-in fade-in">{testMessage}</p>
                  )}
                </div>
              </div>
            </Accordion>

            <RowDivider />

            {/* Web Search */}
            <ToggleRow label={t('settings.webSearch')} desc={t('settings.webSearchDesc')} value={webSearchEnabled} onChange={setWebSearchEnabled} />
            {webSearchEnabled && (
              <div className="px-4 pb-4">
                <label className="block text-[10px] font-black text-foreground-muted/40 uppercase tracking-widest mb-1">{t('settings.tavilyKey')}</label>
                <input
                  type="password" value={tavilyApiKey}
                  onChange={(e) => setTavilyApiKey(e.target.value)}
                  placeholder="tvly-..."
                  className="w-full text-xs border border-border rounded-xl px-3 py-2 outline-none focus:border-accent bg-background text-foreground transition-all"
                />
              </div>
            )}
          </Group>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GROUP 2 — Search Behavior & Display
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <GroupHeader icon="🔍" label={g2} />
          <Group>
            {/* Default Search Mode (≥3 options → Accordion) */}
            <Accordion
              title={t('settings.defaultMode')}
              subtitle={
                defaultSearchMode === 'instant' ? t('mode.instant')
                  : defaultSearchMode === 'ai' ? t('mode.ai')
                    : t('mode.core')
              }
            >
              <p className="text-[11px] text-foreground-muted leading-snug mb-3">{t('settings.defaultModeDesc')}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'instant' as const, label: t('mode.instant') },
                  { id: 'ai' as const, label: t('mode.ai') },
                  { id: 'core' as const, label: t('mode.core') },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDefaultSearchMode(opt.id)}
                    className={`text-xs px-2.5 py-2.5 rounded-xl border transition-all text-center font-medium cursor-pointer whitespace-nowrap ${
                      defaultSearchMode === opt.id
                        ? 'bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/5'
                        : 'bg-background border-border text-foreground-muted hover:border-foreground-muted/30 hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Accordion>

            <RowDivider />

            {/* History dual-track preference */}
            <ChoiceRow label={t('settings.historyPrefer')} desc={t('settings.historyPreferDesc')}>
              <div className={SETTINGS_CHOICE_ROW_LAYOUT.controls}>
                {([
                  { id: 'lookup' as const, label: t('settings.historyPreferLookup') },
                  { id: 'core' as const, label: t('settings.historyPreferCore') },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setHistoryPreferCognitive(opt.id)}
                    className={SETTINGS_CHOICE_ROW_LAYOUT.optionButton(historyPreferCognitive === opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </ChoiceRow>

            <RowDivider />

            {/* Modules — Standard AI (Accordion) */}
            <Accordion
              title={t('settings.modulesMode2')}
              subtitle={`${modules.filter(m => m.enabled).length} ${t('settings.enabled')}`}
            >
              <div className="pt-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
                  <SortableContext items={modules.map(m => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {modules.map((m, i) => (
                        <SortableModuleRow key={m.id} module={m} index={i} total={modules.length}
                          hoveredId={hoveredModuleId} onHoverChange={setHoveredModuleId}
                          onToggle={toggleModule} onMove={moveModule} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </Accordion>

            {/* Modules — Pure Core Word / Phrase (Accordion) */}
            <Accordion
              title={t('settings.modulesMode3')}
              subtitle={
                coreModuleScope === 'word'
                  ? `${coreModules.filter(m => m.enabled).length} ${t('settings.enabled')}`
                  : `${corePhraseModules.filter(m => m.enabled).length} ${t('settings.enabled')}`
              }
            >
              <div className="pt-2 space-y-3">
                <div className="flex items-center gap-1 bg-foreground/5 p-1 rounded-xl border border-border w-fit">
                  <button
                    type="button"
                    onClick={() => setCoreModuleScope('word')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${coreModuleScope === 'word' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
                  >
                    {t('settings.modulesCoreWord')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoreModuleScope('phrase')}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${coreModuleScope === 'phrase' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
                  >
                    {t('settings.modulesCorePhrase')}
                  </button>
                </div>
                <p className="text-[11px] text-foreground-muted leading-snug px-0.5">
                  {coreModuleScope === 'word' ? t('settings.modulesCoreWordDesc') : t('settings.modulesCorePhraseDesc')}
                </p>
                {coreModuleScope === 'word' ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCoreModuleDragEnd}>
                    <SortableContext items={coreModules.map(m => m.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {coreModules.map((m, i) => (
                          <SortableModuleRow key={m.id} module={m} index={i} total={coreModules.length}
                            hoveredId={hoveredModuleId} onHoverChange={setHoveredModuleId}
                            onToggle={toggleCoreModule} onMove={moveCoreModule} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCorePhraseModuleDragEnd}>
                    <SortableContext items={corePhraseModules.map(m => m.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {corePhraseModules.map((m, i) => (
                          <SortableModuleRow key={m.id} module={m} index={i} total={corePhraseModules.length}
                            hoveredId={hoveredModuleId} onHoverChange={setHoveredModuleId}
                            onToggle={toggleCorePhraseModule} onMove={moveCorePhraseModule} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </Accordion>

            <RowDivider />

            {/* Monolingual Mode (Accordion) */}
            <Accordion
              title={t('settings.monolingualMode')}
              subtitle={t('settings.monolingualDesc')}
            >
              <div className="space-y-3 pt-2">
                <ToggleRow label={t('settings.monolingualWord')} value={monolingualWord} onChange={setMonolingualWord} indent />
                <ToggleRow label={t('settings.monolingualPhrase')} value={monolingualPhrase} onChange={setMonolingualPhrase} indent />
                <ToggleRow label={t('settings.monolingualSentence')} value={monolingualSentence} onChange={setMonolingualSentence} indent />
              </div>
            </Accordion>

            <RowDivider />

            {/* Trilingual Examples (flat, separate from Monolingual) */}
            <ToggleRow label={t('settings.trilingualExamples')} desc={t('settings.trilingualDesc')} value={triLingualExamples} onChange={setTriLingualExamples} />

            <RowDivider />

            {/* Dictionary Settings */}
            <div className="space-y-3 px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.dictionarySettings')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{t('settings.dictionaryDesc')}</p>
              </div>
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs font-medium text-foreground">{t('settings.activeDictionary')}</span>
                <select
                  value={activeDictionary} disabled={autoSwitchDictionary}
                  onChange={(e) => setActiveDictionary(e.target.value as 'lexicon.db' | 'lexicon_en.db')}
                  className={`text-xs border border-border rounded-xl px-2.5 py-1 outline-none focus:border-accent bg-background text-foreground ${autoSwitchDictionary ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <option value="lexicon.db">{t('settings.dictEnZh')}</option>
                  <option value="lexicon_en.db">{t('settings.dictEnEn')}</option>
                </select>
              </div>
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs font-medium text-foreground">{t('settings.autoSwitchDictionary')}</span>
                <button onClick={() => setAutoSwitchDictionary(!autoSwitchDictionary)} className="flex items-center h-7 px-1 cursor-pointer">
                  <div className={`w-8 h-[18px] rounded-full transition-all duration-300 relative ${autoSwitchDictionary ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${autoSwitchDictionary ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>

            <RowDivider />

            {/* Pronunciation Settings */}
            <div className="space-y-3 px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.pronunciationSettings')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{t('settings.pronunciationDesc')}</p>
              </div>
              <div className="flex items-center justify-between pl-4">
                <span className="text-xs font-medium text-foreground">{t('settings.pronunciationAccent')}</span>
                <select
                  value={pronunciationAccent}
                  onChange={(e) => setPronunciationAccent(e.target.value as 'uk' | 'us')}
                  className="text-xs border border-border rounded-xl px-2.5 py-1 outline-none focus:border-accent bg-background text-foreground"
                >
                  <option value="us">{t('settings.accentUs')}</option>
                  <option value="uk">{t('settings.accentUk')}</option>
                </select>
              </div>
              <div className="pl-4 -mx-4 -mb-3">
                <ToggleRow label={t('settings.autoPlayPronunciation')} value={autoPlayPronunciation} onChange={setAutoPlayPronunciation} />
              </div>
            </div>
          </Group>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GROUP 3 — Appearance & Preferences
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <GroupHeader icon="🎨" label={g3} />
          <Group>
            {/* App Language */}
            <ChoiceRow label={t('settings.appLanguage')} desc={t('settings.appLanguageDesc')}>
              <div className={SETTINGS_CHOICE_ROW_LAYOUT.controls}>
                {(['zh', 'en'] as const).map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setAppLanguage(lang)}
                    className={SETTINGS_CHOICE_ROW_LAYOUT.optionButton(appLanguage === lang)}
                  >
                    {lang === 'zh' ? '中文' : 'English'}
                  </button>
                ))}
              </div>
            </ChoiceRow>

            <RowDivider />
            {/* Appearance (≥3 options → Accordion); order Light → Dark → System */}
            <Accordion
              title={t('settings.appearance')}
              subtitle={
                appearance === 'light' ? t('settings.appearanceLight')
                  : appearance === 'dark' ? t('settings.appearanceDark')
                    : t('settings.appearanceSystem')
              }
            >
              <p className="text-[11px] text-foreground-muted leading-snug mb-3">{t('settings.appearanceDesc')}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'light' as const, label: t('settings.appearanceLight') },
                  { id: 'dark' as const, label: t('settings.appearanceDark') },
                  { id: 'system' as const, label: t('settings.appearanceSystem') },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAppearance(opt.id)}
                    className={`text-xs px-2.5 py-2.5 rounded-xl border transition-all text-center font-medium cursor-pointer whitespace-nowrap ${
                      appearance === opt.id
                        ? 'bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/5'
                        : 'bg-background border-border text-foreground-muted hover:border-foreground-muted/30 hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Accordion>
            <RowDivider />
            <ToggleRow label={t('settings.performanceMode')} desc={t('settings.performanceModeDesc')} value={performanceMode} onChange={setPerformanceMode} />
            <RowDivider />
            <ToggleRow label={t('settings.chatRichContext')} desc={t('settings.chatRichContextDesc')} value={chatRichContextDefault} onChange={setChatRichContextDefault} />
            <RowDivider />

            {/* Exercise Count */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.exerciseCount')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{t('settings.exerciseCountDesc')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setMaxExercises(Math.max(1, maxExercises - 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer text-sm font-bold">-</button>
                <span className="text-sm font-bold tabular-nums w-5 text-center">{maxExercises}</span>
                <button onClick={() => setMaxExercises(Math.min(10, maxExercises + 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer text-sm font-bold">+</button>
              </div>
            </div>
          </Group>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GROUP 4 — Local Data
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <GroupHeader icon="🗄️" label={g4} />
          <Group>
            {/* Search History */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.historyTracking')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{words.length} {t('settings.historyItems')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setHistoryEnabled(!historyEnabled)} className="flex items-center h-7 px-1 cursor-pointer">
                  <div className={`w-8 h-[18px] rounded-full transition-all duration-300 relative ${historyEnabled ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${historyEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
                <button
                  onClick={() => { if (confirm(t('settings.clearHistoryConfirm'))) clearHistory() }}
                  disabled={words.length === 0}
                  className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer uppercase whitespace-nowrap shrink-0"
                >
                  {t('settings.clearHistory')}
                </button>
              </div>
            </div>

            <RowDivider />

            {/* AI Learning System & User Profile Management (Phase 5) */}
            <ToggleRow
              label={t('settings.profileToggle')}
              desc={t('settings.profileToggleDesc')}
              value={enableProfileDiagnostic}
              onChange={setEnableProfileDiagnostic}
            />

            <div className="flex items-center justify-between px-4 pb-4 pt-1">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">
                  {t('settings.profileManage')}
                </span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">
                  {t('settings.profileManageDesc')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-foreground hover:bg-foreground/5 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {t('settings.profileView')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(t('settings.profileResetConfirm'))) {
                      resetProfile()
                      alert(t('settings.profileResetDone'))
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {t('settings.profileReset')}
                </button>
              </div>
            </div>

            <RowDivider />

            {/* AI Cache */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.aiCache')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{t('settings.aiCacheDesc')} · {cacheSize}</p>
              </div>
              <button
                onClick={() => { if (confirm(t('settings.clearCacheConfirm'))) { clearCache(); useChatStore.getState().clearAll() } }}
                disabled={isCacheEmpty}
                className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
              >
                {t('settings.clearCache')}
              </button>
            </div>
          </Group>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GROUP 5 — About & Update
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <GroupHeader icon="ℹ️" label={g5} />
          <Group>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-sm font-bold text-foreground block">{t('settings.version')}</span>
                <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">v{currentVersion}</p>
              </div>
              <button
                onClick={() => status === 'available' ? useUpdateStore.getState().openModal() : checkUpdate(true)}
                disabled={status === 'checking'}
                className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-accent hover:bg-accent/5 disabled:opacity-30 transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
              >
                {status === 'checking' ? t('settings.checking') : (status === 'available' ? t('settings.viewDetails') : t('settings.checkUpdate'))}
              </button>
            </div>
          </Group>
        </div>

      </div>

      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </div>
  )
}

