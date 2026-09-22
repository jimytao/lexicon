/**
 * 浏览器扩展的词库实现。
 *
 * 与 db.web.ts 的关系：**不重复实现查询与并发逻辑**。本文件只替换
 * 「词库字节从哪来」这一层（`setDbBytesSource`），然后直接复用 db.web.ts
 * 导出的 `webDB` / `warmupDictionary` —— 那里有整套 epoch / gate 失效逻辑，
 * 复制一份必然漂移。
 *
 * 字节来源：OPFS 缓存 → 未命中则从 GitHub Release 下载并校验 SHA-256。
 * 70MB 词库不打包进 CRX，见 lexicon-docs/10-browser-extension.md §3。
 */
import {
  setDbBytesSource,
  webDB,
  warmupDictionary,
  invalidateDictionaries,
  type DictionaryId,
} from './db.web'
import { useDictionaryStore } from '../stores/dictionaryStore'

export { webDB, warmupDictionary }

/**
 * 词库清单的固定入口。刻意用一个**专用的、可覆盖上传的 tag**（`dictionaries`），
 * 而不是 `releases/latest` —— 后者指向 App 发版，会迫使每次发版都重新挂 70MB 附件。
 * 清单内部用绝对 URL 指向真正的资产，所以资产可以放在任意 tag 上。
 */
const MANIFEST_URL =
  'https://github.com/jimytao/lexicon/releases/download/dictionaries/manifest.json'

const OPFS_DIR = 'dictionaries'

interface DictionaryEntry {
  /** 版本号，进 OPFS 文件名，用于判断是否需要更新 */
  version: string
  url: string
  /** 小写十六进制 SHA-256 */
  sha256: string
  bytes: number
}

interface DictionaryManifest {
  enzh: DictionaryEntry
  envi?: DictionaryEntry
  enen?: DictionaryEntry
}

let _manifest: DictionaryManifest | null = null
let _manifestLoading: Promise<DictionaryManifest> | null = null

/** 允许测试/本地验证时把清单指到别处，避免必须先上传 GitHub Release。 */
let _manifestUrl = MANIFEST_URL
export function setDictionaryManifestUrl(url: string): void {
  _manifestUrl = url
  _manifest = null
  _manifestLoading = null
}

async function getManifest(): Promise<DictionaryManifest> {
  if (_manifest) return _manifest
  if (_manifestLoading) return _manifestLoading

  const loading = (async () => {
    const res = await fetch(_manifestUrl, { cache: 'no-cache' })
    if (!res.ok) {
      throw new Error(
        `词库清单不可用（HTTP ${res.status}）。请确认 ${_manifestUrl} 已上传。`,
      )
    }
    const parsed = (await res.json()) as DictionaryManifest
    if (!parsed.enzh?.url || !parsed.enzh?.sha256) {
      throw new Error('词库清单格式不合法：缺少 enzh.url / enzh.sha256')
    }
    _manifest = parsed
    return parsed
  })()

  _manifestLoading = loading
  void loading.finally(() => {
    if (_manifestLoading === loading) _manifestLoading = null
  })
  return loading
}

/* ---------------- OPFS ---------------- */

function fileNameFor(dict: DictionaryId, version: string): string {
  return `${dict}-${version}.db`
}

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(OPFS_DIR, { create: true })
}

async function readFromOpfs(name: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await opfsDir()
    const handle = await dir.getFileHandle(name)
    const file = await handle.getFile()
    // 空文件 = 上次写入中断，视为未命中并让下载流程覆盖它
    if (file.size === 0) return null
    return file.arrayBuffer()
  } catch {
    return null
  }
}

async function writeToOpfs(name: string, bytes: ArrayBuffer): Promise<void> {
  const dir = await opfsDir()
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(bytes)
  } finally {
    await writable.close()
  }
}

/**
 * 删掉同一本词库的旧版本文件，避免 OPFS 里堆几十 MB 的垃圾。
 *
 * 注意必须用 `keys()`：`FileSystemDirectoryHandle` 的**默认**异步迭代器
 * 产出的是 `[name, handle]` 条目（类似 Map），不是字符串。早先误用默认迭代器
 * 导致 `name.startsWith` 抛 TypeError 并被静默吞掉，清理形同没做。
 */
