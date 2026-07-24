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
import { useSettingsStore } from '../../stores/settingsStore'
import type { AppModule } from '../../stores/settingsStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useResultStore } from '../../stores/resultStore'
import { testConnection } from '../../services/ai'
import { useUpdateStore } from '../../stores/updateStore'
import { useChatStore } from '../../stores/chatStore'
import { useT } from '../../i18n'
import { Accordion } from './Accordion'

interface ProviderDef {
  id: string
  name: string
  endpoint: string
  staticModels?: string[]
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    staticModels: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash-preview-05-20',
      'gemini-2.5-pro-preview-05-06',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    staticModels: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    staticModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1',
  },
  {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'together',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
  },
  {
    id: 'xai',
    name: 'xAI / Grok',
    endpoint: 'https://api.x.ai/v1',
    staticModels: ['grok-3', 'grok-3-mini', 'grok-2-1212'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    endpoint: 'https://api.perplexity.ai',
    staticModels: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    endpoint: 'https://api.moonshot.cn/v1',
    staticModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    endpoint: 'https://api.siliconflow.cn/v1',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'yi',
    name: '零一万物',
    endpoint: 'https://api.lingyiwanwu.com/v1',
  },
  {
    id: 'custom',
    name: '自定义',
    endpoint: '',
  },
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

  let score = 0
  let matchedCount = 0
  let lastIndex = -1
  let inOrderCount = 0

  for (const qToken of qTokens) {
    let found = false
    let tokenScore = 0

    if (mTokens.includes(qToken)) {
      tokenScore = 100
      found = true
    } else {
      const idx = mNormalized.indexOf(qToken)
      if (idx !== -1) {
        if (/[0-9.]/.test(qToken)) {
          tokenScore = 80
        } else {
          tokenScore = 60
        }
        found = true
      } else if (mCompact.includes(qToken.replace(/\./g, ''))) {
        tokenScore = 40
        found = true
      }
    }

    if (found) {
      matchedCount++
      score += tokenScore
      
      const firstIdx = mNormalized.indexOf(qToken)
      if (firstIdx > lastIndex) {
        inOrderCount++
      }
      lastIndex = firstIdx

      if (firstIdx === 0 || !/[a-z0-9]/.test(mNormalized[firstIdx - 1])) {
        score += 20
      }
    }
  }

  if (matchedCount === 0) return -100

  if (matchedCount === qTokens.length) {
    score += 200
    if (inOrderCount === qTokens.length) {
      score += 50
    }
  } else {
    score += (matchedCount / qTokens.length) * 100
  }

  if (mNormalized === query.toLowerCase().trim()) {
    score += 1000
  }

  score -= mNormalized.length * 0.1

  return score
}

interface SortableModuleRowProps {
  module: AppModule
  index: number
  total: number
  hoveredId: string | null
  onHoverChange: (id: string | null) => void
  onToggle: (id: string) => void
  onMove: (index: number, direction: 'up' | 'down') => void
}

