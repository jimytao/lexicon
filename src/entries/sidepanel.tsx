/**
 * 浏览器扩展 Side Panel 入口。
 *
 * 与 src/main.tsx 的唯一区别：这里要在挂载前**用 JS 补上深色模式启动门**。
 * index.html 里那段逻辑是内联 <script>，而 MV3 CSP 的 `script-src 'self'`
 * 禁止内联脚本，所以必须搬进模块。
 *
 * 页面在 React 挂载前是空的，module script 又在首次绘制前执行，
 * 因此这里应用 .dark 类与内联做法等效，不会闪白。
 *
 * 见 lexicon-docs/10-browser-extension.md §6。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { App } from '../App'
import {
  applyDocumentAppearance,
  migrateAppearance,
  resolveDark,
} from '../services/appearance'

/** 复刻 index.html 内联脚本的行为，但复用 appearance.ts 的实现，避免两份逻辑漂移。 */
function bootAppearance(): void {
  try {
    const raw = localStorage.getItem('lexicon-settings')
    const parsed = raw ? (JSON.parse(raw) as { state?: Record<string, unknown> }) : {}
    const state = parsed.state ?? {}
    const appearance = migrateAppearance(state.appearance, state.darkMode)
    applyDocumentAppearance(resolveDark(appearance))
  } catch {
    /* 首次安装 / storage 不可用：交给 App 自己的外观初始化 */
  }
}

bootAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