async function pruneOldVersions(dict: DictionaryId, keep: string): Promise<void> {
  try {
    const dir = await opfsDir()
    // TS DOM lib 尚未声明 keys()/entries()
    const keys = (dir as unknown as { keys(): AsyncIterableIterator<string> }).keys()
    const stale: string[] = []
    for await (const name of keys) {
      if (name.startsWith(`${dict}-`) && name.endsWith('.db') && name !== keep) {
        stale.push(name)
      }
    }
    for (const name of stale) {
      await dir.removeEntry(name).catch(() => undefined)
    }
  } catch (e) {
    // 只是回收空间，失败不影响功能 —— 但必须留声，否则又是一次静默失效
    console.warn('[db.extension] 旧词库清理失败:', e)
  }
}

/* ---------------- 下载 + 校验 ---------------- */

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 流式下载以便上报进度，但**校验仍在全量字节上做** ——
 * crypto.subtle 没有流式 API。峰值内存约为文件大小的 2 倍，
 * 而 sql.js 本来就要把整库常驻内存，所以这个代价是可接受的。
 */
async function download(dict: DictionaryId, entry: DictionaryEntry): Promise<ArrayBuffer> {
  const store = useDictionaryStore.getState()
  const res = await fetch(entry.url)
  if (!res.ok) throw new Error(`词库下载失败（HTTP ${res.status}）：${entry.url}`)

  const total = Number(res.headers.get('content-length')) || entry.bytes || 0
  store.beginDownload(dict, total)

  const chunks: Uint8Array[] = []
  let received = 0

  if (res.body) {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      useDictionaryStore.getState().advance(received)
    }
  } else {
    // 理论上不该走到（Chrome 都有 body），留个兜底
    const buf = await res.arrayBuffer()
    chunks.push(new Uint8Array(buf))
    received = buf.byteLength
    useDictionaryStore.getState().advance(received)
  }

  const merged = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }

  useDictionaryStore.getState().beginVerify()
  const actual = await sha256Hex(merged.buffer)
  if (actual !== entry.sha256.toLowerCase()) {
    throw new Error(
      `词库校验失败：期望 ${entry.sha256.slice(0, 12)}… 实际 ${actual.slice(0, 12)}…。文件可能损坏或被篡改，未写入缓存。`,
    )
  }

  return merged.buffer
}

/* ---------------- 字节来源 ---------------- */

const opfsBytesSource = async (dict: DictionaryId): Promise<ArrayBuffer | null> => {
  const store = useDictionaryStore.getState()
  try {
    store.beginCheck(dict)
    const manifest = await getManifest()
    const entry = dict === 'enen' ? manifest.enen : dict === 'envi' ? manifest.envi : manifest.enzh

    // Optional dictionaries may be omitted from older manifests.
    if (!entry) {
      store.reset()
      return null
    }

    const name = fileNameFor(dict, entry.version)

    const cached = await readFromOpfs(name)
    if (cached) {
      store.finish()
      return cached
    }

    const bytes = await download(dict, entry)
    await writeToOpfs(name, bytes)
    void pruneOldVersions(dict, name)
    store.finish()
    return bytes
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    store.fail(message)
    // 双语库失败必须抛（上层要展示错误）；英英库失败返回 null 走降级
    if (dict === 'enen') {
      console.warn('[db.extension] 英英库不可用，降级到双语库:', message)
      return null
    }
    throw e
  }
}

setDbBytesSource(opfsBytesSource)

/* ---------------- 词库管理（设置页用） ---------------- */

export interface InstalledDictionary {
  dict: DictionaryId
  version: string
  bytes: number
}

/** OPFS 是「已装什么」的唯一真相，所以直接列文件而不是另存一份元数据。 */
export async function listInstalledDictionaries(): Promise<InstalledDictionary[]> {
  const out: InstalledDictionary[] = []
  try {
    const dir = await opfsDir()
    const entries = (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemFileHandle]>
    }).entries()
    for await (const [name, handle] of entries) {
      // 文件名形如 enzh-oald9-1.db —— 第一段是词库 id，其余是版本号
      const match = /^(enzh|envi|enen)-(.+)\.db$/.exec(name)
      if (!match) continue
      const file = await handle.getFile()
      out.push({
        dict: match[1] as DictionaryId,
        version: match[2],
        bytes: file.size,
      })
    }
  } catch (e) {
    console.warn('[db.extension] 读取已装词库失败:', e)
  }
  return out.sort((a, b) => a.dict.localeCompare(b.dict))
}

/**
 * 删除所有已下载词库并让内存实例作废。
 * 下次查词会重新下载 —— 所以这是「释放空间」而非「卸载功能」。
 */
export async function removeInstalledDictionaries(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(OPFS_DIR, { recursive: true }).catch(() => undefined)
  invalidateDictionaries()
  useDictionaryStore.getState().reset()
}
