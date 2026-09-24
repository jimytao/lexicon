# 10 — 浏览器扩展（MV3）设计文档

> **状态：P-1 / P0 / P1 / P2 / P3 / P4 全部完成（§8）；等待人工加载 Chromium 做最终真机验收与商店提交。**
> 词库已上传到 GitHub Preview Release tag dictionaries（2026-09-19）；扩展冷启动下载、SHA-256 校验、OPFS 缓存与真实查词均已验证。
> 本文件是扩展形态的权威设计来源。
> 开始实现后，每阶段完成需回填「实现状态」并同步 `AGENT.md` 与 `06-crossplatform.md`。
>
> 前置阅读：`01-architecture.md`（分层）、`03-database.md`（存储层抽象）、`06-crossplatform.md`（既有包装层策略）。

---

## 0. 决策摘要（已定，勿反复讨论）

| 议题 | 决策 | 理由 |
|------|------|------|
| 词库分发 | **方案 A：CRX 只装代码，首启从远程下载 `.db` 到 OPFS** | 70MB 打包不可行（审核慢、发版全量、体验差） |
| 无 key 直抓搜索引擎（Bing/Google 图片） | **暂不做** | 违反 ToS、结构易碎、有风控与审核风险。等 P2 完成后按正规 API 成图率再评估 |
| sql.js 运行位置 | **Side Panel 页面上下文，绝不放 Service Worker** | MV3 SW 空闲即终止、无 DOM、无 localStorage |
| Service Worker 职责 | **纯字节代理 + 消息桥接，不含业务逻辑** | 见 §2「SW 无状态原则」 |
| 主 UI | **复用 `App.tsx`，不 fork 一套 UI** | 侧栏 ~400px 宽 ≈ 已有移动端布局 |

---

## 1. 为什么这个项目适合做扩展

既有跨平台策略是「Web 是唯一代码基础，各端只是包装层」（见 `06`）。平台差异被收敛到两个点：

- `src/services/platform.ts` — `isTauri()` / `isCapacitor()` / `isWeb()`
- `src/services/db.ts` — 动态 import 分流到 `db.web.ts` / `db.native.ts`，共享 `db.ops.ts`

扩展只需在这两处各加一个分支，加上一个新的网络代理分支（§4）。**上层组件、store、prompt 全部零改动。**

### 扩展形态额外解决的既有问题

不只是「多一个端」，扩展能解掉 Web 版目前解不掉的三件事：

1. **联网搜索在 Web 版完全不可用** — Brave **与 Tavily** 都不返回 `Access-Control-Allow-Origin`，浏览器拦截，文本与图片搜索全废（**已 P-1 实测确认，见 §5.0**）。目前只有 Tauri 靠 Rust 侧 fetch 绕过（`ai.ts` 的 `searchFetch`），Capacitor 靠原生 HTTP patch。
2. ~~部分图片 URL 因防盗链加载失败~~ — **此项已撤回**：实测未能证明防盗链影响本项目（详见 §5.0 第 2 条）。仅保留一个耗尽后的代理兜底。
3. **用户自填 AI endpoint 遇 CORS 即挂** — 自建 / 中转端点常无 CORS 头。

三者在扩展里都能根治，见 §5。其中 ① 是主要收益（Web 侧 0% → ~100%）。

---

## 2. 形态与职责划分

```
┌─ Side Panel（主战场，真实页面上下文）────────────────┐
│  原样运行 App.tsx：Dict / Image / Settings 三 Tab    │
│  • sql.js WASM 词库（从 OPFS 读）                    │
│  • 全部 Zustand store + persist（localStorage）      │
│  • 所有 AI / prompt / 业务逻辑                       │
└──────────────────────────────────────────────────────┘
        │ chrome.runtime.sendMessage（请求描述符）
        ▼
┌─ Background Service Worker（无状态网络层）───────────┐
│  • proxyFetch：搜索 API / AI endpoint / 图片字节     │
│  • contextMenus + commands 事件转发                  │
│  • chrome.storage.local 设置广播给 content script    │
│  ✗ 不放 sql.js  ✗ 不读 localStorage  ✗ 不含 prompt   │
└──────────────────────────────────────────────────────┘
        ▲ sendMessage
        │
┌─ Content Script（扩展独有交互）──────────────────────┐
│  • 选中文字 → Shadow DOM 悬浮按钮（只是开关，不显结果）│
│  • 词经 storage.session 交给侧栏，结果一律侧栏渲染    │
│  • 机会主义 sidePanel.open()，失败也不丢词            │
│  ✗ 不抓页面正文喂 AI（隐私分量不同，见 §9）           │
└──────────────────────────────────────────────────────┘

┌─ Offscreen Document（可选，P3+）─────────────────────┐
│  仅当需要后台跑长任务（如图片模式）时才引入            │
└──────────────────────────────────────────────────────┘
```

### 关键约束（搞错必返工）

