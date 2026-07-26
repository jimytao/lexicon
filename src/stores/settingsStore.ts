import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useResultStore } from './resultStore'


export interface AppModule {
  id: string
  label: string
  enabled: boolean
}

/** Lookup（理解与记忆）出厂模组 — 顺序可拖拽覆盖 */
export const DEFAULT_MODULES: AppModule[] = [
  { id: 'dictionary',  label: 'Definitions',          enabled: true },
  { id: 'coreConcept', label: 'Core Image (Memory)',  enabled: true },
  { id: 'etymology',   label: 'Roots & Affixes',      enabled: true },
  { id: 'mnemonic',    label: 'AI Mnemonics',         enabled: true },
  { id: 'examples',    label: 'Examples',             enabled: true },
  { id: 'related',     label: 'Related Phrases',      enabled: true },
  { id: 'preposition', label: 'Prep. Imagery',        enabled: true },
  { id: 'practice',    label: 'Meaning Check',        enabled: true },
  { id: 'chat',        label: 'AI Chat',              enabled: true },
]

/** Pure Core 单词出厂模组 — P1 顺序可拖拽覆盖（含选用对照 wordChoice） */
export const DEFAULT_CORE_MODULES: AppModule[] = [
  { id: 'coreConcept',  label: 'Usage Image',            enabled: true },
  { id: 'wordGraph',    label: 'Concept Tree Graph',     enabled: true },
  { id: 'chunks',       label: 'Prep Phrases',           enabled: true },
  { id: 'collocations', label: 'Other Collocations',     enabled: true },
  { id: 'synonyms',     label: 'Synonyms & Nuances',     enabled: true },
  { id: 'wordChoice',   label: 'Word Choice Contrast',   enabled: true },
  { id: 'usageScenes',  label: 'Usage Scenes',           enabled: true },
  { id: 'culture',      label: 'Cultural Context',       enabled: true },
  { id: 'practice',     label: 'Usage Practice',         enabled: true },
  { id: 'chat',         label: 'AI Chat Follow-up',      enabled: true },
]

/** Pure Core 词组/句子出厂模组（与单词列表分离，避免开了却无 UI） */
export const DEFAULT_CORE_PHRASE_MODULES: AppModule[] = [
  { id: 'usageScenes', label: 'Usage Scenes',         enabled: true },
  { id: 'wordChoice',  label: 'Word Choice Contrast', enabled: true },
  { id: 'culture',     label: 'Cultural Context',     enabled: true },
  { id: 'practice',    label: 'Usage Practice',       enabled: true },
  { id: 'chat',        label: 'AI Chat Follow-up',    enabled: true },
]

