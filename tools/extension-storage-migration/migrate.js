const OLD_ID = 'jbegmldkncjfbkkckfjdppdclpfajjdh'
const NEW_ID = 'akkabgjdlehjmfnmjpfkdgmaghdncdol'

const description = document.querySelector('#description')
const migrateButton = document.querySelector('#migrate')
const status = document.querySelector('#status')

function snapshotLocalStorage() {
  return Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key != null)
      .map((key) => [key, localStorage.getItem(key)]),
  )
}

if (chrome.runtime.id === OLD_ID) {
  description.textContent = '旧版迁移桥已就绪。请保持此页面打开。'
  status.textContent = `已读取旧版 ${localStorage.length} 项本地数据，等待新版请求。`

  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (sender.id !== NEW_ID || message?.type !== 'lexicon-export-local-storage') return
    void chrome.storage.local.get(null).then((extensionData) => {
      sendResponse({ ok: true, data: snapshotLocalStorage(), extensionData })
    })
    return true
  })
} else if (chrome.runtime.id === NEW_ID) {
  description.textContent = '将旧版 localStorage（设置、API 配置、历史和缓存）复制到新版。新版现有数据会先保存在一个备份项中。'
  migrateButton.hidden = false
  status.textContent = '请先在另一个标签页打开旧版迁移桥，然后点击迁移。'

  async function migrate() {
    migrateButton.disabled = true
    status.textContent = '正在读取 0.9.22 数据…'
    try {
      const response = await chrome.runtime.sendMessage(OLD_ID, {
        type: 'lexicon-export-local-storage',
      })
      if (!response?.ok || !response.data) throw new Error('旧版没有返回数据')

      const backupKey = `lexicon-migration-backup-${new Date().toISOString()}`
      localStorage.setItem(backupKey, JSON.stringify(snapshotLocalStorage()))
      for (const [key, value] of Object.entries(response.data)) {
        if (typeof value === 'string') localStorage.setItem(key, value)
      }

      await chrome.storage.local.set({
        ...(response.extensionData ?? {}),
        lexiconMigrationComplete: {
          from: '0.9.22',
          localStorageItems: Object.keys(response.data).length,
          completedAt: new Date().toISOString(),
        },
      })

      status.textContent = `迁移完成：已复制 ${Object.keys(response.data).length} 项；新版原数据备份在 ${backupKey}。请重新加载 0.9.25。`
    } catch (error) {
      status.textContent = `迁移失败：${error instanceof Error ? error.message : String(error)}`
      migrateButton.disabled = false
    }
  }

  migrateButton.addEventListener('click', migrate)
  if (new URLSearchParams(location.search).get('auto') === '1') void migrate()
} else {
  description.textContent = '当前扩展 ID 不属于本次迁移。'
  status.textContent = chrome.runtime.id
}