- **MV3 SW 约 30 秒空闲即终止**，且无 DOM、无 `localStorage`、无 `window`。
- `ai.ts` 的 `getConfig()` **同步读 `localStorage.getItem('lexicon-settings')`**。因此 SW **不能**调用 `getConfig()`，也不能自行组装带 key 的请求。
  → **推论：SW 只接收「已组装好的请求描述符」**（url / method / headers / body），由 Side Panel 侧组装。SW 是哑代理。
- Content script 与扩展页 **不同 origin**，不共享 localStorage。content script 的设置读取必须走 `chrome.storage.local`（由 Side Panel 写入并在变更时广播）。

---

## 3. 词库方案（方案 A：远程下载 + OPFS）

### 现状

`db.web.ts` 里：

```ts
const DB_ENZH_URL = '/assets/databases/lexicon.db'      // 32MB
const DB_ENEN_URL = '/assets/databases/lexicon_en.db'   // 40MB
```

`fetch(url).arrayBuffer()` → `new SQL.Database(bytes)`。整库常驻内存。

### 扩展方案

新增 `src/services/db.extension.ts`，**复用 `db.ops.ts` 全部查询逻辑**，只替换「字节从哪来」这一层：

```
需要词库
  → 查 OPFS（navigator.storage.getDirectory()）
      命中   → 读 bytes → new SQL.Database(bytes)
      未命中 → 从远程下载（带进度）→ 写入 OPFS → 同上
```

- **用 OPFS 而非 chrome.storage / IndexedDB**：`chrome.storage.local` 有配额且不适合大二进制；OPFS 在扩展页可用、持久、无配额焦虑，且能流式写入。
- **按需下载**：只在用户实际切到该词典时才下英英库（40MB）。默认只下双语库。
- **`db.web.ts` 需要一处小改动**（原计划写的「保持不动」在实现时被推翻）：把词库字节来源抽成
  可注入的 `setDbBytesSource`。原因是 `db.web.ts` 里有约 300 行 epoch / gate 失效逻辑，
  复制一份必然漂移；只替换字节来源则 `db.extension.ts` 缩到约 200 行且自动跟随后续修复。
- `db.ts` 的 `loadImpl()` 增加分支，顺序为 `isCapacitor()` → `isExtension()` → `db.web`。

### 词库托管

- 载体：GitHub Release 附件（与 iOS IPA 同一套分发习惯，见 `06`）。
- 必须带 **版本号 + 完整性校验**（文件名含版本 + SHA-256），否则无法安全地增量更新词库。
- OPFS 中记录已装词库版本；远程 manifest 版本更高时提示用户更新（**不静默重下 40MB**）。

### 需要新增的 UI

- 首启下载进度页（可取消、可重试、断网提示）。
- 设置页内「词库管理」：已装词典 / 版本 / 大小 / 重新下载 / 删除释放空间。

> **这是整个扩展项目唯一真正的新增架构工作**，其余多为分支适配。

---

## 4. 网络代理层（SW proxyFetch）

### 消息协议

```ts
// Side Panel / Content Script → SW
type ProxyRequest = {
  kind: 'proxyFetch'
  requestId: string
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  // 'text' 用于 API JSON；'dataUrl' 用于图片字节
  responseAs: 'text' | 'dataUrl'
}

type ProxyResponse =
  | { ok: true; status: number; body: string }
  | { ok: false; error: string }
```

**设计要点**

- 请求描述符由调用方组装（含 API key），SW 不碰配置。见 §2「SW 无状态原则」。
- `AbortSignal` **无法跨 message 传递**。而现有代码大量依赖 `AbortController` 做切词取消。对策：调用方生成 `requestId`，取消时另发 `{ kind: 'abort', requestId }`，SW 侧持有 `AbortController` 映射表。
  **这一条必须实现**，否则切词时旧请求不取消，会破坏现有的 generation 作废语义。
- SW 会被终止 → 长请求需超时兜底（现有代码已有 timeout → 可展示 error 的映射，复用即可，勿变成静默 Abort 卡 loading）。

### `ai.ts` 侧改动（很小，与既有 Tauri 分支同构）

现有：

```ts
async function searchFetch(url, init) {
  if (!isTauri()) return fetch(url, init)
  // ... 动态 import @tauri-apps/plugin-http
}
```

改为在 `isTauri()` 之前先判 `isExtension()`，走 `proxyFetch`。同一函数内加分支，**签名不变**，其余调用点（`braveTextSearch` / `tavilyTextSearch` / `braveImageSearch` / `tavilyImageSearch`）全部无改动。

主 AI 调用（`fetch(config.endpoint + '/chat/completions')`，`ai.ts` 内多处）目前是**裸 `fetch`**。需抽出统一的 `aiFetch()` 再替换，扩展才能受益于 CORS 豁免。

**已确认：`ai.ts` 全程无 stream / SSE**（无 `getReader` / `text/event-stream`；`ai.ts:2148` 注释亦明确 "being non-streaming"）。所有 AI 响应都是整包 JSON
→ **message 通道足够，无需长连接分片**。此结论若因将来引入流式渲染而失效，本节需重写。

---

## 5. 绕过图片限制的具体机制

### 5.0 P-1 实测结论（2026-09-09，已验证）

