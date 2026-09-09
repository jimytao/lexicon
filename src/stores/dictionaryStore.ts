import { create } from 'zustand'
import type { DictionaryId } from '../services/db.web'

/**
 * 扩展侧词库下载的 UI 状态。
 *
 * 刻意**不做 persist**：真正的「已装什么」以 OPFS 里的文件为准
 *（文件名带版本号），这里只承载进度与错误，避免两份真相。
 *
 * 见 lexicon-docs/10-browser-extension.md §3。
 */

export type DictionaryPhase =
  | 'idle'
  | 'checking'   // 拉远程 manifest
  | 'downloading'
  | 'verifying'  // 校验 SHA-256
  | 'ready'
  | 'error'

export interface DictionaryProgress {
  phase: DictionaryPhase
  /** 正在处理哪本词库；idle 时为 null */
  dict: DictionaryId | null
  receivedBytes: number
  totalBytes: number
  /** 用户可读的错误文案（已本地化前的英文 key 由调用方决定，这里存原始信息） */
  error: string | null
}

interface DictionaryState extends DictionaryProgress {
  beginCheck: (dict: DictionaryId) => void
  beginDownload: (dict: DictionaryId, totalBytes: number) => void
  advance: (receivedBytes: number) => void
  beginVerify: () => void
  finish: () => void
  fail: (error: string) => void
  reset: () => void
}

const IDLE: DictionaryProgress = {
  phase: 'idle',
  dict: null,
  receivedBytes: 0,
  totalBytes: 0,
  error: null,
}

export const useDictionaryStore = create<DictionaryState>((set) => ({
  ...IDLE,

  beginCheck: (dict) => set({ ...IDLE, phase: 'checking', dict }),

  beginDownload: (dict, totalBytes) =>
    set({ phase: 'downloading', dict, totalBytes, receivedBytes: 0, error: null }),

  advance: (receivedBytes) => set({ receivedBytes }),

  beginVerify: () => set({ phase: 'verifying' }),

  finish: () => set({ phase: 'ready', error: null }),

  fail: (error) => set({ phase: 'error', error }),

  reset: () => set({ ...IDLE }),
}))
