import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppModule {
  id: string
  label: string
  enabled: boolean
}

export const DEFAULT_MODULES: AppModule[] = [
  { id: 'dictionary', label: '字典/词典', enabled: true },
  { id: 'synonyms', label: '近义词/反义词', enabled: true },
  { id: 'etymology', label: '词根词缀', enabled: true },
  { id: 'mnemonic', label: 'AI 助记', enabled: true },
  { id: 'examples', label: '双语例句', enabled: true },
  { id: 'practice', label: '场景练习', enabled: true },
  { id: 'chat', label: 'AI 问答', enabled: true },
]

interface SettingsStore {
  aiProvider: string
  aiEndpoint: string
  aiModel: string
  aiApiKeys: Record<string, string>  // keyed by providerId
  historyEnabled: boolean
  darkMode: boolean
  webSearchEnabled: boolean
  tavilyApiKey: string
  maxExercises: number
  modules: AppModule[]
  setAiProvider: (v: string) => void
  setAiEndpoint: (v: string) => void
  setAiModel: (v: string) => void
  setApiKeyForProvider: (providerId: string, key: string) => void
  setHistoryEnabled: (v: boolean) => void
  setDarkMode: (v: boolean) => void
  setWebSearchEnabled: (v: boolean) => void
  setTavilyApiKey: (v: string) => void
  setMaxExercises: (v: number) => void
  setModules: (v: AppModule[]) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiProvider: '',
      aiEndpoint: import.meta.env.VITE_AI_ENDPOINT ?? '',
      aiModel: import.meta.env.VITE_AI_MODEL ?? 'gemini-2.0-flash',
      aiApiKeys: {},
      historyEnabled: true,
      darkMode: false,
      webSearchEnabled: false,
      tavilyApiKey: '',
      maxExercises: 5,
      modules: DEFAULT_MODULES,
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) => set({ aiModel }),
      setApiKeyForProvider: (providerId, key) =>
        set((state) => ({ aiApiKeys: { ...state.aiApiKeys, [providerId]: key } })),
      setHistoryEnabled: (historyEnabled) => set({ historyEnabled }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),
      setTavilyApiKey: (tavilyApiKey) => set({ tavilyApiKey }),
      setMaxExercises: (maxExercises) => set({ maxExercises }),
      setModules: (modules) => set({ modules }),
    }),
    { name: 'lexicon-settings' }
  )
)