**结论：P-1 通过，但根因与最初假设完全不同。**

原假设是「防盗链（hotlink / Referer）导致图片加载失败」。实测证伪了这一点，真正的根因是**搜索 API 调用本身在浏览器里就被 CORS 拦死**——而且 **Tavily 和 Brave 都是**（原先只以为 Brave 有此问题）。

| 实验 | 条件 | 结果 |
|---|---|---|
| 搜索 API 直连 | `localhost` 页面 `fetch` Brave images API | ❌ 被拦：`No 'Access-Control-Allow-Origin' header`（preflight 失败） |
| 搜索 API 直连 | `localhost` 页面 `fetch` Tavily search API | ❌ 被拦：同上（`Content-Type` 改 `text/plain` 降级为简单请求仍被拦） |
| 搜索 API 经 SW | 扩展 SW `fetch`，声明 `host_permissions` | ✅ 两家都正常返回候选（Brave 单次返回 10 个候选） |
| 图片 `<img>` 基线 | `localhost`，**无** COEP（= dist / Tauri / Capacitor） | 5/6 通过（83%） |
| 图片 `<img>` 基线 | `localhost`，**COEP credentialless**（= `npm run dev`） | 5/6 通过（83%），**与上一行逐条相同** |
| 唯一失败的那个 URL（gettyimages） | 后续复查：服务端直取（无 Referer） | **HTTP 400** —— 见下方更正 |

**由此确立三点**：

1. **Web 版的图片成图率实际是 0%**，因为流程在第一步（调搜索 API）就挂了，`searchWebImage` 的 `catch` 静默返回 `[]`。这与「看不到实际图片」的现象吻合。
   → 扩展带来的不是边际提升，而是 **0% → ~100%**。这是本项目图片收益的**全部来源**。
2. **防盗链在本项目里从未被证明是真问题**（**2026-09-09 更正，比原结论更弱**）：
   Tavily 返回的发布方原始 URL 有 83% 在普通网页里就能直接加载（dreamstime / shutterstock / alamy / tenor 均正常）。
   唯一失败的 gettyimages URL 后来复查发现——**服务端不带 Referer 直取同样返回 HTTP 400**，
   即它是**签名过期的失效 URL**，不是防盗链（防盗链应为 403 且无 Referer 时可取）。
   → 因此「扩展修复了 17% 的防盗链图片」这个说法**没有证据支撑，已撤回**。
   目前**没有任何实测数据表明防盗链影响本项目**。
   → 策略 (a) dataURL 保留为**耗尽后的廉价兜底**（机制已验证可用，见 §8 P2），
   但它解决的是一个尚未被观测到的问题；(b) DNR **已决定不做**，理由见下。
3. **COEP `credentialless` 不是因素**：有无 COEP 的两组结果逐条相同。`vite.config.ts` 里那段 COEP 注释的顾虑不成立，无需改动。

**方法论教训（重要）**：spike 第一版把「扩展页面里直接 `<img>`」标注为「今天 Web 版的水平」，这是错的——扩展页面本身已无 Referer、无 COEP，**它就是实验组，不是对照组**，导致第一次跑出「基线 100%、策略挽救 0」的假阴性结论。真实对照必须在 `localhost` 上、带项目实际响应头复现。后续任何 spike 都需先确认对照组条件与产品条件一致。

**顺带发现的产品缺陷 —— 已决定不修（WON'T FIX）**：Web 版的联网搜索（文本 + 图片）**从来没有工作过**，两个 provider 都被 CORS 拦。`ai.ts` 中「Tauri 走 Rust 插件绕 CORS，so Brave works」的注释暗示只有 Brave 有问题，实际 Tavily 同样不可用。Capacitor 侧 `fetch` 已被 patch 到原生 HTTP 故不受影响，Tauri 有 Rust 插件亦不受影响——只有 Web 端全废。

> **用户决策（2026-09-09）：Web 端联网搜索不修。** Web 仅作开发基准，联网搜索能力由扩展 / Tauri / Capacitor 承载。
> **后续 Agent 不要主动去修这个**（不要加 Web 代理、不要改 provider）。如需改动，必须先与用户确认。

---

三层限制，逐层对策：

### ① API 请求被 CORS 挡住（**实测：两家 provider 全废，这是主因**）

MV3 SW 中的 `fetch`，在 manifest 声明 `host_permissions` 后**不受 CORS 约束**（扩展是特权 origin，不发 `Origin`、不做预检）。
→ Brave + Tavily 的文本与图片搜索在扩展中直接可用，与 Tauri 等价。**零额外技巧，声明权限即可。**（已由 P-1 实测确认，两家均返回候选。）

`host_permissions` 需含：`https://api.search.brave.com/*`、`https://api.tavily.com/*`、以及 `<all_urls>`（图片域名不可枚举）。

### ② 图片 URL 拿到但 `<img>` 加载失败（**实测：次要，约 17%**）

