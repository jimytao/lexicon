import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppModule {
  id: string
  label: string
  enabled: boolean
}

export const DEFAULT_MODULES: AppModule[] = [
  { id: 'dictionary', label: '基础释义', enabled: true },
  { id: 'semantic', label: '语义情景', enabled: true },
  { id: 'synonyms', label: '近义词/反义词', enabled: true },
  { id: 'etymology', label: '词根词缀', enabled: true },
  { id: 'mnemonic', label: 'AI 助记', enabled: true },
  { id: 'examples', label: '双语例句', enabled: true },
  { id: 'related', label: '相关词组', enabled: true },
  { id: 'practice', label: '场景练习', enabled: true },
  { id: 'culture', label: '文化背景', enabled: true },
  { id: 'chat', label: 'AI 问答', enabled: true },
]

export function normalizeModules(modules?: AppModule[]): AppModule[] {
  if (!modules) return DEFAULT_MODULES

  const defaultsById = new Map(DEFAULT_MODULES.map((module) => [module.id, module]))
  const normalized = modules
    .filter((module) => defaultsById.has(module.id))
    .map((module) => {
      const defaultModule = defaultsById.get(module.id)!
      return { ...defaultModule, enabled: module.enabled }
    })

  for (const defaultModule of DEFAULT_MODULES) {
    if (normalized.some((module) => module.id === defaultModule.id)) continue

    const defaultIndex = DEFAULT_MODULES.findIndex((module) => module.id === defaultModule.id)
    const previousDefaultIds = DEFAULT_MODULES.slice(0, defaultIndex).map((module) => module.id).reverse()
    const nextDefaultIds = DEFAULT_MODULES.slice(defaultIndex + 1).map((module) => module.id)
    const previousIndex = previousDefaultIds
      .map((id) => normalized.findIndex((module) => module.id === id))
      .find((index) => index >= 0)

    if (previousIndex !== undefined) {
      normalized.splice(previousIndex + 1, 0, defaultModule)
      continue
    }

    const nextIndex = nextDefaultIds
      .map((id) => normalized.findIndex((module) => module.id === id))
      .find((index) => index >= 0)

    if (nextIndex !== undefined) {
      normalized.splice(nextIndex, 0, defaultModule)
    } else {
      normalized.push(defaultModule)
    }
  }

  return normalized
}

interface SettingsStore {
  aiProvider: string
  aiEndpoint: string
  aiModel: string
  aiApiKeys: Record<string, string>  // keyed by providerId
  aiModels: Record<string, string>   // keyed by providerId
  historyEnabled: boolean
  darkMode: boolean
  webSearchEnabled: boolean
  tavilyApiKey: string
  maxExercises: number
  performanceMode: boolean
  defaultSearchMode: 'instant' | 'ai'
  triLingualExamples: boolean
  modules: AppModule[]
  setAiProvider: (v: string) => void
  setAiEndpoint: (v: string) => void
  setAiModel: (v: string) => void
  setApiKeyForProvider: (providerId: string, key: string) => void
  setAiModelForProvider: (providerId: string, model: string) => void
  setHistoryEnabled: (v: boolean) => void
  setDarkMode: (v: boolean) => void
  setWebSearchEnabled: (v: boolean) => void
  setTavilyApiKey: (v: string) => void
  setMaxExercises: (v: number) => void
  setPerformanceMode: (v: boolean) => void
  setDefaultSearchMode: (v: 'instant' | 'ai') => void
  setTriLingualExamples: (v: boolean) => void
  setModules: (v: AppModule[]) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: '',
      aiEndpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      aiModel: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      aiApiKeys: {},
      aiModels: {},
      historyEnabled: true,
      darkMode: false,
      webSearchEnabled: false,
      tavilyApiKey: '',
      maxExercises: 5,
      performanceMode: false,
      defaultSearchMode: 'instant',
      triLingualExamples: false,
      modules: DEFAULT_MODULES,
      setAiProvider: (aiProvider) =>
        set((state) => ({
          aiProvider,
          aiModel: state.aiModels[aiProvider] || state.aiModel,
        })),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) =>
        set((state) => ({
          aiModel,
          aiModels: { ...state.aiModels, [state.aiProvider]: aiModel },
        })),
      setApiKeyForProvider: (providerId, key) =>
        set((state) => ({ aiApiKeys: { ...state.aiApiKeys, [providerId]: key } })),
      setAiModelForProvider: (providerId, model) =>
        set((state) => ({ aiModels: { ...state.aiModels, [providerId]: model } })),
      setHistoryEnabled: (historyEnabled) => set({ historyEnabled }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),
      setTavilyApiKey: (tavilyApiKey) => set({ tavilyApiKey }),
      setMaxExercises: (maxExercises) => set({ maxExercises }),
      setPerformanceMode: (performanceMode) => set({ performanceMode }),
      setDefaultSearchMode: (defaultSearchMode) => set({ defaultSearchMode }),
      setTriLingualExamples: (triLingualExamples) => set({ triLingualExamples }),
      setModules: (modules) => set({ modules: normalizeModules(modules) }),
    }),
    {
      name: 'lexicon-settings',
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsStore>
        return {
          ...current,
          ...persistedState,
          modules: normalizeModules(persistedState.modules),
        }
      },
    }
  )
)
