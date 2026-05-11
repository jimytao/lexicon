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

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

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

    // 1. Exact token match in the model's split tokens
    if (mTokens.includes(qToken)) {
      tokenScore = 100
      found = true
    }
    // 2. Substring match
    else {
      const idx = mNormalized.indexOf(qToken)
      if (idx !== -1) {
        // If it's a version-like token (has digits or dots), be stricter
        if (/[0-9.]/.test(qToken)) {
          tokenScore = 80
        } else {
          tokenScore = 60
        }
        found = true
      }
      // 3. Compact match
      else if (mCompact.includes(qToken.replace(/\./g, ''))) {
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

      // Start of word bonus
      if (firstIdx === 0 || !/[a-z0-9]/.test(mNormalized[firstIdx - 1])) {
        score += 20
      }
    }
  }

  if (matchedCount === 0) return -100

  // Bonus for matching all tokens
  if (matchedCount === qTokens.length) {
    score += 200
    // Bonus for matching all in order
    if (inOrderCount === qTokens.length) {
      score += 50
    }
  } else {
    score += (matchedCount / qTokens.length) * 100
  }

  // Exact match bonus
  if (mNormalized === query.toLowerCase().trim()) {
    score += 1000
  }

  // Length penalty
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

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const {
    aiProvider, aiEndpoint, aiModel, aiApiKeys, aiModels, historyEnabled, darkMode, webSearchEnabled, tavilyApiKey, maxExercises, modules,
    setAiProvider, setAiEndpoint, setAiModel, setApiKeyForProvider,
    setHistoryEnabled, setDarkMode, setWebSearchEnabled, setTavilyApiKey, setMaxExercises, setModules,
  } = useSettingsStore()

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
    
    // If no model is saved for this provider, and it has static models, pick the first one as default
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
      // Fall back to static model list if available
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

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-20" onClick={() => { testAbortRef.current?.abort(); onClose() }} />
      )}
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 max-w-full bg-background shadow-2xl z-30 flex flex-col transition-transform duration-500 ease-out border-l border-border/50 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-safe pb-5 border-b border-border shrink-0">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Settings</h2>
          <button 
            onClick={() => { testAbortRef.current?.abort(); onClose() }} 
            className="p-2 -mr-2 text-foreground-muted hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Provider selection */}
          <div>
            <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-3">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p)}
                  className={`text-xs px-3 py-2.5 rounded-xl border transition-all text-left truncate font-medium ${
                    aiProvider === p.id
                      ? 'bg-accent/10 border-accent text-accent shadow-sm ring-2 ring-accent/5'
                      : 'bg-background-soft border-border text-foreground-muted hover:border-foreground-muted/30 hover:text-foreground'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint */}
          <div>
            <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-2">Endpoint</label>
            <input
              type="text"
              value={aiEndpoint}
              onChange={(e) => { setAiEndpoint(e.target.value); setAiProvider('custom') }}
              placeholder="https://api.example.com/v1"
              className="w-full text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background-soft text-foreground placeholder-foreground-muted/30 font-mono transition-all"
            />
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">API Key</label>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted/50 hover:text-foreground transition-colors"
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

          {/* Model */}
          <div>
            <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-2">Model</label>
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
                className="shrink-0 text-[10px] font-bold px-3 py-2.5 rounded-xl border border-border text-foreground-muted hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
              >
                {fetchStatus === 'loading' ? 'Fetching' : 'Models'}
              </button>
            </div>

            {/* Model list dropdown */}
            {showModelList && fetchedModels.length > 0 && (
              <div className="mt-2 rounded-2xl border border-border bg-background shadow-2xl max-h-52 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background-soft/50">
                  <span className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">{fetchedModels.length} Models</span>
                  <button
                    onClick={() => setShowModelList(false)}
                    className="text-foreground-muted hover:text-foreground transition-colors"
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
                    className={`w-full text-left px-4 py-3 text-xs hover:bg-foreground/5 transition-colors font-mono truncate ${
                      m === aiModel ? 'text-accent font-bold bg-accent/5' : 'text-foreground font-medium'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Test connection */}
          <div className="pt-2">
            <button
              onClick={handleTest}
              disabled={testStatus === 'testing' || !currentApiKey || !aiEndpoint || !aiModel}
              className={`w-full text-xs font-bold py-3 rounded-xl border transition-all flex items-center justify-center gap-2 uppercase tracking-widest
                ${testStatus === 'testing' 
                  ? 'bg-background-soft border-border text-foreground-muted opacity-50 cursor-not-allowed'
                  : 'bg-accent text-white border-transparent hover:bg-accent/90 shadow-md shadow-accent/20'
                }`}
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            
            {testStatus === 'success' && (
              <p className="mt-3 text-[10px] font-bold text-green-500 uppercase tracking-tight flex items-center gap-1 justify-center animate-in fade-in slide-in-from-top-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Connected Successfully
              </p>
            )}
            {testStatus === 'error' && (
              <p className="mt-3 text-[10px] font-bold text-red-500 uppercase tracking-tight text-center animate-in fade-in slide-in-from-top-1">
                {testMessage}
              </p>
            )}
          </div>

          {/* Module Management */}
          <div className="border-t border-border pt-8 space-y-4">
            <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">Module Management</label>
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
            <p className="text-[10px] text-foreground-muted px-1">
              Drag modules to reorder. Unchecked modules will be omitted from AI requests to save tokens.
            </p>
          </div>

          <div className="border-t border-border pt-8 space-y-6">
            {/* Dark mode */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">Dark Mode</span>
                <p className="text-[10px] text-foreground-muted">Switch appearance</p>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`w-11 h-6 rounded-full transition-all duration-300 relative ${darkMode ? 'bg-accent' : 'bg-foreground/10'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* History Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">History Tracking</span>
                <p className="text-[10px] text-foreground-muted">Save your lookups</p>
              </div>
              <button
                onClick={() => setHistoryEnabled(!historyEnabled)}
                className={`w-11 h-6 rounded-full transition-all duration-300 relative ${historyEnabled ? 'bg-accent' : 'bg-foreground/10'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${historyEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Max exercises */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">Exercise Count</span>
                <p className="text-[10px] text-foreground-muted">Questions per AI session</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMaxExercises(Math.max(1, maxExercises - 1))}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm font-bold tabular-nums text-foreground w-4 text-center">{maxExercises}</span>
                <button
                  onClick={() => setMaxExercises(Math.min(10, maxExercises + 1))}
                  className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-foreground hover:bg-foreground/5 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Web Search */}
            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-foreground">Web Search</span>
                  <p className="text-[10px] text-foreground-muted">Enhance AI with up-to-date info</p>
                </div>
                <button
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  className={`w-11 h-6 rounded-full transition-all duration-300 relative ${webSearchEnabled ? 'bg-accent' : 'bg-foreground/10'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 transform ${webSearchEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              
              {webSearchEnabled && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-2">Tavily API Key</label>
                  <input
                    type="password"
                    value={tavilyApiKey}
                    onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder="tvly-..."
                    className="w-full text-sm border border-border rounded-xl px-4 py-2.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent/5 bg-background-soft text-foreground placeholder-foreground-muted/30 transition-all"
                  />
                  <p className="mt-2 text-[9px] text-foreground-muted">
                    Get your key at <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-accent underline">tavily.com</a>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-8 space-y-6">
            <label className="block text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-4">Data Management</label>
            
            <div className="flex items-center justify-between group">
              <div>
                <span className="text-sm font-bold text-foreground">Search History</span>
                <p className="text-[10px] text-foreground-muted">{words.length} items saved</p>
              </div>
              <button
                onClick={() => { if(confirm('Clear all search history?')) clearHistory() }}
                disabled={words.length === 0}
                className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
              >
                Clear History
              </button>
            </div>

            <div className="flex items-center justify-between group">
              <div>
                <span className="text-sm font-bold text-foreground">AI Result Cache</span>
                <p className="text-[10px] text-foreground-muted">Occupying {cacheSize} locally</p>
              </div>
              <button
                onClick={() => { if(confirm('Clear all cached AI results?')) clearCache() }}
                disabled={Object.keys(aiCache).length === 0 && Object.keys(aiFullCache).length === 0 && Object.keys(phraseCache).length === 0}
                className="px-3 py-1.5 rounded-lg border border-border text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
              >
                Clear Cache
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
