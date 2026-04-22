import { useState, useRef } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
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

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const {
    aiProvider, aiEndpoint, aiModel, aiApiKeys, historyEnabled, darkMode, maxExercises,
    setAiProvider, setAiEndpoint, setAiModel, setApiKeyForProvider,
    setHistoryEnabled, setDarkMode, setMaxExercises,
  } = useSettingsStore()

  const currentApiKey = aiApiKeys[aiProvider] ?? ''

  const [showKey, setShowKey] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle')
  const [showModelList, setShowModelList] = useState(false)

  type TestStatus = 'idle' | 'testing' | 'success' | 'error'
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const testAbortRef = useRef<AbortController | null>(null)

  function handleProviderSelect(p: ProviderDef) {
    setAiProvider(p.id)
    if (p.endpoint) setAiEndpoint(p.endpoint)
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

  const currentProvider = PROVIDERS.find(p => p.id === aiProvider)
  const canShowStatic = !!(currentProvider?.staticModels?.length)

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-20" onClick={() => { testAbortRef.current?.abort(); onClose() }} />
      )}
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-white dark:bg-gray-900 shadow-xl z-30 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-safe pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">设置</h2>
          <button onClick={() => { testAbortRef.current?.abort(); onClose() }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Provider selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">AI 服务商</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors text-left truncate ${
                    aiProvider === p.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 font-medium'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Endpoint</label>
            <input
              type="text"
              value={aiEndpoint}
              onChange={(e) => { setAiEndpoint(e.target.value); setAiProvider('custom') }}
              placeholder="https://api.example.com/v1"
              className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 font-mono"
            />
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">API Key</label>
              {currentApiKey && (
                <span className="text-xs text-green-500 dark:text-green-400">已保存</span>
              )}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={currentApiKey}
                onChange={(e) => setApiKeyForProvider(aiProvider || 'custom', e.target.value)}
                placeholder="sk-..."
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-9 outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">模型</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="gemini-2.0-flash"
                className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 min-w-0"
              />
              <button
                onClick={handleFetchModels}
                disabled={fetchStatus === 'loading' || !aiEndpoint || !currentApiKey}
                className="shrink-0 text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                {fetchStatus === 'loading' ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    获取中
                  </>
                ) : '获取列表'}
              </button>
            </div>

            {/* Error hint */}
            {fetchStatus === 'error' && (
              <p className="mt-1 text-xs text-red-500">
                获取失败，请手动输入模型名称
                {canShowStatic && (
                  <button
                    onClick={() => { setFetchedModels(currentProvider!.staticModels!); setFetchStatus('success'); setShowModelList(true) }}
                    className="ml-1 underline"
                  >
                    或查看常用列表
                  </button>
                )}
              </p>
            )}

            {/* Model list dropdown */}
            {showModelList && fetchedModels.length > 0 && (
              <div className="mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs text-gray-400">{fetchedModels.length} 个模型</span>
                  <button
                    onClick={() => setShowModelList(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {fetchedModels.map(m => (
                  <button
                    key={m}
                    onClick={() => handleModelSelect(m)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-mono truncate ${
                      m === aiModel ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testStatus === 'testing' || !currentApiKey || !aiEndpoint || !aiModel}
              className="shrink-0 text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              {testStatus === 'testing' ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  测试中…
                </>
              ) : '测试连接'}
            </button>
            {testStatus === 'success' && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                连接成功
              </span>
            )}
            {testStatus === 'error' && (
              <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1 min-w-0">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="truncate">{testMessage}</span>
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Dark mode */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">深色模式</span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-10 h-6 rounded-full transition-colors ${darkMode ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* History */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">历史记录</span>
            <button
              onClick={() => setHistoryEnabled(!historyEnabled)}
              className={`w-10 h-6 rounded-full transition-colors ${historyEnabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${historyEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Max exercises */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">练习题数</span>
              <p className="text-xs text-gray-400 dark:text-gray-500">AI mode 生成练习的题目数</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMaxExercises(Math.max(1, maxExercises - 1))}
                className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                −
              </button>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 w-4 text-center">{maxExercises}</span>
              <button
                onClick={() => setMaxExercises(Math.min(10, maxExercises + 1))}
                className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
