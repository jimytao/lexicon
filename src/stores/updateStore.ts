import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { Device } from '@capacitor/device'
import { isCapacitor, isTauri } from '../services/platform'

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const n1 = parts1[i] || 0
    const n2 = parts2[i] || 0
    if (n1 > n2) return 1
    if (n1 < n2) return -1
  }
  return 0
}

interface UpdateManifest {
  version: string
  notes: string
  pub_date: string
  is_major?: boolean
  platforms: {
    [key: string]: {
      url: string
      signature?: string
    }
  }
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date' | 'higher-version'

interface UpdateState {
  status: UpdateStatus
  progress: number
  manifest: UpdateManifest | null
  currentVersion: string
  error: string | null
  hasSeenBadge: boolean
  lastChecked: number
  autoCheckDone: boolean
  
  ignoredVersions: string[]
  lastToastedVersion: string | null
  toastMessage: string | null
  isModalOpen: boolean
  
  checkUpdate: (force?: boolean) => Promise<void>
  startDownload: () => Promise<void>
  installUpdate: () => Promise<void>
  setHasSeenBadge: (v: boolean) => void
  reset: () => void
  cleanupOldApks: () => Promise<void>
  
  ignoreVersion: (version: string) => void
  openModal: () => void
  closeModal: () => void
  clearToast: () => void
}

const UPDATE_URLS = [
  'https://cdn.jsdelivr.net/gh/jimytao/lexicon@master/version.json',
  'https://raw.githubusercontent.com/jimytao/lexicon/master/version.json',
  'https://gcore.jsdelivr.net/gh/jimytao/lexicon@master/version.json'
]

async function fetchManifestWithFallback(): Promise<UpdateManifest> {
  let lastError: Error | null = null
  let sawHttp404 = false

  for (const url of UPDATE_URLS) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)

    try {
      const bust = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
      const response = await fetch(bust, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) sawHttp404 = true
        lastError = new Error(`HTTP ${response.status} from ${new URL(url).hostname}`)
        continue
      }

