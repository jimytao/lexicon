import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { Device } from '@capacitor/device'

interface UpdateManifest {
  version: string
  notes: string
  pub_date: string
  platforms: {
    [key: string]: {
      url: string
      signature?: string
    }
  }
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date'

interface UpdateState {
  status: UpdateStatus
  progress: number
  manifest: UpdateManifest | null
  currentVersion: string
  error: string | null
  hasSeenBadge: boolean
  lastChecked: number
  autoCheckDone: boolean
  
  checkUpdate: (force?: boolean) => Promise<void>
  startDownload: () => Promise<void>
  installUpdate: () => Promise<void>
  setHasSeenBadge: (v: boolean) => void
  reset: () => void
  cleanupOldApks: () => Promise<void>
}

const UPDATE_URLS = [
  'https://cdn.jsdelivr.net/gh/jimytao/lexicon@main/version.json',
  'https://raw.githubusercontent.com/jimytao/lexicon/main/version.json',
  'https://gcore.jsdelivr.net/gh/jimytao/lexicon@main/version.json'
]

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      progress: 0,
      manifest: null,
      currentVersion: '0.7.3', // Should match package.json
      error: null,
      hasSeenBadge: false,
      lastChecked: 0,
      autoCheckDone: false,

      setHasSeenBadge: (hasSeenBadge) => set({ hasSeenBadge }),

      reset: () => set({ status: 'idle', progress: 0, error: null, manifest: null }),

      checkUpdate: async (force = false) => {
        const now = Date.now()
        if (!force) {
          if (get().autoCheckDone) return
          set({ autoCheckDone: true })
        }

        set({ status: 'checking', error: null })
        try {
          const isTauri = (window as any).__TAURI_INTERNALS__ !== undefined

          if (isTauri) {
            const update = await check()
            if (update) {
              set({
                status: 'available',
                manifest: {
                  version: update.version,
                  notes: update.body || '',
                  pub_date: update.date || '',
                  platforms: {} // Tauri handles its own urls
                },
                hasSeenBadge: false,
                lastChecked: now
              })
            } else {
              set({ status: 'up-to-date', lastChecked: now })
            }
          } else {
            // Capacitor / Mobile
            let data: UpdateManifest | null = null
            let fetchErr: Error | null = null
            
            for (const url of UPDATE_URLS) {
              try {
                const response = await fetch(url)
                if (response.ok) {
                  data = await response.json()
                  break
                }
              } catch (e) {
                fetchErr = e as Error
              }
            }
            
            if (!data) throw new Error('Failed to fetch version info: ' + (fetchErr?.message || 'Network error'))
            
            if (data.version !== get().currentVersion) {
              set({
                status: 'available',
                manifest: data,
                hasSeenBadge: false,
                lastChecked: now
              })
            } else {
              set({ status: 'up-to-date', lastChecked: now })
            }
          }
        } catch (err: any) {
          console.error('Update check failed:', err)
          if (force) {
            set({
              status: 'error',
              error: err.message || 'Update check failed',
              lastChecked: now,
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
          const isTauri = (window as any).__TAURI_INTERNALS__ !== undefined
          if (isTauri) {
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
            }
          } else {
            // Android Capacitor
            const info = await Device.getInfo()
            if (info.platform !== 'android') {
              // iOS or other: just open URL
              const url = manifest.platforms.ios?.url || 'https://github.com/jimytao/lexicon/releases/latest'
              window.open(url, '_blank')
              set({ status: 'idle' })
              return
            }

            const apkUrl = manifest.platforms.android?.url
            if (!apkUrl) throw new Error('No Android download URL found')

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
        const isTauri = (window as any).__TAURI_INTERNALS__ !== undefined
        if (isTauri) {
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
        lastChecked: state.lastChecked
      })
    }
  )
)
