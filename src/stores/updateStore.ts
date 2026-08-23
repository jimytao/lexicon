import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileOpener } from '@capawesome-team/capacitor-file-opener'
import { Device } from '@capacitor/device'
import { isCapacitor, isTauri } from '../services/platform'
import { tStatic } from '../i18n'

function compareVersions(v1: string, v2: string): number {
  const sanitize = (v: string) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0)
  const parts1 = sanitize(v1)
  const parts2 = sanitize(v2)
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
  notes_zh?: string
  notes_en?: string
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
  'https://raw.githubusercontent.com/jimytao/lexicon/master/version.json',
  'https://cdn.jsdelivr.net/gh/jimytao/lexicon@master/version.json',
  'https://gcore.jsdelivr.net/gh/jimytao/lexicon@master/version.json'
]

async function fetchManifestWithFallback(): Promise<UpdateManifest> {
  const results = await Promise.allSettled(
    UPDATE_URLS.map(async (url) => {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const bust = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`
        const response = await fetch(bust, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`)
        }

        const data = await response.json() as UpdateManifest
        return data
      } finally {
        window.clearTimeout(timeout)
      }
    })
  )

  const successfulManifests = results
    .filter((r): r is PromiseFulfilledResult<UpdateManifest> => r.status === 'fulfilled')
    .map(r => r.value)

  if (successfulManifests.length === 0) {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message || r.reason)
    throw new Error(`Failed to fetch version info: ${errors.join(', ') || 'Network error'}`)
  }

  // Sort by version (highest first)
  successfulManifests.sort((a, b) => compareVersions(b.version, a.version))

  return successfulManifests[0]
}