`tavilyImageSearch` 返回发布方原始 URL（代码注释已标明 hotlink-protected）。浏览器发出的 `Referer` 是扩展 / 页面 → 403。
实测该情况占比约 1/6（仅 gettyimages），远低于最初假设。以下两条对策按**保险**而非主要收益来排期。

**两条对策，建议都做（互补）：**

**(a) SW 代理取图 → dataURL**

```
searchWebImage 在扩展下：
  拿到候选 URL 列表（同现有逻辑）
  → 逐个走 proxyFetch(responseAs: 'dataUrl')
  → 成功则把 dataURL 交给 UI 当 <img src>
  → 失败则试下一个
```

`MeaningList.tsx` 现有的「候选数组 + `onError` 跳下一个 + `imgExhausted` 空态」结构**完全不动**，只是数组里装的从 http URL 变成 dataURL。这是这一步成本低的关键原因。
同时顺带解掉 COEP / CORP 问题（dataURL 同源）。

**(b) `declarativeNetRequest` 剥离 / 改写 Referer —— 已决定不做（WON'T DO）**

原计划用 DNR 规则对图片请求 `modifyHeaders` 移除 `Referer`。**放弃，理由是风险不对称：**

DNR 规则作用于**浏览器发出的所有匹配请求**，不只是扩展自己的。一条
`{ urlFilter: '*', resourceTypes: ['image'] }` 的规则会剥掉用户浏览的**每个网站每张图片**的
Referer —— 可能破坏依赖 Referer 的正常站点、改变用户的网络行为、并在商店审核时极难解释。
而收益按上文更正后已归零（防盗链未被证明是真问题）。

→ 用 (a) 的 SW 代理取图代替：它**精确限定在本应用自己的请求**上，不外溢。
如果将来真的观测到防盗链，也应继续走 (a)，而不是 DNR。

### ③ 额度 / 必须自带 API key

不是技术限制而是商业模型。技术上 SW 可直抓搜索引擎 HTML / 内部接口（无 CORS 阻碍、可带用户已登录 cookie、零 key 零额度），但违反 ToS、结构易碎、有风控与商店审核风险。
→ **本期不做**（§0 决策）。若未来做，须作为标注「实验性 / 自负风险」的独立 provider，默认关闭，且不随商店版本分发。

### 风险前置：spike 已完成

✅ **已于 2026-09-09 完成，结论见 §5.0：P-1 通过，可推进 P0/P1。**
（spike 代码为一次性实验，未入仓库。若需重跑，按 §5.0 的实验矩阵重建，**注意对照组必须在 `localhost` 上带项目实际响应头**。）

---

## 6. 其他平台适配点

| 项 | 问题 | 对策 |
|---|---|---|
| `platform.ts` | 无扩展判定 | 新增 `isExtension()`（检测 `chrome.runtime?.id`）。**同时修正 `isWeb()`** —— 现为 `!isTauri() && !isCapacitor()`，扩展会被误判为 Web |
| `updateStore.ts:3` | **静态** `import { check } from '@tauri-apps/plugin-updater'` | 会被打进扩展包。改为动态 import（与 `db.ts` 同模式），或在扩展构建中 alias 成空实现。扩展应完全禁用自更新（商店负责） |
| Capacitor 依赖 | `camera` / `filesystem` 是动态 import，但 **`App.tsx:17-18` 静态 import 了 `@capacitor/keyboard` 与 `@capacitor/device`** | 会连 Capacitor core 一起打进扩展包。调用点已由 `isCapacitor` 守卫，功能上无害（web 实现是 no-op），但体积浪费。与 `updateStore.ts:3` 同类问题，一并在 P4 处理 |
| SharedArrayBuffer / COEP | `vite.config.ts` 的注释称 sql.js 需要 SAB，但 Tesseract 已不再使用，而标准 sql.js 构建是单线程、**不需要 SAB** | **P0 刻意不声明 COEP**：`require-corp` 会反过来拦掉跨源图片、毁掉 §5 的主要收益。若 P1 实测 sql.js 报 SAB 相关错误，再加 `cross_origin_embedder_policy: credentialless`（**不要用 require-corp**） |
| Google Fonts | `index.html` 外链三个装饰中文字体 | **实测：`src/` 内零引用，是死链接**。扩展构建直接不引入即可，无需打包字体 |
| CSP | 任何远程 script / style 被拒；禁 `unsafe-eval` | 全部本地化；确认 sql.js WASM 加载与 Tailwind v4 产物均无 eval |
| Tesseract.js | `package.json` 有依赖，但 `src/` 内**已无任何引用**（stale dependency） | 扩展无需处理。可另开任务清理 |
| 相机 / 图片模式 | `navigator.mediaDevices` | 扩展页需 manifest 权限；侧栏内取图体验待评估，Image Tab 倾向 P3 之后再上 |
| Zustand persist | 侧栏内 localStorage 正常，跨 origin 不共享 | 侧栏为唯一写入方；content script 需要的子集镜像到 `chrome.storage.local` |

---

## 7. 构建

### 开发依赖：专用 skill