function SortableModuleRow({
  module,
  index,
  total,
  hoveredId,
  onHoverChange,
  onToggle,
  onMove,
}: SortableModuleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const buttonsEnabled = hoveredId === module.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-xl bg-background-soft border border-border group ${
        isDragging ? 'opacity-70 shadow-lg border-accent/40' : ''
      }`}
      onMouseEnter={() => onHoverChange(module.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => onToggle(module.id)}
          className={`w-5 h-5 rounded border transition-all flex items-center justify-center shrink-0 ${
            module.enabled ? 'bg-accent border-accent text-white' : 'border-border bg-background'
          }`}
        >
          {module.enabled && (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <span className={`text-sm font-medium transition-colors truncate ${module.enabled ? 'text-foreground' : 'text-foreground-muted opacity-50'}`}>
          {module.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-2">
        <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={!buttonsEnabled || index === 0}
            className="p-1 text-foreground-muted hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Move Up"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={!buttonsEnabled || index === total - 1}
            className="p-1 text-foreground-muted hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            aria-label="Move Down"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className={`p-1.5 -mr-1 rounded-md transition-colors cursor-grab active:cursor-grabbing touch-none ${
            isDragging
              ? 'text-accent bg-accent/10'
              : 'text-foreground-muted/60 hover:text-foreground active:text-accent active:bg-accent/10'
          }`}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function SettingsView() {
  const t = useT()
  const {
    aiProvider, aiEndpoint, aiModel, aiApiKeys, aiModels, historyEnabled, darkMode, webSearchEnabled, tavilyApiKey, maxExercises,
    setAiProvider, setAiEndpoint, setAiModel, setApiKeyForProvider,
    setHistoryEnabled, setDarkMode, setWebSearchEnabled, setTavilyApiKey, setMaxExercises,
    performanceMode, setPerformanceMode,
    defaultSearchMode, setDefaultSearchMode,
    triLingualExamples, setTriLingualExamples,
    modules, setModules,
    coreModules = [], setCoreModules,
    appLanguage, setAppLanguage,
    monolingualWord, setMonolingualWord,
    monolingualPhrase, setMonolingualPhrase,
    monolingualSentence, setMonolingualSentence,
    activeDictionary, setActiveDictionary,
    autoSwitchDictionary, setAutoSwitchDictionary,
    chatRichContextDefault, setChatRichContextDefault,
    pronunciationAccent, setPronunciationAccent,
    autoPlayPronunciation, setAutoPlayPronunciation,
  } = useSettingsStore()

  const { status, checkUpdate, currentVersion } = useUpdateStore()

  const [mainTab, setMainTab] = useState<'model' | 'modules' | 'appearance'>('model')
  const [moduleSubTab, setModuleSubTab] = useState<'mode2' | 'mode3'>('mode2')

  const currentApiKey = aiApiKeys[aiProvider] ?? ''

  const [showKey, setShowKey] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle')
  const [showModelList, setShowModelList] = useState(false)
  const [hoveredModuleId, setHoveredModuleId] = useState<string | null>(null)

  type TestStatus = 'idle' | 'testing' | 'success' | 'error'
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const testAbortRef = useRef<AbortController | null>(null)

  function handleProviderSelect(p: ProviderDef) {
    setAiProvider(p.id)
    if (p.endpoint) setAiEndpoint(p.endpoint)
    
    if (!aiModels[p.id] && p.staticModels && p.staticModels.length > 0) {
      setAiModel(p.staticModels[0])
    }

    setFetchedModels([])
    setFetchStatus('idle')
    setShowModelList(false)
    setTestStatus('idle')
    setTestMessage('')
  }

  async function handleTest() {
    testAbortRef.current?.abort()
    testAbortRef.current = new AbortController()
    setTestStatus('testing')
    setTestMessage('')
    try {
      const reply = await testConnection(testAbortRef.current.signal)
      setTestStatus('success')
      setTestMessage(reply)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setTestStatus('error')
      setTestMessage((e as Error).message)
    }
  }

  async function handleFetchModels() {
    if (!aiEndpoint || !currentApiKey) return
    setFetchStatus('loading')
    setShowModelList(false)

    const provider = PROVIDERS.find(p => p.id === aiProvider)

    try {
      const res = await fetch(`${aiEndpoint}/models`, {
        headers: { Authorization: `Bearer ${currentApiKey}` },
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = (await res.json()) as { data?: Array<{ id: string }> }
      const ids = (data.data ?? []).map(m => m.id).sort()
      if (ids.length === 0) throw new Error('empty')
      setFetchedModels(ids)
      setFetchStatus('success')
      setShowModelList(true)
    } catch {
      const statics = provider?.staticModels ?? []
      if (statics.length > 0) {
        setFetchedModels(statics)
        setFetchStatus('success')
        setShowModelList(true)
      } else {
        setFetchStatus('error')
      }
    }
  }

  function handleModelSelect(model: string) {
    setAiModel(model)
    setShowModelList(false)
  }

  const { words, clear: clearHistory } = useHistoryStore()
  const { aiCache, aiFullCache, phraseCache, clearCache } = useResultStore()

  const cacheSize = useMemo(() => {
    const total = JSON.stringify(aiCache).length + 
                  JSON.stringify(aiFullCache).length + 
                  JSON.stringify(phraseCache).length
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

  // Mode 2 Module toggles & reorder
  function toggleModule(id: string) {
    setModules(modules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))
  }

  function moveModule(index: number, direction: 'up' | 'down') {
    const newModules = [...modules]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newModules.length) return
    const [moved] = newModules.splice(index, 1)
    newModules.splice(targetIndex, 0, moved)
    setModules(newModules)
  }

  // Mode 3 Core Module toggles & reorder
  function toggleCoreModule(id: string) {
    setCoreModules(coreModules.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m))
  }

  function moveCoreModule(index: number, direction: 'up' | 'down') {
    const newModules = [...coreModules]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newModules.length) return
    const [moved] = newModules.splice(index, 1)
    newModules.splice(targetIndex, 0, moved)
    setCoreModules(newModules)
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  )

  function handleModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = modules.findIndex((m) => m.id === active.id)
    const newIndex = modules.findIndex((m) => m.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setModules(arrayMove(modules, oldIndex, newIndex))
  }

  function handleCoreModuleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = coreModules.findIndex((m) => m.id === active.id)
    const newIndex = coreModules.findIndex((m) => m.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setCoreModules(arrayMove(coreModules, oldIndex, newIndex))
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-nav-safe max-h-screen overflow-y-auto">
      {/* Settings Header */}
      <div className="flex items-center justify-between px-6 pt-safe pb-2 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="px-6 pb-4 pt-1 flex gap-1.5 border-b border-border/50 bg-background-soft/30 sticky top-0 z-20 backdrop-blur-md">
        <button
          onClick={() => setMainTab('model')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
            mainTab === 'model'
              ? 'bg-accent text-white shadow-sm'
              : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          <span>🎛️</span>
          <span>基础与模型</span>
        </button>
        <button
          onClick={() => setMainTab('modules')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
            mainTab === 'modules'
              ? 'bg-accent text-white shadow-sm'
              : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          <span>🧩</span>
          <span>模组管理</span>
        </button>
        <button
          onClick={() => setMainTab('appearance')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
            mainTab === 'appearance'
              ? 'bg-accent text-white shadow-sm'
              : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          <span>🎨</span>
          <span>界面与显示</span>
        </button>
      </div>

      <div className="px-6 py-4">
        {/* ── Main Tab 1: 🎛️ 基础与模型 ── */}
        {mainTab === 'model' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Provider Selection */}
            <div>
              <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-2.5">
                AI Provider (模型提供商)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => {
                  const displayName = p.id === 'zhipu' ? t('settings.provider.zhipu') :
                                      p.id === 'yi' ? t('settings.provider.yi') :
                                      p.id === 'custom' ? t('settings.provider.custom') : p.name
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleProviderSelect(p)}
                      className={`text-xs px-3 py-3 rounded-xl border transition-all text-left truncate font-medium cursor-pointer ${
                        aiProvider === p.id
                          ? 'bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/5'
                          : 'bg-background-soft border-border text-foreground-muted hover:border-foreground-muted/30 hover:text-foreground'
                      }`}
                    >
                      {displayName}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Endpoint Input */}
            <div>
              <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-1.5">
                API Endpoint
              </label>
              <input
                type="text"
                value={aiEndpoint}
                onChange={(e) => { setAiEndpoint(e.target.value); setAiProvider('custom') }}
                placeholder="https://api.example.com/v1"
                className="w-full text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background-soft text-foreground placeholder-foreground-muted/30 font-mono transition-all"
              />
            </div>

            {/* API Key Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">
                  API Key
                </label>
                {currentApiKey && (
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-tight flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Saved
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentApiKey}
                  onChange={(e) => setApiKeyForProvider(aiProvider || 'custom', e.target.value)}
                  placeholder="sk-..."
                  className="w-full text-sm border border-border rounded-xl px-4 py-2.5 pr-10 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background-soft text-foreground placeholder-foreground-muted/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted/50 hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7 0-1.3.6-2.5 1.6-3.5M6.1 6.1A9.97 9.97 0 0112 5c5 0 9 4 9 7 0 1.3-.6 2.5-1.6 3.5M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Model Selector & Fetch */}
            <div>
              <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-1.5">
                Model Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => { setAiModel(e.target.value); if (fetchedModels.length > 0) setShowModelList(true) }}
                  onFocus={() => { if (fetchedModels.length > 0) setShowModelList(true) }}
                  placeholder="gemini-2.0-flash"
                  className="flex-1 text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background-soft text-foreground placeholder-foreground-muted/30 font-mono transition-all min-w-0"
                />
                <button
                  onClick={handleFetchModels}
                  disabled={fetchStatus === 'loading' || !aiEndpoint || !currentApiKey}
                  className="shrink-0 text-[10px] font-bold px-3 py-2.5 rounded-xl border border-border text-foreground-muted hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer"
                >
                  {fetchStatus === 'loading' ? 'Fetching' : 'Models'}
                </button>
              </div>

              {showModelList && fetchedModels.length > 0 && (
                <div className="mt-2 rounded-2xl border border-border bg-background shadow-2xl max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background-soft/50">
                    <span className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">
                      {fetchedModels.length} Models
                    </span>
                    <button
                      onClick={() => setShowModelList(false)}
                      className="text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {sortedModels.map(m => (
                    <button
                      key={m}
                      onClick={() => handleModelSelect(m)}
                      className={`w-full text-left px-4 py-3 text-xs hover:bg-foreground/5 transition-colors font-mono truncate cursor-pointer ${
                        m === aiModel ? 'text-accent font-bold bg-accent/5' : 'text-foreground font-medium'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                onClick={handleTest}
                disabled={testStatus === 'testing' || !currentApiKey || !aiEndpoint || !aiModel}
                className={`w-full text-xs font-bold py-3 rounded-xl border transition-all flex items-center justify-center gap-2 uppercase tracking-widest cursor-pointer
                  ${testStatus === 'testing' 
                    ? 'bg-background-soft border-border text-foreground-muted opacity-50 cursor-not-allowed'
                    : 'bg-accent text-white border-transparent hover:bg-accent/90 shadow-md shadow-accent/20'
                  }`}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              
              {testStatus === 'success' && (
                <p className="mt-2 text-[10px] font-bold text-green-500 uppercase tracking-tight flex items-center gap-1 justify-center animate-in fade-in">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Connected Successfully
                </p>
              )}
              {testStatus === 'error' && (
                <p className="mt-2 text-[10px] font-bold text-red-500 uppercase tracking-tight text-center animate-in fade-in">
                  {testMessage}
                </p>
              )}
            </div>

            {/* Accordion: 高级调试与扩展选项 */}
            <Accordion title="高级调试与扩展参数" subtitle="联网搜索 (Tavily)、出题量、性能模式与 Chat 选项" icon="⚙️">
              <div className="space-y-4 pt-2">
                {/* Web Search */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-foreground">Web Search (联网搜)</span>
                    <p className="text-[10px] text-foreground-muted">获取最新流行的热词与文化信息</p>
                  </div>
                  <button
                    onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                    className="flex items-center h-9 px-1 group cursor-pointer"
                  >
                    <div className={`w-9 h-5 rounded-full transition-all duration-300 relative ${webSearchEnabled ? 'bg-accent' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${webSearchEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>

                {webSearchEnabled && (
                  <div className="pl-2">
                    <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-1">Tavily API Key</label>
                    <input
                      type="password"
                      value={tavilyApiKey}
                      onChange={(e) => setTavilyApiKey(e.target.value)}
                      placeholder="tvly-..."
                      className="w-full text-xs border border-border rounded-xl px-3 py-2 outline-none focus:border-accent bg-background text-foreground transition-all"
                    />
                  </div>
                )}

                {/* Performance Mode */}
                <div className="flex items-center justify-between border-t border-border/40 pt-3">
                  <div>
                    <span className="text-sm font-bold text-foreground">Performance Mode</span>
                    <p className="text-[10px] text-foreground-muted">简化视觉效果以提升低配设备流畅度</p>
                  </div>
                  <button
                    onClick={() => setPerformanceMode(!performanceMode)}
                    className="flex items-center h-9 px-1 group cursor-pointer"
                  >
                    <div className={`w-9 h-5 rounded-full transition-all duration-300 relative ${performanceMode ? 'bg-accent' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${performanceMode ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>

                {/* Chat Rich Context Default */}
                <div className="flex items-center justify-between border-t border-border/40 pt-3">
                  <div>
                    <span className="text-sm font-bold text-foreground">{t('settings.chatRichContext')}</span>
                    <p className="text-[10px] text-foreground-muted">{t('settings.chatRichContextDesc')}</p>
                  </div>
                  <button
                    onClick={() => setChatRichContextDefault(!chatRichContextDefault)}
                    className="flex items-center h-9 px-1 group cursor-pointer"
                  >
                    <div className={`w-9 h-5 rounded-full transition-all duration-300 relative ${chatRichContextDefault ? 'bg-accent' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${chatRichContextDefault ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>

                {/* Exercise Count */}
                <div className="flex items-center justify-between border-t border-border/40 pt-3">
                  <div>
                    <span className="text-sm font-bold text-foreground">Exercise Count</span>
                    <p className="text-[10px] text-foreground-muted">AI 测验练习题数</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMaxExercises(Math.max(1, maxExercises - 1))}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-xs font-bold tabular-nums w-4 text-center">{maxExercises}</span>
                    <button
                      onClick={() => setMaxExercises(Math.min(10, maxExercises + 1))}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        )}

        {/* ── Main Tab 2: 🧩 模组管理 ── */}
        {mainTab === 'modules' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Sub-Tab Switcher for Mode 2 vs Mode 3 */}
            <div className="flex gap-1.5 p-1 bg-background-soft rounded-xl border border-border">
              <button
                onClick={() => setModuleSubTab('mode2')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  moduleSubTab === 'mode2'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                模式 2: Standard AI 模组
              </button>
              <button
                onClick={() => setModuleSubTab('mode3')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  moduleSubTab === 'mode3'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                模式 3: Pure Core 模组
              </button>
            </div>

            {/* Mode 2 Modules List */}
            {moduleSubTab === 'mode2' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Standard AI Mode 卡片显示与拖拽排序</span>
                  <span className="text-[10px] text-foreground-muted">{modules.filter(m => m.enabled).length} 已启用</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
                  <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {modules.map((m, i) => (
                        <SortableModuleRow
                          key={m.id}
                          module={m}
                          index={i}
                          total={modules.length}
                          hoveredId={hoveredModuleId}
                          onHoverChange={setHoveredModuleId}
                          onToggle={toggleModule}
                          onMove={moveModule}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Mode 3 Core Modules List */}
            {moduleSubTab === 'mode3' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Pure Core Mode 卡片显示与拖拽排序</span>
                  <span className="text-[10px] text-foreground-muted">{coreModules.filter(m => m.enabled).length} 已启用</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCoreModuleDragEnd}>
                  <SortableContext items={coreModules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {coreModules.map((m, i) => (
                        <SortableModuleRow
                          key={m.id}
                          module={m}
                          index={i}
                          total={coreModules.length}
                          hoveredId={hoveredModuleId}
                          onHoverChange={setHoveredModuleId}
                          onToggle={toggleCoreModule}
                          onMove={moveCoreModule}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Cache Management */}
            <div className="border-t border-border pt-6 space-y-4">
              <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">
                数据缓存清理
              </label>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-background-soft border border-border">
                <div>
                  <span className="text-sm font-bold text-foreground">AI 结果本地缓存</span>
                  <p className="text-[10px] text-foreground-muted">包含全量查词与句段结果 ({cacheSize})</p>
                </div>
                <button
                  onClick={() => { 
                    if (confirm('确定清理所有本地 AI 结果缓存？')) {
                      clearCache()
                      useChatStore.getState().clearAll()
                    }
                  }}
                  disabled={Object.keys(aiCache).length === 0 && Object.keys(aiFullCache).length === 0 && Object.keys(phraseCache).length === 0}
                  className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider cursor-pointer"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Tab 3: 🎨 界面与显示 ── */}
        {mainTab === 'appearance' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* App Language */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">{t('settings.appLanguage')}</span>
                <p className="text-[10px] text-foreground-muted">{t('settings.appLanguageDesc')}</p>
              </div>
              <div className="flex items-center gap-1 bg-foreground/5 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setAppLanguage('zh')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    appLanguage === 'zh' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  中文
                </button>
                <button
                  onClick={() => setAppLanguage('en')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    appLanguage === 'en' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Dark Mode */}
            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <div>
                <span className="text-sm font-bold text-foreground">Dark Mode (深色外观)</span>
                <p className="text-[10px] text-foreground-muted">切换极简明亮/夜间模式</p>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex items-center h-9 px-1 group cursor-pointer"
              >
                <div className={`w-11 h-6 rounded-full transition-all duration-300 relative ${darkMode ? 'bg-accent' : 'bg-foreground/10'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>

            {/* Default Search Mode */}
            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <div>
                <span className="text-sm font-bold text-foreground">默认启动搜索模式</span>
                <p className="text-[10px] text-foreground-muted">软件启动时的初始 Mode</p>
              </div>
              <div className="flex items-center gap-1 bg-foreground/5 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setDefaultSearchMode('instant')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    defaultSearchMode === 'instant' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Instant
                </button>
                <button
                  onClick={() => setDefaultSearchMode('ai')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    defaultSearchMode === 'ai' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  AI
                </button>
                <button
                  onClick={() => setDefaultSearchMode('core')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    defaultSearchMode === 'core' ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Pure Core
                </button>
              </div>
            </div>

            {/* Monolingual Mode */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <div>
                <span className="text-sm font-bold text-foreground">{t('settings.monolingualMode')}</span>
                <p className="text-[10px] text-foreground-muted">{t('settings.monolingualDesc')}</p>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.monolingualWord')}</span>
                <button
                  onClick={() => setMonolingualWord(!monolingualWord)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${monolingualWord ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${monolingualWord ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.monolingualPhrase')}</span>
                <button
                  onClick={() => setMonolingualPhrase(!monolingualPhrase)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${monolingualPhrase ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${monolingualPhrase ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              {/* Trilingual Examples */}
              <div className="flex items-center justify-between pl-2 pt-1">
                <div>
                  <span className="text-xs font-medium text-foreground">Trilingual Examples (三语例句)</span>
                  <p className="text-[9px] text-foreground-muted">小语种词汇同时展示 源语言 + 英文 + 中文</p>
                </div>
                <button
                  onClick={() => setTriLingualExamples(!triLingualExamples)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                  aria-label="Toggle Trilingual Examples"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${triLingualExamples ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${triLingualExamples ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.monolingualSentence')}</span>
                <button
                  onClick={() => setMonolingualSentence(!monolingualSentence)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${monolingualSentence ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${monolingualSentence ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Dictionary Settings */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <div>
                <span className="text-sm font-bold text-foreground">{t('settings.dictionarySettings')}</span>
                <p className="text-[10px] text-foreground-muted">{t('settings.dictionaryDesc')}</p>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.activeDictionary')}</span>
                <select
                  value={activeDictionary}
                  disabled={autoSwitchDictionary}
                  onChange={(e) => setActiveDictionary(e.target.value as 'lexicon.db' | 'lexicon_en.db')}
                  className={`text-xs border border-border rounded-xl px-2.5 py-1 outline-none focus:border-accent bg-background-soft text-foreground ${
                    autoSwitchDictionary ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="lexicon.db">{t('settings.dictEnZh')}</option>
                  <option value="lexicon_en.db">{t('settings.dictEnEn')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.autoSwitchDictionary')}</span>
                <button
                  onClick={() => setAutoSwitchDictionary(!autoSwitchDictionary)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${autoSwitchDictionary ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${autoSwitchDictionary ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Pronunciation Settings */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <div>
                <span className="text-sm font-bold text-foreground">{t('settings.pronunciationSettings')}</span>
                <p className="text-[10px] text-foreground-muted">{t('settings.pronunciationDesc')}</p>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.pronunciationAccent')}</span>
                <select
                  value={pronunciationAccent}
                  onChange={(e) => setPronunciationAccent(e.target.value as 'uk' | 'us')}
                  className="text-xs border border-border rounded-xl px-2.5 py-1 outline-none focus:border-accent bg-background-soft text-foreground"
                >
                  <option value="us">{t('settings.accentUs')}</option>
                  <option value="uk">{t('settings.accentUk')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between pl-2">
                <span className="text-xs font-medium text-foreground">{t('settings.autoPlayPronunciation')}</span>
                <button
                  onClick={() => setAutoPlayPronunciation(!autoPlayPronunciation)}
                  className="flex items-center h-7 px-1 group cursor-pointer"
                >
                  <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${autoPlayPronunciation ? 'bg-accent' : 'bg-foreground/10'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${autoPlayPronunciation ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* History Tracking */}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-foreground">Search History Tracking</span>
                  <p className="text-[10px] text-foreground-muted">{words.length} items saved</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryEnabled(!historyEnabled)}
                    className="flex items-center h-7 px-1 group cursor-pointer"
                  >
                    <div className={`w-8 h-4.5 rounded-full transition-all duration-300 relative ${historyEnabled ? 'bg-accent' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 transform ${historyEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                  <button
                    onClick={() => { if (confirm('Clear all search history?')) clearHistory() }}
                    disabled={words.length === 0}
                    className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer uppercase"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Version Info */}
            <div className="border-t border-border/40 pt-4 pb-8 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-foreground">Lexicon Build</span>
                  <p className="text-[10px] text-foreground-muted">v{currentVersion}</p>
                </div>
                <button
                  onClick={() => status === 'available' ? useUpdateStore.getState().openModal() : checkUpdate(true)}
                  disabled={status === 'checking'}
                  className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-accent hover:bg-accent/5 disabled:opacity-30 transition-all uppercase tracking-wider cursor-pointer"
                >
                  {status === 'checking' ? 'Checking...' : (status === 'available' ? 'View Details' : 'Check Update')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