function insertMissingDefaults(
  normalized: AppModule[],
  defaults: AppModule[]
): AppModule[] {
  for (const defaultModule of defaults) {
    if (normalized.some((module) => module.id === defaultModule.id)) continue

    const defaultIndex = defaults.findIndex((module) => module.id === defaultModule.id)
    const previousDefaultIds = defaults.slice(0, defaultIndex).map((module) => module.id).reverse()
    const nextDefaultIds = defaults.slice(defaultIndex + 1).map((module) => module.id)
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

export function normalizeModules(modules?: AppModule[]): AppModule[] {
  if (!modules) return DEFAULT_MODULES.map((m) => ({ ...m }))

  const defaultsById = new Map(DEFAULT_MODULES.map((module) => [module.id, module]))
  const normalized = modules
    .filter((module) => defaultsById.has(module.id))
    .map((module) => {
      const defaultModule = defaultsById.get(module.id)!
      return { ...defaultModule, enabled: module.enabled }
    })

  return insertMissingDefaults(normalized, DEFAULT_MODULES)
}

/**
 * Core 模组 normalize：剔 dictionary；旧合并模组 collocations → 拆成 chunks + collocations。
 * 保留用户顺序与 enabled。
 */
export function normalizeCoreModules(modules?: AppModule[]): AppModule[] {
  if (!modules) return DEFAULT_CORE_MODULES.map((m) => ({ ...m }))

  const defaultsById = new Map(DEFAULT_CORE_MODULES.map((module) => [module.id, module]))
  const expanded: AppModule[] = []

  for (const module of modules) {
    if (module.id === 'dictionary') continue
    // 旧版单模组「Chunks & Metaphors」→ 拆成介词语组 + 其他常用词组
    if (module.id === 'collocations' && !modules.some((m) => m.id === 'chunks')) {
      expanded.push({
        ...defaultsById.get('chunks')!,
        enabled: module.enabled,
      })
      expanded.push({
        ...defaultsById.get('collocations')!,
        enabled: module.enabled,
      })
      continue
    }
    if (!defaultsById.has(module.id)) continue
    const defaultModule = defaultsById.get(module.id)!
    expanded.push({ ...defaultModule, enabled: module.enabled })
  }

  // 去重（拆分后可能重复）
  const seen = new Set<string>()
  const deduped = expanded.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  return insertMissingDefaults(deduped, DEFAULT_CORE_MODULES)
}

export function normalizeCorePhraseModules(modules?: AppModule[]): AppModule[] {
  if (!modules) return DEFAULT_CORE_PHRASE_MODULES.map((m) => ({ ...m }))

  const defaultsById = new Map(DEFAULT_CORE_PHRASE_MODULES.map((module) => [module.id, module]))
  const normalized = modules
    .filter((module) => defaultsById.has(module.id))
    .map((module) => {
      const defaultModule = defaultsById.get(module.id)!
      return { ...defaultModule, enabled: module.enabled }
    })

  return insertMissingDefaults(normalized, DEFAULT_CORE_PHRASE_MODULES)
}

/** 升级时从单词 Core 列表里抽出词组可用模组作为种子 */
export function seedCorePhraseModulesFromCore(coreModules?: AppModule[]): AppModule[] {
  if (!coreModules?.length) return DEFAULT_CORE_PHRASE_MODULES.map((m) => ({ ...m }))
  const allowed = new Set(DEFAULT_CORE_PHRASE_MODULES.map((m) => m.id))
  const seeded = coreModules
    .filter((m) => allowed.has(m.id))
    .map((m) => ({ ...m }))
  return normalizeCorePhraseModules(seeded.length ? seeded : undefined)
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
  /** 历史回放时若 Lookup 与 Core 双轨都有结果，优先展示哪一轨 */
  historyPreferCognitive: 'lookup' | 'core'
  triLingualExamples: boolean
  modules: AppModule[]
  coreModules: AppModule[]
  /** Pure Core 词组/句子模组（与 coreModules 单词列表分离） */
  corePhraseModules: AppModule[]
  appLanguage: 'zh' | 'en'
  monolingualWord: boolean
  monolingualPhrase: boolean
  monolingualSentence: boolean
  activeDictionary: 'lexicon.db' | 'lexicon_en.db'
  autoSwitchDictionary: boolean
  chatRichContextDefault: boolean
  pronunciationAccent: 'uk' | 'us'
  autoPlayPronunciation: boolean
  enableProfileDiagnostic: boolean
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
  setHistoryPreferCognitive: (v: 'lookup' | 'core') => void
  setTriLingualExamples: (v: boolean) => void
  setModules: (v: AppModule[]) => void
  setCoreModules: (v: AppModule[]) => void
  setCorePhraseModules: (v: AppModule[]) => void
  setAppLanguage: (v: 'zh' | 'en') => void
  setMonolingualWord: (v: boolean) => void
  setMonolingualPhrase: (v: boolean) => void
  setMonolingualSentence: (v: boolean) => void
  setActiveDictionary: (v: 'lexicon.db' | 'lexicon_en.db') => void
  setAutoSwitchDictionary: (v: boolean) => void
  setChatRichContextDefault: (v: boolean) => void
  setPronunciationAccent: (v: 'uk' | 'us') => void
  setAutoPlayPronunciation: (v: boolean) => void
  setEnableProfileDiagnostic: (v: boolean) => void
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
      historyPreferCognitive: 'lookup',
      triLingualExamples: false,
      modules: DEFAULT_MODULES,
      coreModules: DEFAULT_CORE_MODULES,
      corePhraseModules: DEFAULT_CORE_PHRASE_MODULES,
      appLanguage: 'en',
      monolingualWord: false,
      monolingualPhrase: false,
      monolingualSentence: false,
      activeDictionary: 'lexicon.db',
      autoSwitchDictionary: true,
      chatRichContextDefault: false,
      pronunciationAccent: 'us',
      autoPlayPronunciation: false,
      enableProfileDiagnostic: true,
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
      setHistoryPreferCognitive: (historyPreferCognitive) => set({ historyPreferCognitive }),
      setTriLingualExamples: (triLingualExamples) => set({ triLingualExamples }),
      setModules: (modules) => set({ modules: normalizeModules(modules) }),
      setCoreModules: (coreModules) => set({ coreModules: normalizeCoreModules(coreModules) }),
      setCorePhraseModules: (corePhraseModules) =>
        set({ corePhraseModules: normalizeCorePhraseModules(corePhraseModules) }),
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
      setEnableProfileDiagnostic: (enableProfileDiagnostic) => set({ enableProfileDiagnostic }),
    }),

    {
      name: 'lexicon-settings',
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsStore>
        return {
          ...current,
          ...persistedState,
          modules: normalizeModules(persistedState.modules),
          coreModules: normalizeCoreModules(persistedState.coreModules ?? DEFAULT_CORE_MODULES),
          corePhraseModules: normalizeCorePhraseModules(
            persistedState.corePhraseModules
              ?? seedCorePhraseModulesFromCore(persistedState.coreModules)
          ),
        }
      },
    }
  )
)
