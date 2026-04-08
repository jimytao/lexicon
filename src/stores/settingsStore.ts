import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsStore {
  aiProvider: string
  aiEndpoint: string
  aiModel: string
  aiApiKeys: Record<string, string>  // keyed by providerId
  historyEnabled: boolean
  darkMode: boolean
  maxExercises: number
  setAiProvider: (v: string) => void
  setAiEndpoint: (v: string) => void
  setAiModel: (v: string) => void
  setApiKeyForProvider: (providerId: string, key: string) => void
  setHistoryEnabled: (v: boolean) => void
  setDarkMode: (v: boolean) => void
  setMaxExercises: (v: number) => void
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
      maxExercises: 5,
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) => set({ aiModel }),
      setApiKeyForProvider: (providerId, key) =>
        set((state) => ({ aiApiKeys: { ...state.aiApiKeys, [providerId]: key } })),
      setHistoryEnabled: (historyEnabled) => set({ historyEnabled }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setMaxExercises: (maxExercises) => set({ maxExercises }),
    }),
    { name: 'lexicon-settings' }
  )
)
