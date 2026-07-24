import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useResultStore } from './resultStore'


export interface AppModule {
  id: string
  label: string
  enabled: boolean
}

export const DEFAULT_MODULES: AppModule[] = [
  { id: 'dictionary',   label: 'Definitions',          enabled: true },
  { id: 'collocations', label: 'Chunks & Collocations', enabled: true },
  { id: 'synonyms',     label: 'Synonyms',              enabled: true },
  { id: 'etymology',    label: 'Roots & Affixes',       enabled: true },
  { id: 'mnemonic',     label: 'AI Mnemonics',          enabled: true },
  { id: 'examples',     label: 'Examples',              enabled: true },
  { id: 'related',      label: 'Related Phrases',       enabled: true },
  { id: 'practice',     label: 'Practice',              enabled: true },
  { id: 'culture',      label: 'Cultural Context',      enabled: true },
  { id: 'chat',         label: 'AI Chat',               enabled: true },
  { id: 'preposition',  label: 'Prep. Imagery',         enabled: true },
]

export const DEFAULT_CORE_MODULES: AppModule[] = [
  { id: 'coreConcept',   label: 'Core Image & Concept', enabled: true },
  { id: 'wordGraph',     label: 'Concept Tree Graph',   enabled: true },
  { id: 'collocations',  label: 'Chunks & Metaphors',   enabled: true },
  { id: 'synonyms',      label: 'Synonyms & Nuances',   enabled: true },
  { id: 'dictionary',    label: 'Definitions',          enabled: true },
  { id: 'chat',          label: 'AI Chat Follow-up',    enabled: true },
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
  defaultSearchMode: 'instant' | 'ai' | 'core'
  triLingualExamples: boolean
  modules: AppModule[]
  coreModules: AppModule[]
  appLanguage: 'zh' | 'en'
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
  activeDictionary: 'lexicon.db' | 'lexicon_en.db'
  autoSwitchDictionary: boolean
  chatRichContextDefault: boolean
  pronunciationAccent: 'uk' | 'us'
  autoPlayPronunciation: boolean
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
  setDefaultSearchMode: (v: 'instant' | 'ai' | 'core') => void
  setTriLingualExamples: (v: boolean) => void
  setModules: (v: AppModule[]) => void
  setCoreModules: (v: AppModule[]) => void
  setAppLanguage: (v: 'zh' | 'en') => void
  setMonolingualWord: (v: boolean) => void
  setMonolingualPhrase: (v: boolean) => void
  setMonolingualSentence: (v: boolean) => void
  setActiveDictionary: (v: 'lexicon.db' | 'lexicon_en.db') => void
  setAutoSwitchDictionary: (v: boolean) => void
  setChatRichContextDefault: (v: boolean) => void
  setPronunciationAccent: (v: 'uk' | 'us') => void
  setAutoPlayPronunciation: (v: boolean) => void
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
      coreModules: DEFAULT_CORE_MODULES,
      appLanguage: 'en',
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
      activeDictionary: 'lexicon.db',
      autoSwitchDictionary: true,
      chatRichContextDefault: false,
      pronunciationAccent: 'us',
      autoPlayPronunciation: false,
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
      setCoreModules: (coreModules) => set({ coreModules }),
      setAppLanguage: (appLanguage) => set({ appLanguage }),
      setMonolingualWord: (monolingualWord) => {
        set({ monolingualWord })
        useResultStore.getState().clearCacheOnly()
      },
      setMonolingualPhrase: (monolingualPhrase) => {
        set({ monolingualPhrase })
        useResultStore.getState().clearCacheOnly()
      },
      setMonolingualSentence: (monolingualSentence) => {
        set({ monolingualSentence })
        useResultStore.getState().clearCacheOnly()
      },
      setActiveDictionary: (activeDictionary) => {
        set({ activeDictionary })
        useResultStore.getState().clearCacheOnly()
      },
      setAutoSwitchDictionary: (autoSwitchDictionary) => {
        set({ autoSwitchDictionary })
        useResultStore.getState().clearCacheOnly()
      },
      setChatRichContextDefault: (chatRichContextDefault) => set({ chatRichContextDefault }),
      setPronunciationAccent: (pronunciationAccent) => set({ pronunciationAccent }),
      setAutoPlayPronunciation: (autoPlayPronunciation) => set({ autoPlayPronunciation }),
    }),
    {
      name: 'lexicon-settings',
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsStore>
        return {
          ...current,
          ...persistedState,
          modules: normalizeModules(persistedState.modules),
          // If upgrading from a version before coreModules existed, fall back to defaults
          coreModules: persistedState.coreModules ?? DEFAULT_CORE_MODULES,
        }
      },
    }
  )
)
