/**
 * 悬浮查词按钮（content script，注入所有页面）。
 *
 * 交互：选中文字 → 选区末端浮出一个 Lexicon 图标 → 点击 → 词交给侧栏查询。
 * 按钮本身**只是开关**，不显示任何结果 —— 结果一律在侧栏渲染
 * （AI 结果信息量大，气泡装不下；也避免维护第二套结果 UI）。
 *
 * 三条硬约束：
 *   1. **Shadow DOM 隔离**：宿主页 CSS 不能影响我们，我们也不能污染宿主页。
 *   2. **样式在 shadow root 内手写**，不能用 Tailwind ——
 *      我们的 Tailwind 产物不在宿主页里。这是 09-ui-ux-design-system.md
 *      「只用 Tailwind utility」的**窄豁免**，取值仍照该文档的 token。
 *   3. **选中文字前不做任何事**，只挂一个 selectionchange 监听，
 *      避免为了一个按钮拖慢用户浏览的每个页面。
 *
 * 见 lexicon-docs/10-browser-extension.md §9（P3）。
 */

const HOST_ID = 'lexicon-selection-host'
const MAX_LEN = 300

/** 与 09 号文档的 token 对齐；深色值取自 src/index.css 的 .dark 段 */
const STYLE = `
  :host { all: initial; }
  .btn {
    position: fixed;
    z-index: 2147483647;
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--lx-border);
    background: var(--lx-bg);
    color: var(--lx-accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, .16);
    cursor: pointer;
    transition: transform .12s ease, box-shadow .12s ease;
    -webkit-font-smoothing: antialiased;
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 0, 0, .2); }
  .btn:active { transform: translateY(0); }
  .btn svg { width: 16px; height: 16px; display: block; }
`

const THEME_LIGHT = '--lx-bg:#FFFFFF;--lx-border:#E2E8F0;--lx-accent:#6366F1;'
const THEME_DARK = '--lx-bg:#0A0A0A;--lx-border:#1F1F1F;--lx-accent:#818CF8;'