P0 开始前装 Anthropic 的 **Chrome Extensions and Chrome Web Store** skill（MV3 API + 商店上架规范）。
**按需启用**：只在动扩展代码的会话里打开，平时不常驻。同见 `AGENT.md` 的同名小节。

### 产物结构

```
vite.config.extension.ts        # 新增，与 vite.config.ts 并存
  入口：
    sidepanel.html  → src/entries/sidepanel.tsx（薄壳，渲染 App）
    background.ts   → src/extension/background.ts
    content.ts      → src/extension/content.ts
  产物：dist-ext/
```

- `manifest.json` 放 `public-ext/` 或由脚本生成（版本号从 `package.json` 注入，与 `workflow.md` 的版本单一来源一致）。
- content script 必须打成 **IIFE 单文件**（不能用 ESM code-splitting）。
- `npm run build:ext` / `npm run pack:ext` 加进 `package.json`。

---

## 8. 实施阶段

每阶段可独立验证，**不要跨阶段并行**。

### P-1 — 图片可行性 spike ✅ 已完成（2026-09-09）
- [x] 最小 manifest + SW，实测两家 provider 的 API 可达性与图片成图率
- [x] 补测 `localhost` 真实对照组（无 COEP / COEP credentialless）
- [x] **验收通过**：扩展将 Web 侧图片成图率从 0% 提升至 ~100%。完整数据与修正后的根因见 §5.0

### P0 — 构建与骨架 ✅ 已完成（2026-09-09）
- [x] `vite.config.extension.ts` 多入口 → `dist-ext/`（`npm run build:ext`，产物约 800KB）
- [x] `manifest.json` 构建期生成，版本号从 `package.json` 注入
- [x] `platform.ts` 加 `isExtension()`（判据 `chrome.runtime.id`），修正 `isWeb()`
- [x] `sidepanel.html` + `src/entries/sidepanel.tsx`；`src/extension/background.ts`（仅 `setPanelBehavior`）
- [x] 去掉 Google Fonts 外链（实测是死链接，无需打包字体）
- [x] 深色模式启动门从内联 `<script>` 搬进入口模块（MV3 CSP 禁内联）
- [x] **验收通过**：400px 宽下搜索栏 / 三模式切换 / 空态小书引导 / 底栏 3 Tab 均正常，无 CSP 报错

**P0 落地时的三个决定（与原计划的偏差，已生效）**

1. **权限最小化**：manifest 只声明 `sidePanel` + `storage`。原计划在 P0 就把 `host_permissions` / `declarativeNetRequest` / `contextMenus` 全声明了，但那会让 Chrome 弹出更吓人的授权提示且对 P0 验收无帮助。改为按阶段追加：P2 加 `host_permissions` + `declarativeNetRequest`，P3 加 `contextMenus` / `commands`。
2. **`publicDir: false`**：默认 `public/` 含 70MB 词库，绝不能拷进扩展包。
   ⚠️ **副作用（P1 必须处理）**：`public/sql-wasm/` 也不再被拷贝，所以目前 sql.js 的 wasm 会 404、词库查询不可用（P0 验收只要求空态渲染）。P1 做 OPFS 时需一并为 wasm 安排产物路径。
3. **不声明 COEP**：见 §6 对应行。实测侧栏渲染正常，暂不需要。

**已知遗留（P4 处理，不影响 P0 验收）**：构建告警确认 Tauri API 与 Capacitor core 仍被打进产物；运行时 `@capacitor/keyboard` 报 `UNIMPLEMENTED` 并回落到 focus 事件——功能无害，符合 §6 的判断。

### P1 — 存储层（最重）
**P1a 数据通路 ✅ 已完成（2026-09-09）**
- [x] `db.web.ts` 的词库字节来源抽成可注入（`setDbBytesSource` / `DbBytesSource`）
- [x] `db.extension.ts`：OPFS 缓存 + 按需下载（流式进度）+ SHA-256 校验 + 旧版本清理
- [x] `db.ts` 分流加 `isExtension()` 分支
- [x] `scripts/gen-dictionary-manifest.mjs` —— 机器计算哈希生成清单
- [x] sql-wasm 随扩展产物发布（补上 P0 的遗留），路径仍为 `/sql-wasm/*`，`locateFile` 无需改
- [x] 既有 243 个测试全通过（重构未破坏 Web / Capacitor 路径）

**P1b 用户可见部分 ✅ 已完成（2026-09-09）**
- [x] `DictionaryStatus` 组件：首启下载进度（阶段文案 + 细进度条 + 字节/百分比 + 失败重试）
- [x] 接入 App 空态 —— **接管**那两行提示文案而非新增卡片（守住 §2.2 空态纯净规则）
- [x] `DictionaryStorageRow`：设置 → 本地数据 → 词库存储（版本 / 大小 / 删除释放空间）
- [x] `db.web.ts` 导出 `invalidateDictionaries()`；删除词库时必须调用
- [x] i18n zh + en 各 13 个键
- [x] 验收：见下表

**P1b 实测**（用 harness 翻转 `chrome.runtime.id` 让扩展路径生效，跑的是未修改的构建产物；stub 限速至 ~2MB/s 才能观察进度）