      return await response.json()
    } catch (e) {
      const err = e as Error
      lastError = err.name === 'AbortError'
        ? new Error(`Timeout fetching version info from ${new URL(url).hostname}`)
        : err
    } finally {
      window.clearTimeout(timeout)
    }
  }

  if (sawHttp404) {
    throw new Error('Failed to fetch version info: release manifest unavailable')
  }

  throw new Error(`Failed to fetch version info: ${lastError?.message || 'Network error'}`)
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      progress: 0,
      manifest: null,
      currentVersion: '0.7.6', // Should match package.json
      error: null,
      hasSeenBadge: false,
      lastChecked: 0,
      autoCheckDone: false,

      ignoredVersions: [],
      lastToastedVersion: null,
      toastMessage: null,
      isModalOpen: false,

      setHasSeenBadge: (hasSeenBadge) => set({ hasSeenBadge }),

      ignoreVersion: (version: string) => set({ ignoredVersions: [...new Set([...get().ignoredVersions, version])] }),
      openModal: () => set({ isModalOpen: true }),
      closeModal: () => set({ isModalOpen: false }),
      clearToast: () => set({ toastMessage: null }),

      reset: () => set({ status: 'idle', progress: 0, error: null, manifest: null, isModalOpen: false }),

      checkUpdate: async (force = false) => {
        const now = Date.now()
        if (!force) {
          if (get().autoCheckDone) return
          set({ autoCheckDone: true })
        }

        set({ status: 'checking', error: null, toastMessage: null })
        try {
          if (isTauri()) {
            try {
              const update = await check()
              if (update) {
                const comp = compareVersions(update.version, get().currentVersion)
                if (comp > 0) {
                  const shouldToast = !force && update.version !== get().lastToastedVersion
                  if (shouldToast) {
                    set({ lastToastedVersion: update.version })
                  }

                  set({
                    status: 'available',
                    manifest: {
                      version: update.version,
                      notes: update.body || '',
                      pub_date: update.date || '',
                      platforms: {}
                    },
                    hasSeenBadge: false,
                    lastChecked: now,
                    toastMessage: force ? null : (shouldToast ? `发现新版本 v${update.version}` : null),
                    isModalOpen: force
                  })
                  return
                } else if (comp === 0) {
                  set({ status: 'up-to-date', lastChecked: now, toastMessage: force ? '已是最新版本' : null })
                  return
                } else {
                  set({ status: 'higher-version', lastChecked: now, toastMessage: force ? '当前版本高于云端' : '当前版本高于云端' })
                  return
                }
              }

              set({ status: 'up-to-date', lastChecked: now, toastMessage: force ? '已是最新版本' : null })
              return
            } catch (tauriErr) {
              console.warn('Tauri updater check failed, falling back to remote manifest', tauriErr)
            }
          }

          const data = await fetchManifestWithFallback()
          const comp = compareVersions(data.version, get().currentVersion)

          if (comp > 0) {
            const shouldAutoShow = !force && data.is_major && !get().ignoredVersions.includes(data.version)
            const shouldToast = !force && !shouldAutoShow && data.version !== get().lastToastedVersion
            
            if (shouldToast) {
              set({ lastToastedVersion: data.version })
            }

            set({
              status: 'available',
              manifest: data,
              hasSeenBadge: false,
              lastChecked: now,
              isModalOpen: force || shouldAutoShow,
              toastMessage: force ? null : (shouldToast ? `发现新版本 v${data.version}` : null)
            })
          } else if (comp === 0) {
            set({ status: 'up-to-date', lastChecked: now, toastMessage: force ? '已是最新版本' : null })
          } else {
            set({ status: 'higher-version', lastChecked: now, toastMessage: force ? '当前版本高于云端' : '当前版本高于云端' })
          }
        } catch (err: any) {
          console.error('Update check failed:', err)
          if (force) {
            set({
              status: 'error',
              error: err.message || 'Update check failed',
              lastChecked: now,
              toastMessage: `更新检查失败: ${err.message}`
            })
          } else {
            set({
              status: 'idle',
              error: null,
              lastChecked: now,
            })
          }
        }
      },

      startDownload: async () => {
        const { status, manifest } = get()
        if (status !== 'available' || !manifest) return

        set({ status: 'downloading', progress: 0 })

        try {
          if (isTauri()) {
            const update = await check()
            if (update) {
              let downloaded = 0
              let contentLength = 0
              await update.downloadAndInstall((event) => {
                switch (event.event) {
                  case 'Started':
                    contentLength = event.data.contentLength || 0
                    break
                  case 'Progress':
                    downloaded += event.data.chunkLength
                    if (contentLength > 0) {
                      set({ progress: Math.round((downloaded / contentLength) * 100) })
                    }
                    break
                  case 'Finished':
                    set({ status: 'ready', progress: 100 })
                    break
                }
              })
            } else {
              throw new Error('Desktop updater did not return a downloadable package')
            }
          } else {
            // Android Capacitor
            const info = await Device.getInfo()
            if (info.platform !== 'android') {
              // iOS or other: just open URL
              const url = `https://github.com/jimytao/lexicon/releases/tag/v${manifest.version}`
              window.open(url, '_blank')
              set({ status: 'idle' })
              return
            }

            const apkUrl = `https://github.com/jimytao/lexicon/releases/download/v${manifest.version}/Lexicon_${manifest.version}_universal_signed.apk`

            const filename = `lexicon-${manifest.version}.apk`
            
            // Standard fetch to get progress
            const response = await fetch(apkUrl)
            if (!response.ok) throw new Error('Download failed')
            
            const contentLength = +(response.headers.get('Content-Length') || 0)
            const reader = response.body?.getReader()
            if (!reader) throw new Error('Failed to start download')

            let receivedLength = 0
            const chunks = []
            while(true) {
              const {done, value} = await reader.read()
              if (done) break
              chunks.push(value)
              receivedLength += value.length
              if (contentLength > 0) {
                set({ progress: Math.round((receivedLength / contentLength) * 100) })
              }
            }

            const blob = new Blob(chunks)
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })

            // Save to filesystem
            await Filesystem.writeFile({
              path: filename,
              data: base64,
              directory: Directory.Cache
            })

            set({ status: 'ready', progress: 100 })
          }
        } catch (err: any) {
          set({ status: 'error', error: err.message || 'Download failed' })
        }
      },

      installUpdate: async () => {
        if (isTauri()) {
          await relaunch()
        } else {
          const { manifest } = get()
          if (!manifest) return
          const filename = `lexicon-${manifest.version}.apk`
          const file = await Filesystem.getUri({
            path: filename,
            directory: Directory.Cache
          })

          await FileOpener.openFile({
            path: file.uri,
          })
        }
      },

      cleanupOldApks: async () => {
        try {
          if (!isCapacitor()) return

          const info = await Device.getInfo()
          if (info.platform !== 'android') return

          const result = await Filesystem.readdir({
            path: '',
            directory: Directory.Cache
          })

          for (const file of result.files) {
            if (file.name.endsWith('.apk')) {
              await Filesystem.deleteFile({
                path: file.name,
                directory: Directory.Cache
              })
            }
          }
        } catch (e) {
          console.warn('Cleanup failed', e)
        }
      }
    }),
    {
      name: 'lexicon-update',
      partialize: (state) => ({ 
        hasSeenBadge: state.hasSeenBadge,
        lastChecked: state.lastChecked,
        ignoredVersions: state.ignoredVersions,
        lastToastedVersion: state.lastToastedVersion
      })
    }
  )
)