/** 与 App.tsx 空态用的是同一个小书图标，保持品牌一致 */
const BOOK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
</svg>`

let host: HTMLDivElement | null = null
let button: HTMLButtonElement | null = null
let enabled = true
let isDark = false

function readSelection(): string {
  const raw = window.getSelection()?.toString() ?? ''
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_LEN ? collapsed.slice(0, MAX_LEN) : collapsed
}

function ensureMounted(): HTMLButtonElement {
  if (button) return button

  host = document.createElement('div')
  host.id = HOST_ID
  // 宿主容器自身不占位、不拦事件；只有按钮可点
  host.style.cssText = 'all:initial;position:static;'
  // open 而非 closed：closed 买到的隔离很有限（恶意页面本来就能直接移除宿主元素），
  // 但会让线上问题完全无法诊断。样式隔离靠 Shadow DOM 本身，与 mode 无关。
  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = STYLE
  root.appendChild(style)

  button = document.createElement('button')
  button.className = 'btn'
  button.type = 'button'
  button.innerHTML = BOOK_SVG
  button.setAttribute('aria-label', 'Lexicon')
  button.title = 'Lexicon'
  button.style.display = 'none'

  // mousedown 上 preventDefault：否则点击会先清掉选区，拿不到文字
  button.addEventListener('mousedown', (e) => e.preventDefault())
  button.addEventListener('click', onButtonClick)

  root.appendChild(button)
  document.documentElement.appendChild(host)
  return button
}

function applyTheme(): void {
  if (!button) return
  button.style.cssText += isDark ? THEME_DARK : THEME_LIGHT
}

function hide(): void {
  if (button) button.style.display = 'none'
}

function showAt(rect: DOMRect): void {
  const btn = ensureMounted()
  applyTheme()

  const GAP = 6
  const SIZE = 28
  // 优先贴选区右下；越界则翻到上方 / 收进视口
  let left = rect.right + GAP
  let top = rect.bottom + GAP

  // 视口尺寸可能报 0（隐藏标签页 / 未渲染的框架）。此时做边界收敛会算出负值
  // 并被夹到左上角，看起来像「按钮跑到角落」。宁可不收敛，直接贴选区。
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw > 0 && vh > 0) {
    if (left + SIZE > vw - 4) left = vw - SIZE - 4
    if (top + SIZE > vh - 4) top = Math.max(4, rect.top - SIZE - GAP)
    left = Math.max(4, left)
  }

  btn.style.left = `${left}px`
  btn.style.top = `${top}px`
  btn.style.display = 'flex'
}

function onButtonClick(): void {
  const text = readSelection()
  hide()
  if (!text) return
  chrome.runtime.sendMessage({ kind: 'lookupSelection', text }, () => {
    // 侧栏未开且 open() 手势被拒时 SW 仍写下了待查词，这里无需处理错误
    void chrome.runtime.lastError
  })
}

function onSelectionSettled(): void {
  if (!enabled) return hide()

  const selection = window.getSelection()
  const text = readSelection()
  if (!text || !selection || selection.rangeCount === 0) return hide()

  const rect = selection.getRangeAt(0).getBoundingClientRect()
  // 折叠选区 / 不可见元素会给出零尺寸矩形
  if (rect.width === 0 && rect.height === 0) return hide()

  showAt(rect)
}

/* ---------------- 事件绑定 ---------------- */

// 用 mouseup / keyup 而不是 selectionchange：后者在拖选过程中高频触发，
// 会让按钮跟着鼠标乱跳。这两个事件代表「选择动作结束」。
document.addEventListener('mouseup', () => window.setTimeout(onSelectionSettled, 0), true)
document.addEventListener('keyup', (e) => {
  if (e.shiftKey || e.key === 'Shift') window.setTimeout(onSelectionSettled, 0)
})

document.addEventListener('mousedown', (e) => {
  // 点在按钮以外的地方就收起（按钮在 closed shadow root 内，不会命中 host 判断之外）
  if (e.target !== host) hide()
}, true)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hide()
})

// 滚动 / 缩放时**重新定位**而不是隐藏。
// 隐藏看起来更省事，但触控板选完词常有惯性滚动，按钮会在用户点到之前就消失。
// 按钮只在「选区消失、点了别处、按 Esc」时收起 —— 那些才是用户真的不想要它了。
let repositionScheduled = false
function reposition(): void {
  if (repositionScheduled) return
  repositionScheduled = true
  requestAnimationFrame(() => {
    repositionScheduled = false
    if (button?.style.display === 'none') return
    onSelectionSettled()
  })
}

window.addEventListener('scroll', reposition, { passive: true, capture: true })
window.addEventListener('resize', reposition, { passive: true })

/** SW 在快捷键路径下向 content script 索取选区 */
chrome.runtime.onMessage.addListener((msg: { kind?: string }, _sender, sendResponse) => {
  if (msg?.kind !== 'getSelection') return false
  sendResponse({ text: readSelection() })
  return false
})

/* ---------------- 设置镜像 ---------------- */

// content script 与扩展页不同 origin，读不到侧栏的 localStorage，
// 所以开关与深浅色由侧栏镜像到 chrome.storage.local（见 §2）。
const MIRROR_KEYS = {
  enabled: 'lexicon:selectionButtonEnabled',
  dark: 'lexicon:isDark',
  blocklist: 'lexicon:siteBlocklist',
}

function applyBlocklist(list: unknown): void {
  if (!Array.isArray(list)) return
  const hostname = location.hostname
  if (list.some((entry) => typeof entry === 'string' && hostname.endsWith(entry))) {
    enabled = false
    hide()
  }
}

void chrome.storage.local
  .get([MIRROR_KEYS.enabled, MIRROR_KEYS.dark, MIRROR_KEYS.blocklist])
  .then((stored) => {
    // 默认开启：未镜像过（全新安装）时也要能用
    if (stored[MIRROR_KEYS.enabled] === false) enabled = false
    isDark = stored[MIRROR_KEYS.dark] === true
    applyBlocklist(stored[MIRROR_KEYS.blocklist])
  })
  .catch(() => undefined)

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (MIRROR_KEYS.enabled in changes) {
    enabled = changes[MIRROR_KEYS.enabled].newValue !== false
    if (!enabled) hide()
  }
  if (MIRROR_KEYS.dark in changes) {
    isDark = changes[MIRROR_KEYS.dark].newValue === true
    applyTheme()
  }
  if (MIRROR_KEYS.blocklist in changes) {
    enabled = true
    applyBlocklist(changes[MIRROR_KEYS.blocklist].newValue)
  }
})