export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      progress: 0,
      manifest: null,
      currentVersion: '0.9.17', // Should match package.json
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
          // 1. Try to fetch manifest, but don't let failure kill everything
          let data: UpdateManifest | null = null
          try {
            data = await fetchManifestWithFallback()
          } catch (e) {
            console.warn('Manifest fetch failed, will rely on platform-specific checks', e)
          }

          let hasUpdate = false
          let updateInfo: UpdateManifest | null = data

          if (data) {
            const comp = compareVersions(data.version, get().currentVersion)
            if (comp > 0) hasUpdate = true
          }

          // 2. If on Tauri, check native updater
          if (isTauri()) {
            try {
              const tauriUpdate = await check()
              if (tauriUpdate) {
                const tauriComp = compareVersions(tauriUpdate.version, get().currentVersion)
                if (tauriComp > 0) {
                  hasUpdate = true
                  // Merge tauri data into updateInfo, preferring manifest for is_major
                  updateInfo = {
                    ...(updateInfo || { version: tauriUpdate.version, notes: '', pub_date: '', platforms: {} }),
                    version: tauriUpdate.version,
                    notes: tauriUpdate.body || (updateInfo?.notes || ''),
                  }
                }
              }
            } catch (tauriErr) {
              console.warn('Tauri updater check failed', tauriErr)
            }
          }

          if (hasUpdate && updateInfo) {
            const rawInfoVersion = updateInfo.version.replace(/^v/i, '')
            const isIgnored = get().ignoredVersions.some(v => v.replace(/^v/i, '') === rawInfoVersion)
            const shouldAutoShow = !force && updateInfo.is_major && !isIgnored
            const shouldToast = !force && !shouldAutoShow && !isIgnored && rawInfoVersion !== get().lastToastedVersion?.replace(/^v/i, '')
            
            if (shouldToast) {
              set({ lastToastedVersion: updateInfo.version })
            }

            const displayVersion = updateInfo.version.startsWith('v') ? updateInfo.version : `v${updateInfo.version}`

            set({
              status: 'available',
              manifest: updateInfo,
              hasSeenBadge: false,
              lastChecked: now,
              isModalOpen: force || shouldAutoShow,
              toastMessage: force ? null : (shouldToast ? tStatic('update.toast.newVersion', { version: displayVersion }) : null)
            })
          } else if (updateInfo && compareVersions(updateInfo.version, get().currentVersion) === 0) {
            set({ status: 'up-to-date', lastChecked: now, toastMessage: force ? tStatic('update.toast.upToDate') : null })
          } else if (hasUpdate === false && !data) {
            // If we couldn't even fetch manifest and tauri found nothing
            throw new Error(tStatic('update.error.server'))
          } else {
            set({ status: 'higher-version', lastChecked: now, toastMessage: force ? tStatic('update.toast.higherVersion') : null })
          }
        } catch (err: any) {
          console.error('Update check failed:', err)
          if (force) {
            set({
              status: 'error',
              error: err.message || tStatic('update.toast.checkFailed', { message: '' }),
              lastChecked: now,
              toastMessage: tStatic('update.toast.checkFailed', { message: err.message || '' })
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
              const rawVersion = manifest.version.replace(/^v/i, '')
              const url = `https://github.com/jimytao/lexicon/releases/tag/v${rawVersion}`
              window.open(url, '_blank')
              set({ status: 'idle' })
              return
            }

            const manifestUrl = manifest.platforms?.android?.url
            const rawVersion = manifest.version.replace(/^v/i, '')
            const apkUrl = manifestUrl || `https://github.com/jimytao/lexicon/releases/download/v${rawVersion}/Lexicon_${rawVersion}_universal_signed.apk`

            const filename = `lexicon-${rawVersion}.apk`

            // Delete any previous partial download first
            await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {})

            // Track download progress natively
            const progressListener = await Filesystem.addListener('progress', (status) => {
              if (status.url === apkUrl && status.contentLength > 0) {
                set({ progress: Math.round((status.bytes / status.contentLength) * 100) })
              }
            })

            try {
              await Filesystem.downloadFile({
                url: apkUrl,
                path: filename,
                directory: Directory.Cache,
                progress: true,
              })
            } finally {
              await progressListener.remove()
            }

            set({ status: 'ready', progress: 100 })
          }
        } catch (err: any) {
          set({ status: 'error', error: err.message || 'Download failed' })
        }
      },

      installUpdate: async () => {
        try {
          if (isTauri()) {
            await relaunch()
          } else {
            const { manifest } = get()
            if (!manifest) return
            const rawVersion = manifest.version.replace(/^v/i, '')
            const filename = `lexicon-${rawVersion}.apk`

            // Pre-flight: ensure the APK still exists in cache.
            // The OS may have cleared the cache between download and install
            // (especially on Android 11+ with aggressive storage management).
            let fileUri: string
            try {
              const file = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
              fileUri = file.uri
              console.log('[Update] APK URI:', fileUri)
            } catch {
              // File missing — reset to 'available' so user can re-download
              set({
                status: 'available',
                progress: 0,
                error: tStatic('update.error.apkCleared')
              })
              return
            }

            try {
              await FileOpener.openFile({
                path: fileUri,
                mimeType: 'application/vnd.android.package-archive'
              })
              // FileOpener resolved — the system install dialog should now be visible.
              // On Android 8+ the user still needs to grant "Install unknown apps" in
              // the dialog itself; we cannot do that programmatically.
            } catch (openErr: any) {
              // FileOpener threw — most common cause on Android 8+ is that the
              // "Install unknown apps" per-app permission has not been granted.
              // Fall back to opening the direct APK download URL in the browser
              // so the user can install via their browser or file manager instead.
              console.warn('[Update] FileOpener failed:', openErr?.message || openErr)
              const releaseUrl = `https://github.com/jimytao/lexicon/releases/download/v${rawVersion}/Lexicon_${rawVersion}_universal_signed.apk`
              window.open(releaseUrl, '_blank')
              set({
                status: 'error',
                error: tStatic('update.error.installPermission')
              })
            }
          }
        } catch (err: any) {
          console.error('Installation failed:', err)
          set({
            status: 'error',
            error: tStatic('update.error.installFailed', {
              message: err.message || tStatic('update.error.installFallback'),
            }),
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

          if (result.files && result.files.length > 0) {
            for (const file of result.files) {
              const fileName = typeof file === 'string' ? file : file.name
              if (fileName.endsWith('.apk')) {
                await Filesystem.deleteFile({
                  path: fileName,
                  directory: Directory.Cache
                }).catch(() => {}) // Ignore errors if already deleted
              }
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