| 项 | 结果 |
|---|---|
| 下载进度 UI | ✅ 「Downloading dictionary / 14.3 MB / 31.4 MB · 45% / One-time download…」，书本图标保留、无卡片 |
| 下载完成后交还空态 | ✅ 恢复为原提示文案 |
| 真实查词（OPFS → sql.js） | ✅ 联想返回 bank / banker / banking / bankable / bankrupt… 带中文释义 |
| 设置页词库存储行 | ✅ 显示「EN-ZH oald9-1 · 31.4 MB」 |
| 删除 | ✅ OPFS 清空，行文案变「No dictionary downloaded yet」 |
| **删除后内存实例是否作废** | ✅ 再次查词触发**重新下载**（下载计数 1→2，耗时 16.4s 全程），而非拿内存旧库糊弄 |
| 非扩展平台（Web 构建） | ✅ 无词库管理行、无重复分隔线、无 console 错误；`db.web` 默认 http 来源查词正常（bank / 17 义项） |
| 单元测试 | ✅ 243/243 通过 |

> **两个容易踩的坑**
> 1. **只删 OPFS 文件是不够的**：`sql.js` 的 `Database` 仍在内存里，删完照样能查，用户会以为没生效。必须同时 `invalidateDictionaries()`。
> 2. **条件渲染的行要自带分隔线**：`DictionaryStorageRow` 在非扩展平台返回 `null`，若分隔线留在 `SettingsView` 里就会出现两条相邻 `RowDivider`。分隔线跟着组件一起消失才对。

**关键实现决定：不重复实现查询与并发逻辑。** `db.web.ts` 里有整套 epoch / gate 失效逻辑（约 300 行），复制一份必然漂移。改为把「字节从哪来」抽成一个可注入函数，`db.extension.ts` 只提供 OPFS/远程实现，再转发 `db.web` 的 `webDB` / `warmupDictionary`。`db.extension.ts` 因此只有约 200 行。

**P1a 实测结果**（用本地 stub 顶替尚未上传的 GitHub Release）

| 路径 | 结果 |
|---|---|
| 首次加载：清单 → 下载 32MB → 校验 → 写 OPFS → 查询 | ✅ 349ms，`run` 返回 117 条义项 |
| 二次加载：OPFS 命中 | ✅ 70ms，`lexicon.db` 网络请求数为 0 |
| 清单缺 `enen` | ✅ 返回 `null`，走 `db.web` 既有降级到双语库，不抛错 |
| SHA-256 不匹配 | ✅ 抛出可读错误，且**未**写入 OPFS |
| 旧版本清理 | ✅ 删除同词库旧版本，保留其他词库与无关文件 |

> **踩过的坑（勿重犯）**：`FileSystemDirectoryHandle` 的**默认**异步迭代器产出 `[name, handle]` 条目（类似 Map），不是字符串。误用默认迭代器会让 `name.startsWith` 抛 TypeError；当时又被一个空 `catch {}` 吞掉，导致清理逻辑形同没做且毫无痕迹。**必须用 `keys()`**，且清理失败要 `console.warn` 留声。

### 词库上传流程（GitHub Release）

清单 URL 在 `db.extension.ts` 里硬编码为一个**专用且可覆盖上传**的 tag，而非 `releases/latest`——后者指向 App 发版，会迫使每次发版都重挂 70MB 附件：

```
https://github.com/jimytao/lexicon/releases/download/dictionaries/manifest.json
```

清单内部用绝对 URL 指向资产，所以 `.db` 可以放在任意 tag 上。操作：

```bash
node scripts/gen-dictionary-manifest.mjs   # → dist-dictionaries/manifest.json
```

然后在 GitHub 建（或编辑）tag 为 `dictionaries` 的 Release，挂上三个附件：
`manifest.json`、`lexicon.db`、`lexicon_en.db`。

词库内容变更时：改 `scripts/gen-dictionary-manifest.mjs` 里对应的 `version`、重跑、重新上传。客户端 OPFS 文件名带版本号，会自动下载新版并清掉旧版。
`dist-ext/` 与 `dist-dictionaries/` 已加入 `.gitignore`。

### P2 — 网络代理层 ✅ 已完成（2026-09-09）
- [x] SW `proxyFetch`（`background.ts`）+ 页面端 `extensionProxy.ts`
- [x] `requestId` + 独立 abort 消息复现取消语义
- [x] `searchFetch` 加 extension 分支 → **Brave + Tavily 从此可用**
- [x] 抽出 `aiFetch()` 替换 `ai.ts` 里 5 处裸 `fetch`
- [x] manifest 加 `host_permissions`
- [x] 图片兜底：候选全部失败后由 SW 取字节转 dataURL（`MeaningList`，effect 驱动）
- [x] `declarativeNetRequest` —— **决定不做**，理由见 §5② (b)
- [x] `extensionProxy.test.ts`：18 个用例，重点覆盖 abort 语义

**P2 实测**（harness：翻转 `chrome.runtime.id` + 假 SW 转发到服务端 fetch；产品代码零改动）

| 项 | 结果 |
|---|---|
| 同一 Tavily 请求：页面直连 vs 经代理 | ✅ 直连 `BLOCKED (CORS)`；经代理 `HTTP 401` + Tavily 真实错误体 |
| `aiFetch` 是否真走代理 | ✅ 一次 AI Lookup 产生 3 次 `/__proxy`，页面对 AI 端点**直连数 0** |
| `searchFetch` 是否真走代理 | ✅ 同上，对 `api.tavily.com` **直连数 0** |
| 图片正常显示 | ✅ 候选直连成功即渲染（800×800），不经代理——不给正常路径加开销 |
| 图片兜底（用带 Referer 返 403 的模拟防盗链端点） | ✅ 直连 403 → 候选耗尽 → 代理取字节 → dataURL 渲染；服务端日志确认「带 Referer 拒绝 / 无 Referer 放行」 |
| 非扩展平台 | ✅ 261 个测试通过；Web 与扩展两个构建均无错误 |

> **未能在此环境验证的部分**：真 SW 的 `fetch` 豁免 CORS 是平台保证，普通页面无法复现，
> 所以 harness 用服务端 fetch 等价替代。真实扩展里的最终确认需要你加载未打包扩展
> 并填入自己的 API key（加载动作需要点系统文件选择框，Agent 无法代做）。

> **abort 语义为什么值得 18 个用例**：`AbortSignal` 传不过 message 边界，而现有代码
> 大量依赖切词时 abort 旧请求。这条坏掉的表现是「切词后旧结果覆盖新结果」，
> 属于极难排查的那类 bug，所以用测试锁住而不是靠手测。

### P3 — 扩展独有交互 ✅ 已完成（2026-09-09）

**产品决策变更：不做「页内气泡显示结果」，改为「悬浮按钮把词送进侧栏」。**

用户决策（2026-09-09）。理由：
1. AI 结果信息量大（四条渲染路径 + 模组拖拽 + Chat 追问），气泡要么砍成残废版，
   要么维护第二套结果 UI —— 违背 §0「复用 App.tsx，不 fork」。
2. 气泡浮在宿主页上，要跟别人的 CSS / z-index / 滚动容器搏斗；侧栏是我们自己的 origin。
3. 侧栏 ~400px 正好是既有移动端布局，零适配。

→ 按钮**只是一个开关**，不显示任何结果。

- [x] `pendingQuery` 通道（`chrome.storage.session`）+ `App.tsx` 订阅
- [x] 右键菜单「Lexicon: "%s"」+ `lookup-selection` 快捷键（默认 Alt+L）
- [x] Content script 悬浮按钮（Shadow DOM 隔离）
- [x] 设置镜像 `extensionMirror.ts` → `chrome.storage.local`（开关 + 深浅色）
- [x] 设置页开关「网页选词按钮」+ i18n zh/en
- [x] `manifest` 加 `contextMenus` / `content_scripts` / `commands`
- [x] `vite.config.content.ts` —— content script 必须单文件 IIFE，Rollup 一次构建
      只能出一种 format，所以拆成第二次构建（`build:ext` 串联两次）
- [ ] 页面正文注入为 AI 上下文 —— **刻意不做**，见 §9

**关键设计：不依赖程序化打开侧栏**

`chrome.sidePanel.open()` 要求用户手势，但手势穿过 `sendMessage` 到 SW 时可能被消耗，
右键菜单点击也不总被认作手势（[Chromium 355266358](https://issues.chromium.org/issues/355266358)、
[415694848](https://issues.chromium.org/issues/415694848)）。
因此把「捕获词」与「打开侧栏」解耦：**先写 `storage.session`，再机会主义尝试 `open()`**。
`open()` 失败也不丢词 —— 用户下次打开侧栏时 `takePendingQuery()` 会补查。

**复用而非新写**：`pendingQuery` 最终调用 `App.tsx` 的 `handleWordSelect` ——
那就是「按 Enter / 点联想词」的同一个入口，所以中文反查、词组/句子分流、缓存分轨、
历史双轨、Profile 事件全部自动继承，P3 没有新增任何查词逻辑。

**P3 实测**（harness 模拟宿主页：注入 chrome 桩 + 加载真实构建的 `content.js`）

| 项 | 结果 |
|---|---|
| 悬浮按钮定位 | ✅ 跟随用户松开的 focus 端：同行/跨行正向选择停靠末行右下，同行/跨行反向选择停靠首行左上；对应方向越出视口时翻到端点另一侧 |
| Shadow DOM 双向隔离 | ✅ 宿主页 `button{background:red!important;border:6px dashed}` 与 `*{box-sizing:content-box!important}` 均未渗入（我们仍是 `border-box`、白底 1px）；宿主自己的按钮也未被我们改变 |
| 选区保护 | ✅ `mousedown` 被 `preventDefault`，点击后选区仍在（否则拿不到文字） |
| 点击 → 消息 | ✅ 发出 `{kind:'lookupSelection', text:'bank'}`，按钮随即收起 |
| 侧栏已开：实时到达 | ✅ 搜索框填入 `bank`，结果含词库 L1 + AI 板块；pendingQuery 被清除 |
| 侧栏冷启动：预置词 | ✅ 挂载即查 `river`，pendingQuery 被清除（这就是 `open()` 被拒时的路径） |
| 开关镜像 | ✅ 设置页切换 → `chrome.storage.local` 双向同步；关闭后立即隐藏且新选区不再出现 |
| 深浅色镜像 | ✅ `isDark` → 按钮底色 `#0A0A0A`（我们的 dark token，**不跟宿主页**） |
| 非扩展平台 | ✅ Web 构建：两个扩展专属设置行都不出现、无重复分隔线、无注入、无 console 错误 |
| 回归 | ✅ 261 测试通过；Web 与扩展构建均无错误 |

> **实现期修正的三处**
> 1. **滚动不再隐藏按钮，改为重新定位**。原先 `scroll`/`resize` 直接 `hide()`，
>    但触控板选完词常有惯性滚动，按钮会在用户点到之前消失。现在只在
>    「选区消失 / 点了别处 / 按 Esc」时收起。
> 2. **Shadow root 用 `open` 而非 `closed`**。`closed` 买到的隔离很有限
>    （恶意页面本来就能直接移除宿主元素），却让线上问题完全无法诊断。
>    样式隔离靠 Shadow DOM 本身，与 mode 无关。
> 3. **视口尺寸为 0 时跳过边界收敛**。隐藏标签页会让 `innerWidth/innerHeight` 报 0，
>    原先的收敛式会算出负值再被夹到左上角，看起来像「按钮跑到角落」。
> 4. **方向按 `Selection.anchor/focus` 的 DOM 顺序判断**。`Range.start/end` 与
>    `getClientRects()` 都会规范化为文档顺序，不能代表用户拖选方向；仅比较 Y 坐标也无法
>    识别同行从右往左。方向、focus 端 rect 与双向视口翻边由 `selectionGeometry.ts` 的纯函数
>    统一计算，并用同行/跨节点、正向/反向及边界用例锁定。

### P4 — 打磨与分发 ✅ 已完成（2026-09-18）
- [x] Tauri / Capacitor API 动态加载，扩展构建用空实现裁剪原生依赖
- [x] 构建扫描确认无原生第三方运行时代码
- [x] 隐私与权限说明、扩展图标、ZIP 打包脚本
- [x] workflow.md 增扩展发版与本地加载验收 SOP
- [x] 跨平台文档同步

---

### P4 真实 Chromium 最终验收（2026-09-19）

- GitHub dictionaries Preview Release：manifest 与两本词库均为 HTTP 200，GitHub asset digest 与 manifest SHA-256 一致。
- 修复 MV3 CSP 缺少 wasm-unsafe-eval 导致 sql.js 无法编译 WASM。
- 全新 Chromium 配置实测：下载 32,878,592 字节双语库 → SHA-256 校验 → OPFS 写入 enzh-oald9-1.db → 输入 bank + Enter → 渲染 17 个义项、例句与相关词组；运行时错误 0。

## 9. 未决问题

- ~~**AI 调用是否用了 stream / SSE？**~~ → 已确认全程非流式，message 通道足够（见 §4）。
- **Image Tab 是否进扩展？** 侧栏内的图片模式交互价值待评估，倾向 P3 之后再定。
- **词库托管带宽**：GitHub Release 是否够用；用户量上来后是否需要 CDN。
- **Firefox 支持？** MV3 在 Firefox 上 `sidePanel`（对应 `sidebar_action`）与 `declarativeNetRequest` 行为有差异。当前设计**只面向 Chromium**。

### P3 期新增的已决 / 待议

- **选词后查到哪一层 —— 已定：完全等同用户手打一遍。**
  走既有 `defaultSearchMode`，**不加专用设置项**。用户明确要求「不要搞得更复杂」；
  且悬浮按钮必须点一下才触发，那一下就是确认，不存在误触发 AI 花钱的问题。
- **页面正文注入为 AI 上下文 —— 已定：不做（本批次）。**
  它会把用户浏览的页面内容发到第三方 AI 端点，隐私分量与查词完全不同。
  若将来要做，必须是独立的、默认关闭的明确 opt-in，不能混在选词功能里。
- **站点黑名单**：`content.ts` 已能消费 `lexicon:siteBlocklist`，但**还没有 UI**。
  P3c 再补（需要「当前站点禁用」入口，而侧栏拿不到当前 tab 的 hostname，
  得经 SW 查 `chrome.tabs`）。
- **网页选词是否该计入历史与 Profile 诊断？** 目前**计入**（因为复用了
  `handleWordSelect`）。边浏览边选词可能冲掉 100 条历史，也会推高
  Profile 诊断的 12 次累计、稀释学习画像。尚未观测到实际影响，先不动 ——
  但这是 P3c 要盯的第一件事。
- **iframe 内选词无按钮**：`all_frames: false`，只在主框架注入。
  iframe 里选词价值低而注入成本翻倍；若将来有需求再评估。
