# CHANGELOG

## 2026-05-14 — v0.7.9 紧急修复与体验优化

### 概述
本次小版本更新主要解决因历史公钥配置错误导致的 Tauri 自动更新失败问题，并在设置页新增了 GitHub 仓库直连入口。

---

### 1. 修复自动更新校验失败
- **公钥恢复**：修复了 `tauri.conf.json` 中配置的签名公钥与私钥不匹配的致命错误。从 `v0.7.8` 升级至此版本（及未来版本）的跨平台自动更新流程将恢复正常。

### 2. UI 交互体验优化
- **GitHub 快捷入口**：在设置页底部（版本信息下方）新增了带有 GitHub 官方图标的直连按钮，方便用户快速访问源码仓库、反馈问题或手动下载最新安装包。

## 2026-05-14 — 修复安卓更新路径与版本比对健壮性 (Update Logic Fixes)

### 故障修复与稳健性
- **修复安卓安装路径不一致**：解决了由于文件名（包含 `v` 前缀 vs 不包含）解析不统一导致的 Android APK 下载后无法调起安装程序的 Regression Bug。
- **版本号比对健壮性增强**：在检测“已忽略版本”和“已弹窗版本”时增加了全量归一化处理，彻底杜绝了因 `v0.7.x` 与 `0.7.x` 字符串差异导致的重复弹窗或逻辑失效。
- **UI 细节与 URL 修正**：修复了 iOS 跳转链接可能出现的双 `v` 前缀错误，并优化了更新弹窗中的版本号显示。

## 2026-05-14 — 更新检测 UI 修复、主题适配与逻辑稳健性增强 (Update UI & Resilience)

### 核心优化
- **更新提示 UI 重构**：将底部 Toast 提示位置从 `5.5rem` 上移至 `7.5rem`（并兼容安全区域），彻底解决了在 Android 9 等具有自定义导航栏的设备上与系统 UI 重叠的问题。
- **Premium 玻璃态适配**：Toast 提示引入了全局 `.glass` 磨砂玻璃材质，实现了对暗黑/明亮模式的完美自动适配，并新增了呼吸灯动效与交互箭头，视觉质感大幅提升。
- **“一版一次”提示逻辑**：精细化了 `lastToastedVersion` 持久化机制。小版本更新仅在首次检测到时提醒一次，后续启动将保持静默，极大降低了对用户的干扰。
- **大版本持续提醒策略**：确保标记为 `is_major` 的重大版本在用户未点击“忽略此版本”前，会在每次启动时持续通过大弹窗提醒，保障核心更新的触达率。

### 稳健性与工程优化
- **版本比对算法加固**：重写了 `compareVersions` 逻辑，支持自动剥离 `v` 或 `V` 前缀并处理非数字字符，消除了因版本号格式不一导致的检测失效风险。
- **更新检测容错增强**：优化了 `checkUpdate` 执行流。现在即使云端清单获取失败，系统仍会尝试触发 Tauri 原生检测。同时改进了清单数据与原生数据的合并逻辑，确保信息不丢失。
- **下载链路灵活化**：安卓端下载优先读取清单中定义的 `platforms.android.url`。只有在清单未定义时，才回滚到基于 GitHub Release 的自动拼接地址，并同步进行了版本号去 `v` 处理。
- **检测优先级调整**：将 GitHub Raw 直连地址调整为更新检测的第一优先级，跳过 CDN 缓存延迟，实现真正的实时更新检测。

### 开发者体验 (Workflow)
- **发版工作流程 SOP 演进**：更新了根目录 `workflow.md`。明确了版本滚动的默认规则（Patch），并规范了 `is_major` 标记的生命周期管理——除非明确指定，否则新版本自动回归为小版本提示模式。

## 2026-05-13 — 版本检测系统重构、CDN 缓存穿透与发版 SOP 建立 (Update System & SOP)

### 核心优化
- **全网并发检测与“最高版本”策略**：版本检测不再采用“首个成功即返回”的逻辑，而是同时向 jsDelivr、GitHub Raw 和 GCore 发起并发请求，并对比所有返回结果，始终以**云端最高版本**为准。彻底解决了 jsDelivr 等 CDN 因边缘节点缓存延迟（Stale Cache）导致用户无法检测到最新版本的问题。
- **Tauri 原生检测回退机制修复**：修正了桌面端逻辑，确保即使 Tauri 原生 `check()` 因为缓存返回“已是最新”，系统仍会继续执行手写的全网并发检测，为桌面端用户提供双重更新保障。
- **语义化版本比对**：引入 `compareVersions` 逻辑，支持按 `.` 切分进行深度数字比对。彻底解决了因字符串判定导致的“本地版本较新却提示降级更新”的 BUG。
- **静默检测与 Toast 交互**：重构版本检测流程，普通更新由居中大弹窗改为底部轻量级 Toast 提示。支持“一版本仅提醒一次”的静默逻辑，大幅降低对用户的干扰。
- **“跳过此版本”功能**：在更新弹窗中新增 `Skip this version` 选项，勾选后系统将记录该版本为已忽略，直到发布更高版本前不再主动弹窗。
- **重大更新强制提醒**：支持云端 `is_major` 标识。对于标记为重大的推荐更新，系统依然会保留开机自动弹窗逻辑以确保安全与一致性。

### 开发者体验
- **发布工作流 SOP**：在根目录创建 `workflow.md`，详细规范了从版本滚动、Changelog 提取、跨平台编译、Tauri 签名同步到 GitHub Release 自动上传的完整流程，支持 AI Agent 一键自动化发版。
- **Settings 状态智能感应**：设置页面“检查更新”按钮现在能根据检测状态动态变为“详情查看”，并能在版本信息处智能标识“当前版本高于云端”。



## 2026-05-13 — 助记缓存与打分漂移修复 (Mnemonic System Refactor)

### 核心优化
- **一次性全量生成**：重构了 AI 助记生成逻辑（\`src/services/ai.ts\`），现在单次请求会同时生成“词源”、“故事”和“智能联想”三种不同视角的记忆法。
- **打分漂移彻底解决**：通过让大模型拥有全局视角同时对比生成，确保了各类型助记打分 (\`score\`) 的固定性，从根本上解决了之前重新生成单类型助记导致的分数漂动。
- **缓存全覆盖与零延迟切换**：更新了 \`Mnemonic\` 数据结构（\`src/types/index.ts\`），将全量数据作为一个整体存入 Zustand 缓存。重构后的卡片组件现在能在不同助记流派之间实现零延迟无缝切换，并能在重新搜索时100%恢复历史内容。

## 2026-05-13 — v0.7.5 搜索/导航/更新检测收尾发布

### 发布摘要
- **搜索时底栏策略修正**：搜索框聚焦与输入期间不再提前收起底部导航，只有用户真正向下滑动内容时才隐藏，回到顶部或上滑时重新出现。
- **图片 Pin 顶部体验延续修复**：翻译图片页继续保持贴近顶部的 sticky / pin 行为，减少无意义顶部留白。
- **版本检测根因修复**：确认 GitHub 仓库实际使用 `master` 分支后，统一修正 `updateStore.ts` 与 `tauri.conf.json` 中的远端 `version.json` 地址，解决此前误写 `main` 导致所有线上更新检测地址 404 的问题。
- **全链路验证通过**：对 Raw GitHub、jsDelivr、gcore 三条版本清单地址完成模拟验证，均可成功返回 `version.json`；当前版本号提升至 `0.7.5` 后，可作为新一轮正式发布版本。

## 2026-05-13 — 最终收尾：搜索底栏策略与版本检测根因确认

### 1. 搜索期间底部导航显隐策略微调 (Bottom Nav Search Behavior)
- **搜索聚焦时不再立刻收起底栏**：调整 `App.tsx` 的底部导航显隐逻辑。现在点击输入框、弹出键盘、开始输入搜索时，底部导航会继续保持可见，不会因为键盘事件立即隐藏。
- **仅在实际向下滑动内容时隐藏**：底部导航的收起触发点重新收敛到真实滚动行为本身。也就是说，只有用户后续开始向下滑动浏览内容时，导航栏才会收起；上滑或回到顶部时仍会重新出现。

### 2. 版本检测失败根因确认 (Update Check Root Cause)
- **不是 GitHub 没有 `version.json`**：经排查，`version.json` 确实已经存在于仓库中，并且 Git 跟踪正常。
- **真正根因是分支名写错**：项目仓库当前实际使用的是 `master` 分支，而 `updateStore.ts` 与 `src-tauri/tauri.conf.json` 之前都把远端版本清单地址写成了 `main`，导致三个更新清单地址全部请求到 404。
- **修复内容**：已将所有版本清单 URL 从 `main` 统一改为 `master`，包括：
  - `https://raw.githubusercontent.com/jimytao/lexicon/master/version.json`
  - `https://cdn.jsdelivr.net/gh/jimytao/lexicon@master/version.json`
  - `https://gcore.jsdelivr.net/gh/jimytao/lexicon@master/version.json`

### 3. 版本检测链路模拟验证通过 (Manifest Simulation Verified)
- **线上直链验证成功**：对 Raw GitHub、jsDelivr、gcore 三条地址分别做了实际读取测试，三者均已成功返回相同的 `version.json` 内容。
- **代码侧构建验证通过**：修复分支地址后重新执行了本地构建检查，确认当前代码可以正常编译。
- **当前功能结论**：版本检测链路已经具备成功条件；由于线上 `version.json` 当前版本号仍是 `0.7.4`，与本地应用版本一致，所以正确表现应为“已是最新版本”，而不是发现新更新。

## 2026-05-12 — 全平台输入/导航/图片 Pin/版本检测修复补丁

### 1. 移动端键盘与底部导航回归修复 (Keyboard & Bottom Nav Recovery)
- **键盘收起后底栏复位修复**：重构 `App.tsx` 中的键盘可见性与布局恢复逻辑。输入框失焦、`visualViewport` 恢复、Capacitor Keyboard 事件三条链路现在都会统一清理键盘补偿，避免 Android 旧机上出现“键盘收起后底部导航仍停在屏幕中间”的回归问题。
- **纯色空白区清理**：键盘关闭时会统一移除之前附加到滚动容器上的 `paddingBottom`，减少键盘消失后底部残留一块纯色区域的现象。
- **底部导航滚动显隐**：新增滚动方向感知逻辑。下滑浏览时底部导航自动隐藏，上滑时重新出现，滚动回顶部时强制显示；键盘打开期间则始终隐藏，避免遮挡输入区。

### 2. 搜索框原生蓝色清除按钮与建议竞态修复 (SearchBar Regression Fixes)
- **移除系统原生蓝色 `x`**：将搜索输入框从 `type="search"` 调整为 `type="text" + inputMode="search"`，同时保留现有自定义清除按钮，规避 Android / iOS / WebView 再次带出原生清除控件的问题。
- **历史记录与建议列表状态收敛**：把联想建议查询统一收拢到 `useEffect` 请求流，并增加请求序号防抖失效机制，避免旧请求在焦点切换后回写状态。
- **低概率错乱兜底**：清空输入、失焦、重新聚焦时会主动失效旧联想请求并清空过期建议，降低“点击输入框后不显示历史，反而冒出按 a 开头的字典内容”的竞态概率。

### 3. 图片翻译页 Sticky / Pin 顶部偏移修复 (Image Translate Sticky Pin Fix)
- **修复图片未真正贴顶**：`ImageTranslate` 中用于原图/翻译图悬停固定的 sticky 容器，之前沿用了字典页头的 `top-header-offset`，会额外预留一段不属于图片页的顶部空间。
- **改为按安全区贴顶**：现已切换为 `top-safe`，使图片在桌面端与移动端上滑时都能更贴近真实屏幕顶部 pin 住，同时尽量减少对下方列表内容的遮挡。

### 4. 全平台版本检测回退增强 (Update Check Fallback Hardening)
- **统一平台判断**：更新检测逻辑改为统一使用 `services/platform.ts` 中的 Tauri / Capacitor 平台识别，避免桌面端和移动端各自散落判断带来的行为漂移。
- **Tauri 检查失败自动回退远端清单**：桌面端若 `@tauri-apps/plugin-updater` 的 `check()` 失败，不再直接中断，而是继续尝试拉取远端 `version.json` 进行版本比对。
- **远端清单获取更稳健**：版本清单请求新增多节点回退、8 秒超时、cache busting 与更明确的错误来源提示，降低桌面端与 Android 端统一报 `network error` 的概率。
- **下载前错误提示更清晰**：桌面端如果更新插件没有返回可下载包，会显式抛出更准确的错误信息，便于后续继续排查 release / 签名链路问题。

## 2026-05-12 — Premium 视觉重置与体验优化补丁

### 1. Premium 视觉与光影深度重构 (Aesthetic Overhaul)
- **Glassmorphism 材质大改**：摒弃了之前较为平淡的毛玻璃效果，全新引入斜向线性渐变、高饱和度模糊 (`saturate(200%) blur(28px)`) 以及更为立体的阴影 (`box-shadow`) 与高光内边框 (`inset 0 1px 1px`)，让 UI 具有更强烈的物理通透感与层次感。
- **环境光渲染增强**：在 `index.css` 中大幅提升了背景径向渐变（Radial Gradients）的色彩强度与可见度，加入粉色辅助光晕，整体界面更显流光溢彩。

### 2. 更新检测机制稳健性修复 (Update Robustness)
- **CDN 节点回落与轮询**：修复了原更新检测接口直接请求 `raw.githubusercontent.com` 导致在部分网络环境（国内）全线报错的致命问题。
- **多链路配置**：在 `updateStore.ts` 以及 Tauri 的 `tauri.conf.json` 中加入了基于 jsDelivr 的多路镜像节点 (`cdn.jsdelivr.net` 与 `gcore.jsdelivr.net`) 作为降级备用，确保设备在主链路不通时依然能成功拉取更新清单。

### 3. AI 问答区交互优化 (AI Chat UX)
- **追问自动滚动**：在 `AiChatBox.tsx` 增加了滚动锚点。在用户发送第二次及之后的追问问题时，界面会自动平滑滚动到底部，以便立刻看到自己新发出的问题和 AI 的思考状态。
- **阅读流保持**：保留了 AI 流式输出时不强制拉取滚动条的设定，方便用户停留在需要的地方阅读长篇回复，免受屏幕自动跳跃的干扰。

### 4. 更新失败提示收敛 (Update Error UX)
- **移除主界面错误横条**：彻底删除 `App.tsx` 中的更新失败 banner。无论是自动检查失败还是手动检查失败，主界面不再出现任何红色提示，不影响主流程体验。
- **错误仅在设置页可见**：手动点击"Check Update"失败后，错误信息仅在设置抽屉内部展示，关闭抽屉后自动 `reset()`，干净不残留。

### 5. 性能模式微调 (Performance Mode Refinement)
- **动画恢复**：修正了性能模式下强制将所有过渡时间设为极短的“一刀切”逻辑，恢复了如 Instant AI Lookup 按压、悬浮抬升等轻量且硬件加速的 UI 动效，让老设备也能保有流畅的交互反馈。
- **精准降级**：性能模式现在明确只剔除最消耗渲染性能的背景遮罩 (`backdrop-filter`)、复杂环境光阴影 (`box-shadow`) 和繁杂光晕，实现续航保活与体验的最佳平衡。

### 6. 全平台更新链路根治 (Update Pipeline Fix — Signed Artifacts)

> 📌 **踩坑记录**：从 0.7.0 开始的所有版本更新，在有网络（含 VPN）的情况下仍然报错，追查后发现是以下两个被遗漏的关键环节。

- **坑 1 — Windows .sig 签名文件从未生成**：构建时未设置 `TAURI_SIGNING_PRIVATE_KEY` 环境变量，导致 Tauri 打包虽然成功，但不会输出 `.sig` 文件。`version.json` 里的 `signature` 字段一直是空字符串。用户客户端检测到有新版本后，Tauri 下载完安装包尝试验签时直接抛错 —— 这才是"Update check failed"的真正原因，不是网络问题。
- **修复**：在 PowerShell 中设置 `$env:TAURI_SIGNING_PRIVATE_KEY`（读取本地 `src-tauri/lexicon.key`，密码 `lexicon`）后，使用 `npx tauri signer sign` 对 NSIS `.exe` 和 MSI 分别签名，将生成的 `.sig` 内容填入 `version.json`，同时把 `windows-x86_64.url` 改为 GitHub Release 的直链。
- **坑 2 — Android/iOS url 指向 HTML 页面**：`version.json` 的 `android.url` 和 `ios.url` 一直填的是 `releases/latest`（HTML 页面），Capacitor 的下载代码用 `fetch()` 直接请求该地址，拿到的是 HTML 而非 APK，写入文件后系统无法安装。
- **修复**：将 `android.url` 与 `ios.url` 改为 GitHub Release 的直链 APK（`Lexicon_X.X.X_universal_signed.apk`）。
- **后续每版发布标准操作**：构建 → 带私钥签名 → 把 `.sig` 内容 + 各平台直链 URL 填入 `version.json` → 推送 → 创建 Release 上传产物。
- **坑 3 — version.json 里混入了 android / ios 平台条目**：即使上面两个坑都修好，Update check failed 依然复现。根因：Tauri 官方文档明确指出"Tauri will validate the **whole file** before checking the version field"。我们的 `version.json` 里有 `android.signature = ""` 和 `ios`（无 signature 字段），Tauri 在读到 `windows-x86_64` 前就因校验整个 platforms 对象失败而 throw。移动端 URL 原本存在 `platforms.android.url` / `platforms.ios.url` 里，**修复**为从 `version.json` 中删除所有非桌面平台，移动端 APK/发版链接改为在代码里按版本号动态拼接（`Lexicon_X.X.X_universal_signed.apk`），不再依赖 JSON 字段。

### 7. 底部导航与设置界面重构 (Bottom Nav & Settings Refactor)
- **悬浮灵动岛设计**：废弃了横跨全屏的底部导航栏，重构为居中、有左右留白的“胶囊状”悬浮磨玻璃栏 (`w-[85%] max-w-[320px]`)，极大提升了高级感，视觉体验更贴近 iOS 与现代移动规范。
- **图标与排版优化**：导航栏内的元素重新等分 (`flex-1`) 实现了绝对对称。按钮采用了 YouTube 风格的“上图标、下小文字”纵向堆叠布局（如 Dictionary 缩写为 `Dict`），完美解决了此前横向排版导致的拥挤感。
- **设置页升格为独立主视图**：移除了之前的 `SettingsDrawer` 右侧滑出遮罩设计。现在 `SettingsView` 作为一个平级的独立视图，和 Dictionary、Image Translate 一样直接在主内容区域渲染，所有核心功能间实现了平滑的同层级切换，沉浸感更强且消除了侧边栏带来的多余 DOM 开销。

## 2026-05-11 — v0.7.2 Premium 视觉效果修复补丁

### 视觉层次与背景遮挡修复 (Aesthetic Visibility Fixes)

- **移除冗余实色背景**：修复了 `App.tsx` 中主容器与滚动容器使用 `bg-background` 导致底层径向渐变（Lighting）与网格背景（bg-grid）被完全遮挡的 Bug。
- **增强光影可见度**：在 `index.css` 中调优了 `html, body` 的径向渐变透明度，浅色模式提升至 `0.06`，深色模式提升至 `0.15`，确保“光影效果”在全平台均清晰可辨。
- **CSS 架构归一化**：清理并合并了 `index.css` 中由于多次迭代产生的重复 `.glass`、`.segmented-control` 及 `html, body` 定义，显著提升了样式的可维护性。
- **毛玻璃效果优化**：修正了 header 的 `.glass` 材质，通过移除容器实色背景，使其能够正确模糊下方滚动的动态内容。

---

## 2026-05-11 — v0.7.1 静默更新补丁

### 自动更新联网容错（Silent Graceful Checks）

- **单次静默自检**：应用每次启动仅尝试一次访问 GitHub 版本清单。如果网络受限，立即回落到 `idle` 状态，确保不会弹出任何更新提醒或错误提示，避免干扰用户主流程。
- **手动重试保留**：设置页中的 “Check Update” 依旧可以强制触发联网检查；只有在用户主动点击时才会展示失败原因与重试按钮，便于排查但不影响普通用户。
- **错误上下文收敛**：`UpdateModal` 仅在真实存在新版本（`available / downloading / ready`）时展示，失败信息转为设置页提示，让自动更新 UI 始终保持安静。

---

## 2026-05-11 — 全平台自动更新系统与 Premium 视觉重构

### 概述

本次更新为 Lexicon 引入了一套完整的跨平台自动更新方案，并对全站 UI 进行了深度美化，实现了从功能到美学的双重进化。不再依赖应用商店，通过 GitHub 直连实现自主更新与安全分发。

---

### 1. 全平台自动更新逻辑 (Update System)

- **多端覆盖**：
    - **Desktop (Tauri)**：集成 `tauri-apps/plugin-updater`，支持原生下载、签名校验与平滑重启。
    - **Android (Capacitor)**：接入 `Filesystem` 与 `FileOpener` 插件，实现 APK 的流式下载、进度展示与系统级安装唤起。
    - **iOS (Fallback)**：检测到更新后自动导向 GitHub Release 页面。
- **自动清理机制**：App 启动时自动扫描并清理 Cache 目录下的旧 `.apk` 文件，确保不占用系统空间。
- **强制更新支持**：预留 `isCritical` 逻辑，支持通过服务端配置强制用户升级以保障核心服务可用性。

---

### 2. 安全与分发基础设施 (Infrastructure)

- **Ed25519 签名体系**：生成并配置了 Tauri 专用的 Ed25519 签名密钥对。公钥已集成至 `tauri.conf.json`，私钥受 `.gitignore` 保护且配置了密码 `lexicon`。
- **GitHub 直连分发**：根目录新增 `version.json` 模板，支持通过 `raw.githubusercontent.com` 实现版本清单的全球分发。

---

### 3. Premium 视觉重构 (Aesthetic Overhaul)

- **主题配色重定义**：
    - 引入 **Indigo (#6366F1)** 与 **Sky Blue (#0EA5E9)** 的现代科技感配色。
    - **OLED 纯黑模式**：深色模式背景设为 `#000000`，完美适配移动端屏幕且显著省电。
- **高级材质与纹理**：
    - **Neo-Glass**：升级了全局毛玻璃 (Glassmorphism) 效果，模糊度提升至 `20px`，并加入多层细微边框。
    - **bg-grid 科技背景**：全局背景引入了极细微的网格纹理与径向呼吸光晕，提升界面深度感。
- **非侵入式更新提醒**：
    - 废弃了突兀的呼吸红点，改为精致的 **冰晶蓝 (Sky Blue)** 静态小点，并配有微弱外发光阴影。
    - **沉浸式更新弹窗**：重构了 `UpdateModal`，采用超白玻璃材质与精美布局。

---

### 4. UI 交互细节打磨

- **极速模式 (Performance Mode)**：针对老旧设备新增性能开关。开启后自动禁用毛玻璃效果、网格背景、复杂渐变及动画，大幅提升响应速度。
- **设置页集成**：在设置抽屉底部新增版本信息显示与“检查更新”手动触发按钮。
- **动态回馈**：所有核心按钮与输入框引入 `active:scale-95` 与 `hover-lift` 效果，交互体验更趋向原生。

---

## 2026-05-11 — Module Management 移动端排序可用性修复

### 概述

本次更新修复了设置页 `Module Management` 在移动端（Android / iOS）无法使用排序入口的问题：此前上下排序按钮依赖鼠标悬停显示，触屏设备无法触发 `hover`，导致排序能力几乎不可达。现在改为“桌面保留 hover 按钮 + 全端常驻拖拽手柄”的混合方案。

---

### 1. `SettingsDrawer.tsx` — 模块排序交互重构

- **接入拖拽排序（Handle-only）**：模块列表改为基于 `@dnd-kit` 的排序实现，拖拽监听仅绑定在右侧三横杠手柄上，避免整行可拖导致误触。
- **移动端入口修复**：三横杠手柄在所有端常驻显示，触屏设备不再依赖 `hover` 即可完成排序。
- **桌面行为保留**：上下排序按钮仍保留在桌面端，并继续采用“仅 hover 时显示且可点击”的写入策略。
- **移动端按钮裁剪**：上下排序按钮改为 `md` 及以上显示，移动端隐藏，只保留手柄入口，减少视觉噪声与误触。

---

### 2. 误触防护与反馈增强

- **触控误触防护**：
  - `TouchSensor` 增加激活约束：`delay: 180ms`、`tolerance: 8`。
  - `MouseSensor` 增加最小拖动阈值：`distance: 6`。
  - 目标是避免手指滚动页面时被误判为拖拽。
- **手柄高亮反馈**：手柄新增按下态与拖拽中高亮（强调色 + 背景轻高亮），提升“该处可拖拽”的可发现性。
- **拖拽中行态反馈**：被拖动行保持半透明 + 边框高亮，便于确认当前重排对象。

---

### 3. 搜索历史可见性与输入规范化修复

- **最新历史即时可见**：在 `useSearch.selectWord()` 进入时先进行一次 history 乐观写入（`aiMode: null`），不再等待异步词库查询完成，修复“搜索后立刻点输入框时最新历史偶发不显示”的竞态。
- **历史键统一规范化**：在 `historyStore` 的 `add / upgrade / remove` 入口统一做 `trim()`，并忽略空字符串输入。
- **一致性收益**：避免 `apple` 与 ` apple ` 被视为不同历史项，也避免因首尾空格导致升级/删除命中失败。

---

## 2026-05-10 — 模型选择按厂商记录与持久化

### 概述

本次更新实现了 AI 模型选择的按厂商独立持久化。现在，当你在不同 API 厂商（如 OpenAI、Gemini）之间切换时，系统会自动恢复你上次为该厂商选择的模型，不再需要重复手动选择。

---

### 1. `settingsStore.ts` — 状态存储增强

- **新增 `aiModels` 记录表**：在持久化状态中增加了 `aiModels: Record<string, string>`，用于存储每个厂商 ID 对应的最后一次选用的模型。
- **切换联动逻辑**：更新 `setAiProvider` Setter，在切换厂商时，自动尝试从 `aiModels` 中恢复对应的模型到当前的 `aiModel` 状态。
- **自动保存机制**：更新 `setAiModel` Setter，任何模型变更都会实时同步到 `aiModels` 记录表中，确保下次切回时能无缝恢复。

---

### 2. `ai.ts` — 服务配置对齐

- **配置优先级优化**：在 `getConfig` 函数中，将 `aiModels[providerId]` 的读取优先级设为最高，确保即使在极少数状态同步间隙，API 请求也能使用正确的厂商对应模型。

---

### 3. `SettingsDrawer.tsx` — 交互体验优化

- **智能默认值 (Smart Default)**：当用户首次切换到一个从未配置过模型的厂商时，系统会检查该厂商是否有 `staticModels` 定义（如 Gemini 系列），并自动选中第一个推荐模型，减少用户的输入负担。

---

## 2026-05-10 — 模型搜索智能化升级

### 概述

本次更新大幅提升了设置页 AI Model 搜索框的匹配智能度，解决了旧版本对版本号识别不准、乱序搜索支持较差以及简写输入匹配率低的问题。

---

### 1. `SettingsDrawer.tsx` — 增强型模糊匹配算法

- **保留版本号分词**：优化了分词逻辑，搜索时保留小数点（`.`），确保搜 `3.1` 时能精准命中版本号，不再被 `3` 和 `1` 的无关组合干扰。
- **紧凑模式匹配 (Compact Match)**：引入归一化比对逻辑，自动忽略输入与模型名中的横杠、下划线及标点。现在输入 `gpt4o` 也能秒中 `gpt-4o`。
- **权重评分系统重构**：
    - **词法标记优先**：基于 Token 进行匹配，无论输入顺序如何（如 `flash 3` 与 `3 flash`），只要关键词全中即获得高分奖励，排在列表最前方。
    - **首字母/起始位加成**：匹配到单词开头或模型名起始位置时获得额外权重，提升直观匹配感。
    - **全匹配奖励 (Completeness Bonus)**：对包含搜索所有关键词的模型给予巨额加分，实现精准“语义”过滤。
    - **顺序微调**：在支持乱序的同时，对顺序一致的匹配保留微弱加分，确保最合理的组合排在第一位。
- **长度惩罚机制**：在匹配程度相同时，优先推荐名称更简洁的模型，避免超长模型名占据首位。

---

## 2026-05-09 — 输入框键盘遮挡补强与 AI Model 模糊排序

### 概述

本次更新补强移动端输入框在虚拟键盘弹出时的可见性保障，并优化设置页 AI Model 输入框在大量模型列表中的查找体验。

---

### 1. `App.tsx` — iOS / Android 虚拟键盘遮挡补强

- **focus fallback 更稳**：输入框或文本域获得焦点后，即使 Capacitor Keyboard 事件未及时返回，也会先给最近的可滚动容器追加 `45vh` 底部 padding。
- **强制二次滚动定位**：焦点触发后立即 `scrollIntoView({ block: 'center' })`，并在 250ms 后再次滚动，覆盖 iOS 键盘动画尚未完成导致第一次滚动位置不准的场景。
- **监听 `visualViewport`**：在 Capacitor 环境中同时监听 `visualViewport.resize` 与 `visualViewport.scroll`，根据 `window.innerHeight - visualViewport.height - visualViewport.offsetTop` 估算键盘高度。
- **动态 padding 计算**：键盘出现时将滚动容器底部 padding 设置为 `keyboardHeight + visibleHeight / 2`，保证页面底部输入框也能滚到剩余可视区域中间。
- **Android 双重 resize 风险收敛**：优先采用 `visualViewport` 估算到的键盘高度，降低 Android 11+ 系统 resize 与 JS padding 叠加时过度补偿的概率。
- **padding 上下限保护**：键盘出现时的底部 padding 被限制在合理区间内，避免部分 WebView / 机型上出现过大的底部空白，同时保留必要的滚动空间。
- **清理逻辑补全**：键盘收起或组件卸载时移除 Keyboard listeners 与 `visualViewport` listeners，并恢复滚动容器 padding。

#### Android occlusion 风险处理记录

本次针对 Android 输入框遮挡风险共提出 3 个可选优化方向：

1. **增加最大 padding 上限**，避免 Keyboard event 与系统 resize 叠加后产生过大底部空白。
2. **使用 `visualViewport` 修正有效键盘高度**，优先采用实际 viewport 收缩量，降低 Android 11+ 双重 resize 风险。
3. **增加滚动节流 / debounce**，在 `keyboardWillShow`、`keyboardDidShow`、`visualViewport.resize`、`visualViewport.scroll` 高频触发时减少轻微跳动。

本次实际完成前 2 点：padding 上下限保护与 `visualViewport` 有效高度修正。第 3 点暂不加入，原因是当前多次滚动有助于覆盖 iOS / Android 键盘动画时序差异；如果后续真机测试发现 Android 或 iOS 有明显跳动，再优先尝试加入滚动节流。

---

### 2. `SettingsDrawer.tsx` — AI Model 模糊匹配排序

- **新增模型匹配评分**：对输入内容进行 token 化与归一化（忽略大小写、空格、横线、下划线、斜杠等分隔符），为每个模型计算匹配分数。
- **支持近似输入**：例如输入 `gemini 3.1 pro` 时，可优先匹配名称中按顺序包含 `gemini`、`3`、`1`、`pro` 的模型。
- **只排序不隐藏**：不匹配或低相关模型仍保留在列表中，只是排到后面，避免用户因为过滤过严找不到模型。
- **聚焦自动展开**：已拉取模型列表后，重新聚焦 Model 输入框会自动展开列表，便于继续微调输入并选择。
- **输入时实时重排**：Model 输入内容变化时，已拉取的模型列表会按照新的匹配分数实时排序。

---

### 3. `App.tsx` — 历史记录 AI 缓存星标点击恢复修复

- **问题确认**：历史记录星标由 `aiCache / aiFullCache / phraseCache` 任意缓存命中决定，但历史点击恢复逻辑此前主要受 `historyAiMode` 驱动；当星标来自 `aiFullCache` 或 `phraseCache`，而历史项的 `aiMode` 为 `null` 或其他类型时，可能出现“看起来有 AI 缓存星标，但点击历史记录后没有真正加载缓存”的情况。
- **修复策略**：历史记录点击时先检查并加载实际存在的缓存，优先级为 `aiFullCache → phraseCache → aiCache`；只有完全没有缓存时，才回退到 `historyAiMode` 触发新的 AI 请求。
- **状态同步**：成功从缓存恢复后同步 `searchSource` 与 `mode`，并通过 `upgradeHistory` 将历史项更新到实际加载的 AI 类型，避免下次点击继续依赖过期的 `aiMode`。
- **普通输入缓存恢复规则**：输入框普通搜索时，只要该词存在任意真实 AI 缓存，就优先恢复缓存（`aiFullCache → phraseCache → aiCache`），不再要求历史记录仍然存在；这适配“删除历史记录”和“删除 AI 缓存”分离的设置设计。
- **入口差异明确**：普通输入不会因为暗色星标或历史 `aiMode` 自动重跑历史 AI 类型；只有用户明确点击历史记录时，暗色星标才代表“按上次 AI 类型重新生成”。
- **强制 AI 入口补齐历史写入**：点击输入框右侧 AI 按钮时，若历史记录功能开启，会用 `addHistory` 写入或更新对应 AI 类型，避免此前仅 `upgradeHistory` 导致新词没有历史项的问题。
- **清缓存按钮修复**：设置页 `Clear Cache` 的禁用条件补充 `phraseCache`，避免只有短语 / 句子 AI 缓存时按钮被错误禁用。
- **清缓存状态一致性**：执行 `Clear Cache` 时同步清空当前已加载的 `aiAnalysis / aiFullResult / phraseResult` 与 AI 状态，避免出现“缓存已清、星标消失，但页面仍显示旧 AI 结果”的状态错位。

---

## 2026-05-08 — 搜索逻辑重构与历史记录 AI 模式记忆

### 概述

本次更新分两个部分：① 重构搜索路径的优先级与分支逻辑，消除连续搜索时的状态冲突；② 为历史记录加入 AI 模式记忆，点击历史条目时自动恢复上次使用的 AI 类型。

---

### 1. `historyStore.ts` — 数据模型升级

- **`string[]` → `HistoryEntry[]`**：历史记录从纯字符串数组升级为对象数组，每条记录包含 `word: string` 和 `aiMode: 'analyze' | 'full' | 'phrase' | null`。
- **新增 `upgrade(word, aiMode)`**：原地更新某条历史的 aiMode，不改变排列顺序（区别于 `add` 的移顶逻辑）。
- **`add(word, aiMode?)` 增强**：新增可选 aiMode 参数；upsert 时若已存在同词条，优先保留更高级别的 aiMode（不降级）。
- **旧数据迁移**：通过 `onRehydrateStorage` 回调自动将 localStorage 中的旧 `string[]` 格式迁移为 `HistoryEntry[]`，无需手动清空历史。

---

### 2. `useSearch.ts` — 写入 aiMode

- 本地词库命中 → `addToHistory(word, null)`
- 词库未命中，走 AI full lookup → `addToHistory(word, 'full')`
- 短语 / 句子未命中，走 AI phrase query → `addToHistory(word, 'phrase')`
- 句子（sentence 类型）强制 phrase → `addToHistory(word, 'phrase')`

---

### 3. `App.tsx` — 核心逻辑重构

#### 新增状态
- **`searchSource: 'local' | 'ai-full' | 'phrase' | 'none'`**：取代原来依赖 `wordResult` 是否为 null 的隐式判断，精确驱动 `showAiFullView` / `showPhraseView` 的视图渲染。
- **`localWordSnapshotRef`**：在触发 AI full lookup 之前保存当前本地词库结果快照，用于从 `ai-full → instant` 切换时秒速恢复，无需重新查库。

#### `handleWordSelect(word, fromHistory?)` 重构
新增 `fromHistory` 布尔参数，**区分历史点击与普通搜索两条路径**，消除此前两者混用同一逻辑导致的优先级冲突：

| 路径 | `fromHistory` | 行为 |
|---|---|---|
| 输入框提交 / 备选词点击（DB 命中） | `false` | 有 AI 缓存 → 自动加载缓存进 AI mode；当前在 AI mode → 触发新请求；其他 → 纯 Instant，不受历史 aiMode 干扰 |
| 历史列表点击 / 备选词中的历史-miss 项点击 | `true` | 按 historyAiMode 精确恢复：`analyze` → setAiAnalysis 或 triggerAi；`full` → 缓存秒开或 triggerFullLookup；`phrase` → 缓存秒开或 triggerPhraseQuery；`null` → 普通 Instant |

#### `handleForceAi` 修复
- 点击 AI 按钮时，**先保存本地快照**（若当前已有同词本地结果）。
- 强制设置 `searchSource` 为 `'ai-full'` 或 `'phrase'`，再调用对应 AI 函数。
- 调用 `upgradeHistory` 更新该词的 aiMode 记录。

#### mode 切换 effect 修复
- **`instant → ai`**：只在 `searchSource === 'local'` 时才自动触发 `analyzeWord`，不再对 ai-full / phrase 状态误触发。
- **`ai → instant`（从 ai-full 切回）**：检测到 `searchSource === 'ai-full'` 且有本地快照时，自动还原本地结果并将 `searchSource` 置回 `'local'`。

#### `handleRetry` 修复
- 基于 `searchSource` 判断重试类型，替代原来依赖 `!wordResult` 的模糊判断。

#### 视图渲染简化
```diff
- const showPhraseView = !wordResult && (phraseResult || ...)
- const showAiFullView = !wordResult && !showPhraseView && (aiFullResult || ...)
+ const showPhraseView = searchSource === 'phrase'
+ const showAiFullView = searchSource === 'ai-full'
```

---

### 4. `SearchBar/index.tsx` — 搜索入口分流

- **新增 `onHistorySelect` prop**：历史点击与普通 DB 词点击走不同回调，`App.tsx` 通过 `fromHistory` 参数区分处理。
- **建议词富化（enrichedSuggestions）**：在 `SuggestList` 展示前对建议词进行实时富化：
  - 读取 `resultStore` 的 `aiCache / aiFullCache / phraseCache`，命中则标记 `hasAiCache: true`。
  - 遍历 `historyStore.words`，将历史中存在但当前 DB 未返回的词（前缀匹配）追加为 `historyOnly: true` 条目（最多补至 20 条）。
- **`handleSubmit` 修复**：`activeIndex` 指向 `historyOnly` 项时走 `handleHistoryItemSelect`，否则走 `handleSelect`。
- **键盘导航**：`ArrowDown` 上限从 `suggestions.length` 改为 `enrichedSuggestions.length`，涵盖追加的历史条目。
- **下拉显示条件统一**：`(enrichedSuggestions.length > 0 || showHistory) && isFocused`。

---

### 5. `SuggestList/index.tsx` — 视觉标记升级

- 接受富化后的 `EnrichedSuggestItem`（含 `hasAiCache?` / `historyOnly?` 字段）。
- **`onSelect` 签名变更**：`(word: string, isHistoryOnly: boolean) => void`，让调用方可据此分流。
- **AI 缓存标记**：有 AI 缓存的词右侧显示 **琥珀色 ★ 图标**（`text-amber-400`）。
- **历史-miss 标记**：仅出现在历史但 DB 未命中的词，显示灰色时钟图标 + 文字降色（`text-foreground-muted`），有 AI 缓存时时钟换为 ★。
- `zhBrief` 仅在非 historyOnly 项时显示，historyOnly 项无翻译摘要。

---

### 6. `HistoryList.tsx` — AI badge 显示

- 渲染改为遍历 `HistoryEntry[]` 而非 `string[]`。
- 实时读取 `resultStore` 的 `aiCache / aiFullCache / phraseCache`：
  - **有缓存**：★ `text-amber-400 opacity-100`
  - **有 aiMode 记录但缓存已清**：★ `text-amber-400 opacity-40`
  - **纯 Instant，从未用 AI**：无图标

---

### 优先级规则总结

| 搜索动作 | 有 AI 缓存 | 无 AI 缓存 | historyAiMode |
|---|---|---|---|
| 普通搜索（submit） | 加载缓存 → AI mode | Instant mode | 不参考 |
| 普通搜索（submit，当前在 AI mode） | 加载缓存 → AI mode | 触发 analyzeWord | 不参考 |
| 历史点击（aiMode='analyze'） | 加载缓存秒开 | 触发 analyzeWord | 参考 |
| 历史点击（aiMode='full'） | 加载缓存秒开 | 触发 fullLookup | 参考 |
| 历史点击（aiMode='phrase'） | 加载缓存秒开 | 触发 phraseQuery | 参考 |
| AI 按钮点击 | 忽略缓存，强制新请求 | 触发 fullLookup/phrase | 覆盖写入 |

---

## 2026-05-05 — v0.6.2 发布

汇总自 v0.6.1 以来的修复：

- **历史记录长文本溢出修复**：HistoryList 引入 `min-w-0` 与展开/收起交互，长句不再撑出面板；横向滚动条厚度对齐竖向。
- **PC 端图片 sticky/pinned 失效修复**：主滚动容器改为 `h-screen overflow-y-auto`；嵌字模式 bbox 复用路径补充 `scrollStickyToPinned()`；修正翻译列表 sticky 图层 z-index。

详见下方各日期段落。

---

## 2026-05-05 — Tauri 历史记录长文本溢出与横向滚动条修复

### 根因

- **历史记录条目只做了截断但布局约束不完整**：`src/components/SearchBar/HistoryList.tsx` 中历史记录条目虽然使用了 `truncate`，但条目、主按钮和文本区域缺少更完整的 `min-w-0` 约束；在 Tauri 桌面端遇到超长句子时，文本容易撑出历史记录面板的横向范围。
- **长记录缺少展开查看机制**：历史记录默认只有单行截断展示，用户想看完整长句时只能依赖横向滚动，体验不符合历史记录面板应保持规整的预期。
- **横向滚动条高度未显式设置**：`src/index.css` 的全局滚动条样式只设置了 `width: 5px`，没有设置横向滚动条的 `height`，导致横向滑块在 Tauri/WebView 中可能比竖向滑块粗很多。

### 修复

- `src/components/SearchBar/HistoryList.tsx`：引入本地 `expandedWords` 状态，用 `Set<string>` 记录每条历史记录是否展开。
- `src/components/SearchBar/HistoryList.tsx`：新增 `toggleExpanded()`，支持单条历史记录独立展开/收起。
- `src/components/SearchBar/HistoryList.tsx`：历史记录条目改为 `items-start` 布局，并给 `li`、主按钮、文本区域补充 `min-w-0`，确保内容宽度被限制在历史记录框内。
- `src/components/SearchBar/HistoryList.tsx`：折叠态继续使用 `truncate`，默认只展示一行；展开态切换为 `whitespace-normal break-words`，完整内容在面板内部自动换行。
- `src/components/SearchBar/HistoryList.tsx`：对较长历史记录显示右侧展开/收起箭头按钮，展开后箭头旋转表示当前状态。
- `src/components/SearchBar/HistoryList.tsx`：保留原有交互，点击历史记录主体仍会搜索该记录，删除按钮仍会删除单条记录，`CLEAR ALL` 仍会清空全部历史。
- `src/index.css`：在 `::-webkit-scrollbar` 中补充 `height: 5px`，让横向滚动条厚度与竖向滚动条一致；横向滚动能力暂时保留作为冗余。

### 验证

- `npm run build` 通过。

---

## 2026-05-05 — PC 端图片 sticky/pinned 失效修复

### 根因

- **主滚动容器高度错误**：`src/App.tsx` 的主容器使用 `min-h-screen overflow-y-auto`，PC 端内容会把容器撑高，实际滚动容易落到 `body/window` 上；但 `position: sticky` 会被最近的 `overflow-y-auto` 祖先约束，导致图片区域无法稳定像 pinned 一样吸顶。
- **嵌字模式缓存路径漏滚动**：`src/components/ImageTranslate/index.tsx` 中 `bboxReady === true` 时只切换到嵌字模式，没有执行自动滚动到 sticky pinned 位置；第一次 AI 定位后可能正常，之后复用 bbox 再进入嵌字模式会缺少 pinned 定位。

### 修复

- `src/App.tsx`：主滚动容器从 `min-h-screen overflow-y-auto` 改为 `h-screen overflow-y-auto`，确保它成为真正的滚动容器，使 sticky 的约束容器和实际滚动容器一致。
- `src/components/ImageTranslate/index.tsx`：新增复用的 `scrollStickyToPinned()`，统一切图、首次进入嵌字模式、复用 bbox 进入嵌字模式时的 pinned 滚动逻辑。
- `src/components/ImageTranslate/index.tsx`：`bboxReady === true` 的快速路径现在也会调用 `scrollStickyToPinned()`。
- `src/components/ImageTranslate/index.tsx`：修正翻译列表模式 sticky 图片残留的 `z-30` 为 `z-10`，与嵌字模式保持一致，避免图片层级高于 header。
- `src/components/ImageTranslate/index.tsx`：`handleSelect` 找到滚动容器后写回 `scrollContainerRef`，保持后续滚动定位使用同一个容器。

### 验证

- `npm run build` 通过。

---

## 2026-05-04 — 嵌字功能四合一修复（v0.6.1）

### 修复 1：Sticky 定位失效

**根因分析**：ImageTranslateView 中的 sticky div 使用 `z-30`，高于 App header 的 `z-20`，导致 sticky 图片区域覆盖在 header 上方，视觉上看起来 sticky "不工作"。同时，点击「嵌字此图」按钮进入 embed mode 时没有触发自动 scroll，用户需要手动滚动才能看到 sticky pinned 效果。

**修复**：
- `src/components/ImageTranslate/index.tsx:423,493` — 两个 sticky div 的 z-index 从 `z-30` 改为 `z-10`（低于 header 的 `z-20`）
- `handleEnterEmbed` 成功后增加 100ms 延迟 + 两段式 scroll：先 `scrollTo(0)` 复位，再 `requestAnimationFrame` 跳到 stickyRef 的 offset 位置

### 修复 2：点击文本框时滚动到照片下缘

**根因分析**：原 `handleSelect` 用 `stickyRef.offsetHeight + 12` 估算照片区高度，而非精确的下缘位置。offsetHeight 在图片缩放后不准确，且 12px 是硬编码魔数。

**修复**：
- `handleSelect` 改用 `stickyRef.current.getBoundingClientRect().bottom` 获取照片区在 scroll 容器内的精确下缘
- 将列表项上缘对齐到该下缘位置，实现"点击嵌入图中的文本框 → 对应的翻译列表项上移到照片下缘"

### 修复 3：删除嵌字列表的色彩控件

**根因分析**：`ImageEditor.tsx` 已在 Pass 1 通过 `sampleFillColor()` 自动采样背景色，并自动适配形状（椭圆用于气泡、圆角矩形用于标注）。手动色调/饱和度/透明度滑块会破坏自动匹配效果，且多余控件占用列表空间。

**修复**：
- `src/components/ImageTranslate/TranslationList.tsx` — 删除 `showColor` 变量、`updateColor` 函数、以及完整的色调/饱和度/透明度滑块区块

### 修复 4：多边形文字自适应失效

**根因分析**：`ImageEditor.tsx` Pass 2（文字层渲染）中，`renderBubbleText` → `renderHorizontal` 调用链始终传入 `null` 作为 `polyPixels` 参数。而 `renderHorizontal` 内部早已实现基于多边形 scanline 的文字居中逻辑（`getPolygonScanline`），但因 `polyPixels` 恒为 `null`，永远退化为矩形 bbox 内居中。对椭圆、八角形等不规则对话气泡，文字会溢出到形状外。

**修复**：
- Pass 2 的 `for` 循环解构中增加 `l1PolyPixels`（来自 BlockRenderInfo 预计算阶段）
- `renderBubbleText` 和 `renderCaptionText` 签名增加 `polyPixels` 可选参数
- 有 polygon 时：跳过 safe area 内缩（padW/padH = 0），将 `polyPixels` 透传给 `renderHorizontal` 激活 scanline 居中
- 无 polygon 时：保持原有 10%（bubble）/ 15%（caption）padding 内缩逻辑不变

### 附带清理
- 移除 `TranslationList` 中未使用的 `onUpdateBlock`、`onDeselect` 解构（色彩控件删除后不再需要）
- 保留 `onDrawL1`（"重绘遮罩"按钮仍在使用）

---

## 2026-05-04 — 回滚另一个 AI 的”深度修复”，并清理残留编辑痕迹

上一轮请另一个 AI 调试遗留 bug，结果它的”修复”思路有误，反而把问题修坏了。本次提交回滚错误改动，恢复到正确状态。

### 改动 1：恢复 sticky 图片到 `top-header-offset`（**回滚**）

另一个 AI 把 sticky 图片的吸附点从 `top-header-offset`（= 72px + safe-area，正好贴在 Header 底部）改成了 `top-safe`（= safe-area-inset-top，桌面端等于 0）。它的描述声称”图片会滑过并覆盖 Header”是预期行为，但这恰恰是 bug：

- Header 是固定导航栏（`sticky top-0 z-20`），用户切换 Dictionary/Image 标签和打开设置都靠它。
- sticky 图片 `z-30` > Header `z-20`，向下滚动时图片会**完全盖住导航栏**，用户无法切回 Dictionary，也找不到设置入口。
- 桌面端（Tauri）没有刘海，`safe-area-inset-top` 为 0，图片直接吸附到窗口顶端覆盖整个 header 区域。

**修复**（`src/components/ImageTranslate/index.tsx` 第 423、493 行）：恢复为 `top-header-offset`，让图片吸附在导航栏正下方，不影响导航栏可见性。

```diff
- <div ref={stickyRef} className=”sticky top-safe z-30 -mx-4 ...”>
+ <div ref={stickyRef} className=”sticky top-header-offset z-30 -mx-4 ...”>
```

### 改动 2：清理 `App.tsx` 残留编辑标记

另一个 AI 在 `getScrollableAncestor` 函数里留下了一行 `// ... existing code ...`（diff 占位符忘了删）。无功能影响，但属于编辑痕迹，移除。

### 改动 3：保留 SearchBar wrapper 的 `z-50`

另一个 AI 把 SearchBar wrapper 从 `relative z-10` 提升到 `relative z-50` —— 这一项的方向是对的（`z-10` 在某些场景下确实不够强，提到 `z-50` 更稳妥），保留不动。

---

## 2026-05-04 — Bug 修复：历史记录下拉被 SegmentedControl 遮挡 & Sticky 图片宽度失效

### Bug 1：搜索历史/建议词下拉框被 SegmentedControl 遮挡

**根因**：SearchBar 的外层 `<div className="w-full">` 没有建立独立的 stacking context，而 SegmentedControl 在 DOM 中排在它后面。同一 stacking context 内，后来的元素天然压过前者的绝对定位子元素（dropdown），即使 dropdown 本身声明了 `z-50` 也无效。

**修复**（`src/App.tsx`）：给 SearchBar 的外层 wrapper 加上 `relative z-10`：
```diff
- <div className="w-full">
+ <div className="w-full relative z-10">
```
这使 SearchBar（含其内部的 z-50 dropdown）在同一 stacking context 内优先于 SegmentedControl 渲染，下拉框不再被遮挡。**全平台通杀**（Web/Android/iOS/Tauri 均受影响，一次修复）。

---

### Bug 2：图片翻译 Sticky 图片视觉失效（背景不覆盖全宽）

**根因**：UX 重构后，`<main className="px-6 py-4">` 同时包裹了 Dictionary 和 Image 两个 view。Image view 内的 `ImageTranslateView` 自身有 `p-4` padding，sticky 元素用 `-mx-4` 抵消内部的 16px，但无法覆盖 `main` 外层的 `px-6`（24px）。最终 sticky 元素左右各有 8px 漏洞，内容滚动时从两侧透出，视觉上看起来"sticky 失效"。

**修复**（`src/App.tsx`）：将 padding 从 `<main>` 移入 dictionary 专用的内层 `<div>`，translate view 直接接 `<ImageTranslateView />`：
```diff
- <main className="px-6 py-4">
-   {view === 'translate' ? (
-     <ImageTranslateView />
-   ) : (
-     <div className="space-y-4">
+ <main>
+   {view === 'translate' ? (
+     <ImageTranslateView />
+   ) : (
+     <div className="px-6 py-4 space-y-4">
```
`ImageTranslateView` 自带的 `p-4` + sticky 的 `-mx-4` 恢复正确对齐，sticky 背景完整覆盖全宽。**全平台通杀**。

---

## 2026-05-04 — 多语言 AI 深度解析升级、Web 实时搜索集成与 SearchBar UI 优化

### 1. 通用多语言 AI 深度解析 (Universal Cultural Interpretation)
- **逻辑普适化**：将“翻译 + 文化解读”逻辑从仅限日韩扩展至所有非中英语种（法、德、俄、西等）。只要不是中/英，AI 任务重心均自动转向深度文化解析。
- **构词拆解重构**：针对非中英语种，将“词根词缀”模块重定义为“词汇构成/来源”，提供更贴合具体语种背景的拆解说明。
- **文化权重增强**：强制 AI 在解析所有外语时优先输出社会背景、历史渊源及亚文化（ACG、互联网梗）相关信息。

### 2. Web 实时搜索集成 (Web Search Integration)
- **Tavily 引擎接入**：在 `ai.ts` 中集成了 Tavily Search API，允许 AI 在解析前获取实时网络信息作为上下文。
- **时效性突破**：解决了 AI 对当年最新影视作品（如《超时空辉夜姬》）、流行语等时效性内容的认知滞后问题。
- **配置化管理**：在设置抽屉中新增了“Web 搜索”开关及 Tavily API Key 安全输入框，支持用户按需开启。

### 3. SearchBar UI/UX 极致打磨
- **常驻占位符设计**：实现了搜索框右侧按钮组的常驻显示（软灰色占位样式），解决了输入前按钮完全消失导致的视觉跳跃感，界面更加稳健。
- **交互冲突修复**：修复了点击 AI 搜索按钮后建议词列表（SuggestList）不自动关闭的 Bug。
- **层级架构优化**：大幅提升了搜索区域的 Z-index 层级（`z-30`），彻底解决了建议词列表被下方搜索结果卡片遮挡的顽疾。

---


## 2026-05-04 — Bug 修复：getPhrasePrompt schema 多余括号

**问题**：`ai.ts` 的 `getPhrasePrompt` 函数中，`usageScenes` 数组闭合后多了一个多余的 `]`，导致发给 AI 的 JSON schema 本身语法错误。AI 对此有一定容错，但属于潜在风险。

**修复**：`src/services/ai.ts` line 369，将 `}\n    ]\n  ]` 改为 `}\n  ]`，schema 语法恢复正确。

**附带修复**：`src/stores/searchStore.ts` 补充了缺失的 `Language` 类型导入（TypeScript 严格模式下 build 报错）。

---

## 2026-05-04 — 多语言 AI 深度解析、UI 质感升级与跨语言查词

### 1. 多语言 AI 深度分析引擎 (Multi-language Support)
- **多语种智能识别**：在 `searchStore.ts` 中引入了 `detectLanguage` 助手，通过正则表达式实现对 **英语、中文、日语、韩语** 的精准分类识别。
- **AI 提示词重构**：重写了 `ai.ts` 中的 `getPhrasePrompt` 和 `getFullLookupPrompt` 逻辑。针对非英/中语种，AI 任务重心从“语言解析”转向“翻译+文化解读”，显著提升了跨语言搜索的质量。
- **新增「文化背景 & 趣味百科」模块**：
    *   **业务逻辑**：在 `PhraseResult` 和 `AiFullResult` 类型中新增 `culturalLore` 字段。
    *   **内容呈现**：AI 会自动输出包含“历史背景”、“流行原因”及“亚文化/圈层（二次元、游戏等）”背景的信息。
    *   **UI 落地**：在 `AiFullView.tsx` 和 `PhraseView.tsx` 中新增了靛蓝色主题的百科卡片，支持展示多维度的背景知识。

### 2. 搜索框 UI/UX 深度打磨 (SearchBar Redesign)
- **内嵌式智能操作组**：
    *   **结构优化**：废弃了原有的分离式按钮布局，将清空按钮、智能搜索（AI）与普通搜索整合进一个 P1 级的操作组容器。
    *   **视觉细节**：使用 `bg-foreground/5` 背景色与 `w-[1px]` 的极细分割线实现视觉分区，操作组整体具备圆角溢出裁剪。
- **图标语义升级**：
    *   **星星图标**：将 AI 按钮图标从 Sparkle 更换为更高级的繁星样式 (`M5 3v4M3 5h4...`)。
    *   **交互动效**：按钮点击时引入 `active:scale-95` 反馈，整体过渡更加顺滑。
- **布局回归**：将模式切换控件 (Segmented Control) 重新放置于搜索框正下方，优化了单手操作的便利性与界面重心。

### 3. 系统兼容性与细节修复 (System Fixes)
- **Tauri/Webkit 视觉 Bug 修复**：在 `index.css` 中添加针对 `::-webkit-search-cancel-button` 等伪元素的 `appearance: none` 规则，彻底消除了 Tauri 环境下搜索框内多余的蓝色系统自带取消按钮。
- **图标渲染修复**：解决了 SearchBar 中因 SVG 路径嵌套导致的图标重叠显示瑕疵。
- **跨语言查词逻辑优化**：在 `db.web.ts` 的 `suggest` 函数中新增了中文检索支持，允许通过输入中文释义反向联想出英文单词建议。

---


### Bug 1：Sticky 图片在 Tauri/PC 端失效

**根因**：App.tsx 重构后新增了 sticky header（`h-14 + pb-4` = 72px），ImageTranslateView 的两个 sticky 容器仍用 `top-safe`（PC 上 = `top: 0px`）。两者同时争占 `top: 0`，图片被 header（z-20）遮盖，滚动时视觉上消失。

**修复**：
- `src/index.css`：新增 `.top-header-offset { top: calc(72px + env(safe-area-inset-top, 0px)) }`，精确对齐 App header 底部（含 iOS 安全区兼容）。
- `src/components/ImageTranslate/index.tsx`：嵌字模式和翻译列表模式的 sticky 容器，`top-safe` → `top-header-offset`。

### Bug 2：嵌字模式背景色调/饱和度滑条无效果

**根因**：`ImageEditor.tsx` 的 `adjustColor()` 用 `s * opts.saturation` 计算饱和度。白色漫画气泡的采样背景色 `s ≈ 0`（近乎无彩色），任何值乘 0 仍为 0，导致色调和饱和度滑条均无视觉效果。透明度单独用 `ctx.globalAlpha` 设置，不走此逻辑，因此透明度一直正常。

**修复**（`ImageEditor.tsx` `adjustColor` 函数）：
- 饱和度滑条 > 1 时改为 additive boost（向满饱和度线性趋近），不再是乘法，白底也能加色。
- 色调滑条非零时，强制最低饱和度 `Math.min(0.55, |hue| / 180 * 0.6)`，确保白色气泡在调整色调时可见染色效果。

---

## 2026-05-04 — 配置清理：移除 Capacitor 8 中无效的 adjustMarginsForEdgeToEdge

### 问题根因
`capacitor.config.ts` 的 `android` 块中存在 `adjustMarginsForEdgeToEdge: true` 配置项。经核实，该字段在 `@capacitor/cli@8.x` 的类型定义中不存在，TypeScript 不报错是因为 `android` 字段有宽松的 `[key: string]: any` 签名，但运行时完全无效，属于死配置。

### 修复
- 删除 `capacitor.config.ts` 中的 `android: { adjustMarginsForEdgeToEdge: true }` 整块。
- Android 15+ 强制全屏的安全区问题已由 `index.css` 中的 `.pt-safe / .pb-safe / .top-safe` CSS 工具类（使用 `env(safe-area-inset-*)` 变量）正确处理，无需额外配置。

### 同步更新 CLAUDE.md
- 修正 `windowSoftInputMode` 的记录值为实际值 `adjustResize`（原文档误写为 `adjustPan`）。

---

## 2026-05-04 — 搜索界面布局优化、空间压缩与溢出修复

### 1. 搜索区域纵向布局压缩 (Vertical Space Optimization)
- **空间节约**：将原先垂直排列的“Dictionary/Image”大标题重构为顶栏 (Sticky Header) 内的胶囊式分段切换按钮。这一改动大幅缩减了页眉高度，显著提升了搜索结果的有效可视面积。
- **布局一体化**：将搜索框、模式切换按钮的垂直间距从 `space-y-6` 优化为 `space-y-4`，组件衔接更紧凑，整体视觉重心更趋向核心内容。

### 2. 模式切换控件 Bug 修复与升级 (Segmented Control)
- **溢出修复**：彻底解决了在特定宽度下“AI Mode”按钮超出滑块框架的布局 Bug。通过重构滑块的 `calc` 逻辑并强制文字不换行 (`whitespace-nowrap`)，确保了布局在各种窄屏下的稳健性。
- **语义升级**：将“AI Mode”更名为更具操作导向的 **“AI Lookup”**，提升了功能的语义清晰度。
- **滑块动画微调**：修正了滑块的起始位移逻辑，确保在切换时滑块背景能精准覆盖选中文字，消除视觉偏移。

### 3. 视觉美化与细节打磨 (Polishing)
- **Tab 交互增强**：Dictionary/Image 切换按钮引入了柔和的背景阴影与缩放反馈，体验更接近原生移动应用。
- **深色模式适配**：优化了深色模式下分段控件的背景色对比度，使其在极暗背景下依然保持清晰的层次感。

---

## 2026-05-04 — UI/UX 重构、逻辑统一与多平台交互修复

### 1. 高级分段控件 (Segmented Control)
- **位置重置**：将 `Instant / AI Mode` 模式切换开关从搜索框下方移至正上方，符合 Google/iOS 大厂主流搜索布局逻辑。
- **高级动效**：重构为分段选择器，引入了平滑的滑动背景动画（Sliding Background），显著提升了操作的物理感与视觉反馈。
- **色彩和谐**：深度适配 `var(--color-accent)` 等主题变量，确保在 Light/Dark Mode 下滑块与文字的对比度、投影均达到 Premium 级别。

### 2. 搜索交互逻辑统一 (Unified Search Logic)
- **冗余清理**：移除了搜索框内独立的 "AI" 小按钮，将所有搜索意图合并至右侧统一的“搜索”按钮。
- **逻辑收口**：重写了 `SearchBar` 的提交逻辑，无论是键盘回车、点击搜索图标、还是选择历史/建议词，全部调用统一的 `handleSelect` 状态机。
- **原生键盘适配**：引入 `<form>` 容器并配置 `enterkeyhint="search"`，使 Android/iOS 原生键盘的“搜索”键能直接触发应用内逻辑，体验更接近原生 App。

### 3. Tauri & 移动端历史记录交互修复
- **点击竞争修复**：针对 Tauri 和移动端 WebView 常见的“失焦导致点击失效”问题，将下拉列表的点击事件改为 `onMouseDown` 优先捕获，确保在列表卸载前搜索动作已成功发出。
- **失焦逻辑优化**：在搜索完成后主动调用 `inputRef.current.blur()`，优化了移动端软键盘自动收起的连贯性。

### 4. 跨平台安全区与 CSS 增强
- **多版本 Android 适配**：增强了 `index.css` 中的 `.pt-safe` 等工具类，增加变量回退机制以兼容 Android 8、10、14+ 不同系统对 `env(safe-area-inset-top)` 的差异化表现。
- **玻璃效果升级**：优化了 `.glass` 类的模糊度 (16px) 与边框色，使其在深色模式下更具质感。

### 5. 代码质量与清理
- **移除冗余组件**：删除了已被替代的 `ModeToggle.tsx`。
- **精简 App.tsx**：移除了 `App.tsx` 中过时的 `handleForceAi` 逻辑与未使用的历史存储导入，通过 build 校验确保无死代码。

---

## 2026-05-03 — 移动端键盘深度优化、嵌字架构合并与 AI 稳健性增强

### 1. 移动端键盘遮挡终极方案 (iOS/Android 8-16)
- **多版本适配**：重写了 `App.tsx` 中的键盘监听逻辑，同时支持 `keyboardWillShow` 和 `keyboardDidShow` 事件，确保从 Android 8 到最新 Android 16 的全版本兼容。
- **动态视口计算**：放弃了硬编码的 padding，改为根据 `window.innerHeight` 和 `keyboardHeight` 动态计算剩余可见空间，确保输入框始终能完美平滑滚动到屏幕中心。
- **Edge-to-Edge 适配**：在 `capacitor.config.ts` 中开启 `adjustMarginsForEdgeToEdge`，配合 `viewport-fit=cover` 彻底解决 Android 15+ 强制全屏模式下的手势条遮挡与“黑条”问题。
- **主题背景同步**：确保键盘弹起后的 padding 区域颜色与系统暗黑/亮色模式背景色自动同步，消除视觉断层。

### 2. 漫画嵌字模式架构合并 (Consolidation)
- **图层逻辑统一**：合并了 L1（背景清理）和 L2（译文渲染）在 UI 层的展示逻辑，不再区分“背景层”和“文字层”卡片。现在每个文本块在 `TranslationList` 中只对应一个卡片，降低了操作复杂度。
- **简化交互**：移除了 `BlockOverlay` 中的图层选择状态，点击图中任意文本块即可直接呼出包含背景颜色（色调/饱和度/不透明度）和译文编辑的综合面板。
- **属性透明化**：根据块是否包含多边形轮廓，自动切换读写底层属性（`l1Color*` vs `color*`），对用户保持界面一致性。

### 3. AI 交互稳健性与 Token 优化
- **正则 JSON 提取**：升级了 `services/ai.ts` 的解析引擎，使用更强大的正则提取逻辑（`match(/\{[\s\S]*\}/)`）从 AI 的回复中精准剥离 JSON，彻底杜绝了因 AI 多嘴（输出 Markdown 代码块或前言）导致的 `invalid json` 错误。
- **模块化 Prompt 生成**：查词、深度解析及词组查询的 Prompt 现在会根据用户在设置中开启/关闭的模块（词源、近义词、例句、助记等）动态生成。未开启的功能不会出现在 Prompt 中，既减少了 Token 消耗，也提升了 AI 逻辑的专注度。

### 4. UI/UX 体验细节优化
- **语义场景折叠**：在结果页中为「语义情景」模块增加了折叠功能。对于词典命中词默认折叠以保持整洁，对于 AI 全量查词则保持展开。
- **模块管理系统**：在设置面板新增「模块管理」功能，支持一键开关或通过上下箭头调整各个 AI 功能模块的显示顺序。

### 5. 结果页动态渲染引擎与排序逻辑修复
- **全动态渲染架构**：重构了 `ResultView`、`AiFullView` 及 `PhraseView` 的核心渲染逻辑。通过 `modules.map` 循环取代了原有的硬编码布局，实现了查词结果模块与设置中「模块管理」定义的顺序及开关状态的完全同步。
- **实时交互反馈**：在结果页组件中直接接入 `useSettingsStore` 状态。现在用户在设置抽屉中拖拽调整模块顺序或切换开关时，背景中的结果页会立即实时重绘，实现了“调整即所得”的流畅交互体验。
- **组件原子化重组**：将 `AiSection` 和 `InstantSection` 中的子功能块（近义词辨析、词源、助记、练习等）拆解为独立的原子组件，由主视图统一调度渲染。这种“平铺”结构彻底解决了排序难题，同时也精简了组件层级。

---

## 2026-05-02 — 助记功能恢复与 UI 全量抗溢出优化

### 1. 助记功能 (Mnemonics) 找回
- **深度模式适配**：修复了 `AiFullView`（生僻词深度解析模式）下助记卡片（MnemonicCard）缺失的回归 Bug，确保深度解析同样享有三种 AI 记忆策略。
- **状态持久化**：在 `ResultStore` 中新增 `updateFullMnemonic` 逻辑，支持深度模式下的助记切换缓存，保证“秒开”体验与数据一致性。

### 2. 全布局 UI 抗溢出处理 (Layout Robustness)
- **长单词换行**：为 `WordHeader` 单词标题添加 `break-words` 和 `overflow-hidden`，彻底解决长单词在移动端溢出容器的问题。
- **搜索组件抗压**：对搜索框、建议列表（SuggestList）、历史记录（HistoryList）中的文本项全面应用 `min-w-0` 与 `truncate`（省略号）策略，确保在窄屏下不挤压操作按钮。
- **侧边栏防护**：设置面板增加 `max-w-full`，防止在极端缩放或超窄设备下产生横向滚动条。

---

## 2026-05-02 — 搜索历史逻辑修复与移动端 UI 布局优化

### 1. 搜索历史记录增强
- **AI 模式历史持久化**：修复了点击“AI”按钮或通过 `Ctrl+Enter` 触发强制 AI 查询时，搜索词未被计入历史记录的问题。
- **句子查询支持**：确保长句及复杂短语在 AI 模式下也能正确同步到 `lexicon-history` 存储中。

### 2. 搜索框移动端适配优化 (iOS/Android 9/Tauri)
- **Flex 容器溢出修复**：为搜索输入框添加 `min-w-0`，解决在窄屏设备上 Input 无法收缩导致“AI”按钮被挤出搜索框甚至屏幕外的布局 Bug。
- **组件抗压优化**：为搜索图标及操作按钮组添加 `shrink-0`，确保在任何屏幕宽度下图标不被压缩变形。
- **边界剪裁**：搜索框容器新增 `overflow-hidden`，确保在极端缩放或动画过程中子元素不会溢出圆角边框。

---

## 2026-05-02 — 嵌字错误文案修正 + 代码审查

### 代码审查与微调
- **嵌字错误提示文案修正**：Phase 2 已改为 AI 视觉定位，但错误提示仍显示"OCR 失败"，现已更正为"AI 定位失败"。
- **其余逻辑审查结论**：历史记录 AI 缓存自动恢复逻辑（有缓存即进入 AI 模式）、非嵌字模式不显示颜色控制（刻意设计）、AI 状态机流转均无异常。

---

## 2026-05-02 — 嵌字定位、助记体验与交互 Bug 修复

### 1. 嵌字模式定位系统重写（根治位置错误）
- **问题根因**：Phase 2 嵌字使用 Tesseract OCR 文字相似度匹配，日语漫画场景下匹配几乎全部失败，所有色框退化到左列 fallback 坐标（`x:0.05, y:0.05+n×0.08`），导致截图中看到全部方块堆在图片左侧。
- **修复**：Phase 2 改回使用 `aiImageTranslateFull`（AI 视觉直接识别对话框边界），相比 OCR 更能理解漫画气泡的不规则形状和多边形轮廓。
- **译文保留**：新增 `mergePhase1Translations` 函数，将用户在 Phase 1 列表中编辑过的译文（按原文字符相似度匹配）迁移到 Phase 2 的定位块上，不丢失任何编辑。
- **Bundle 优化**：移除了 `ocr.ts` 在 Phase 2 中的调用，Tesseract.js 不再被打包，bundle 减小约 15KB。

### 2. 背景色调整滑条修复
- **问题根因**：`ImageEditor` Pass 1 背景填充始终读取 `block.l1ColorHue`（默认 0），而 TranslationList 的滑条写入的是 `block.colorHue`（无 l1 前缀），两个字段完全不同 → 拖动滑条画面没有任何变化。
- **修复**：非多边形块的 `l1ColorOpts` 改为读 `colorHue / colorSaturation / colorOpacity`；多边形块（通过 L1 卡片控制）仍读 `l1ColorHue / l1ColorSaturation / l1ColorOpacity`，两套控件各司其职。

### 3. Sticky 图片失效修复（Tauri / PC 端）
- **问题根因**：`index.css` 中只定义了 `pt-safe / pb-safe / mt-safe / mb-safe`，唯独缺少 `.top-safe`，导致嵌字模式和翻译列表的 `sticky top-safe` 容器没有有效的 `top` 值，滚动时图片不会固定在顶部。
- **修复**：在 `index.css` 补充 `.top-safe { top: env(safe-area-inset-top, 0px) }`。

### 4. 助记卡片类型选择体验重构
- **助记类型 Tab**：生成助记后展示三个 Tab（词源逻辑 / 趣味故事 / 智能联想），每个 Tab 下方显示 AI 对该类型的推荐分数（首次生成时锁定，切换 Tab 不跳变）。
- **Tab 切换**：已生成的类型缓存在组件内，切换回已访问的类型立即显示，不重复调用 API。
- **词组模式差异化**：词组/短语的助记不支持类型强制，隐藏三个 Tab，改为内容卡片右下角"换一个"悬浮按钮。
- **错误定位修复**：类型切换失败时错误提示内联显示在 Tab 下方，而非出现在卡片外部。

### 5. 历史记录查询修复
- **下拉框遮挡**：SearchBar 下拉容器始终存在于 DOM（即使无内容），空的 `z-50` 浮层遮挡了下方词条的点击事件。修复：改为 `(showSuggestions || showHistory)` 条件渲染。
- **AI 缓存自动恢复**：点击历史记录词条时，若该词有 AI 分析缓存，自动恢复缓存并切换到 AI 模式展示，无需重新调用 AI。

---

## 2026-05-01 — AI 深度助记系统与数据持久化全量上线

### 1. 核心特性：AI 触发式助记 (Mnemonics)
- **多策略记忆算法**：为单词引入了「词源逻辑 (Philology)」、「趣味故事 (Story)」与「智能联想 (Smart)」三种助记模式。
- **AI 评估与推荐系统**：AI 会自动评估各模式的潜力并打分 (0-100)，优先推荐逻辑性最强的记忆方案，并在卡片顶部展示推荐理由与得分仪表盘。
- **词组母语者逻辑**：新增「词组/短语专用助记」。针对介词搭配（如 `pop in`），通过解析介词的核心意象（Core Image）还原母语者的直觉思考，告别死记硬背。

### 2. 性能与数据管理 (Persistence & Data)
- **全量会话持久化**：接入 Zustand 持久化中间件，所有生成的 AI 分析结果都会同步至本地。再次查看历史记录时可“秒开”内容，且**零 Token 消耗**。
- **LRU 智能缓存机制**：实现了「最久未使用 (Least Recently Used)」缓存清理策略，自动保持 100 条最常用数据的活性，确保本地存储精简且高效。
- **数据透明化看板**：在设置页面新增「数据管理」模块，支持实时查看 AI 缓存占用大小，并提供一键清理历史记录与缓存的功能。

### 3. UI/UX 体验与稳健性
- **词性标注精准化**：重构了词典查询逻辑，支持在同一单词下展示多个独立词性标签（Badge），确保每个释义项都能对应准确的语法属性。
- **并发请求控制**：引入 `AbortController` 机制，在快速切换单词或关闭界面时自动中止未完成的 AI 请求，防止状态溢出与资源浪费。
- **视觉优化**：优化了助记卡片的图标系统（如 Sparkles 智能图标）、版式权重与交互反馈。

### 4. 逻辑修复
- **缓存唯一性修复**：修复了重复搜索可能导致缓存冗余的潜在风险，确保每个独立条目仅占用一个缓存名额。
- **状态同步优化**：解决了关联词跳转时旧数据残留的 UX Bug。

---

## 2026-05-01 — 嵌字模式 (Embed Mode) 定位与渲染全量重构 (v0.6.0)

### 核心改进：从“AI 猜位置”到“OCR 工业级对位”

**1. OCR 粒度升级 (Line-level Detection)**
- **技术变更**：将 Tesseract.js 的检测级别从 `blocks` 切换为 `lines`。
- **价值**：解决了 Tesseract 经常将不相关的多个气泡错误合并的问题，提供了最高精度的原始坐标。

**2. 空间约束的贪婪匹配算法 (Spatial Greedy Match)**
- **逻辑**：AI 块（Phase 1）现在可以匹配多个 OCR 行。
- **防重复机制**：引入空间距离校验（30% 阈值）。如果两个“Hello”分别在图片两角，系统会识别出它们是不同实例，不再错误地将它们连成一个横跨全图的巨型框。
- **几何联合**：自动计算所有匹配行的最小外接矩形（Union），确保多行气泡能被完整覆盖。

**3. “清理 -> 填词” L1/L2 架构重塑**
- **背景遮罩 (L1) - 始终开启**：不再依赖手动绘制多边形。系统会自动根据 `bubble`（椭圆）或 `caption`（圆角矩形）类型生成底层遮罩，先行“抹除”原文字。
- **译文文字 (L2) - 独立渲染**：L2 现在是透明层，只负责在 L1 清理出的空地上进行文本填充。彻底解决了两层颜色冲突或边缘锯齿问题。
- **UI 语义化**：标签由 `L1/L2` 更名为更直观的 `背景遮罩 (L1)` 和 `译文文字 (L2)`。

**4. 几何感应渲染与安全区 (Geometric-Aware)**
- **气泡椭圆化**：`bubble` 类型默认使用椭圆遮罩，完美契合 90% 的漫画对话框。
- **遮罩外扩 (2px Outset)**：遮罩自动向外扩张 2 像素，确保覆盖原文字边缘的阴影和抗锯齿毛边。
- **安全区排版 (Safe Area)**：为文字渲染预留 10-15% 的内缩边距，确保文字不撞边，且在椭圆中自动居中。

**5. UX 细节优化**
- **智能采样内缩**：背景色采样点向内收缩 2px，避开黑色气泡框。
- **进度可视化**：嵌字按钮实时显示 OCR 进度百分比。
- **语言感知拼接**：针对 CJK 语言取消多行合并时的空格，保持原文整洁。

### 相关文件
- `src/services/ocr.ts`：核心匹配算法与空间校验
- `src/components/ImageTranslate/ImageEditor.tsx`：两阶段渲染逻辑与几何适配
- `src/components/ImageTranslate/index.tsx`：进度状态维护与 UI 联动
- `src/components/ImageTranslate/TranslationList.tsx`：语义化标签更新

---

## 2026-04-22 — v0.5.4 发版

### 包含内容
- Android 键盘遮挡终极方案（详见 2026-04-21 v5 条目）
- 补齐 App.tsx 缺失的 `@capacitor/device` 导入（老 Android 运行时崩溃修复）
- 同步 Android `versionName` / iOS `MARKETING_VERSION` 至 `0.5.4`（此前写死 `1.0`，导致 app 详情页显示错误版本）
- Android `versionCode` 1 → 2、iOS `CURRENT_PROJECT_VERSION` 1 → 2

---

## 2026-04-21 — Android 键盘遮挡终极解决方案 v5（新老设备动态适配）

### 最终结论与发现
- **新版 Android (API > 29, 比如 Android 11+)**：系统原生的 Edge-to-Edge 和 `adjustResize` 已经足够完善。强行用 JS 加 padding 或干预，反而会引发异常。对于这类设备，我们选择完全退让，交由系统原生处理。
- **老版 Android (API <= 29, 比如 Android 10)**：系统在处理 WebView 的 `adjustResize` 时存在严重 Bug（会暴露出底层黑色的 DecorView，即用户看到的巨大"色块"）。同时，在此系统下开启 `adjustPan` 会导致 Capacitor Keyboard 插件的 `keyboardDidShow` 事件失效，导致 JS 失去响应能力。
- **动态隔离方案**：我们在同一个代码库中，通过 Native 层和 JS 层的双重系统版本检测，对新老设备分发两套完全不同的适配逻辑，彻底化解了碎片化深坑。

### 核心改动

**1. 原生层 (Native) 动态隔离**：
- `AndroidManifest.xml`：将 `windowSoftInputMode` 恢复为现代标准的 `adjustResize`。
- `MainActivity.java`：在 `onCreate` 中加入版本判断，若是 `SDK_INT <= 29` (Android 10 及以下)，则将当前窗口模式强制篡改为 `adjustPan`，彻底封杀原生渲染黑洞。

**2. 前端层 (JavaScript) 动态隔离**：
- 引入 `@capacitor/device` 官方插件。
- `src/App.tsx`：在 React 挂载时异步获取系统真实版本（`osVersion`）。
- **如果是老安卓（<= 10）**：挂载专用的 `focusin` / `focusout` 事件监听器。点击输入框瞬间，无视失效的 Capacitor 键盘事件，直接给当前滚动容器暴力塞入 `paddingBottom: 400px`，并延迟 150ms 强制 `scrollIntoView({block: 'center'})`。因为此时应用处于 `adjustPan` 全屏模式，这 400px 被完美藏在键盘后方，绝不产生可见色块！
- **如果是新安卓（> 10）**：不注册任何 JS 键盘监听器，完全信任系统原生的 `adjustResize` 缩放，保持与 v0.5.2 原版一致。

### 状态
- **色块问题彻底解决** ✅（老版本用 adjustPan 掩盖，新版本原生无此 Bug）
- **输入框遮挡彻底解决** ✅（老版本用强力 focusin 撑开居中，新版本系统原生处理）
- **多设备兼容性达成** ✅（一套代码，同一个 APK，无缝自动适配不同年代的 Android 系统）

---

## 2026-04-21 — Android 键盘遮挡 v4（色块消除，遮挡未解决）

### 结论

- **色块问题已彻底解决** ✅
- **输入框被键盘遮挡问题仍未解决** ❌（多次尝试均无效，暂搁置）

### 最终配置

- `AndroidManifest.xml`：`android:windowSoftInputMode="adjustPan"`
- `capacitor.config.ts`：`Keyboard: { resize: 'none' }`
- `src/App.tsx`：
  - 移除 `keyboardHeight` state 和 `paddingBottom`（这两个本身就是色块来源）
  - 新增 `getScrollableAncestor()` 辅助函数，查找最近可滚动祖先
  - 键盘监听从 `keyboardWillShow` 改为 `keyboardDidShow`（等 pan 动画完成）
  - 滚动目标从固定的 `scrollContainerRef` 改为动态祖先查找
  - 滚动计算：`overshoot = elRect.bottom - (window.innerHeight - kbHeight - 8)`

### 色块消除的关键

色块来自两处叠加：
1. `adjustResize` + `resize: 'none'` 的设置冲突（Android 缩 WebView，Capacitor 不让响应 → 底部 native 层露出）
2. JS 主动加的 `paddingBottom: keyboardHeight` 本身就是一块空白

切到 `adjustPan` + 移除 `paddingBottom` 后色块消失。

### 遮挡未解决的可能原因（留给未来自己）

- `adjustPan` 模式下，`fixed` 元素（如 SettingsDrawer）不随窗口上移，键盘直接盖住
- `scrollBy` 对 fixed 容器内部的 `overflow-y-auto` 滚动无视觉效果（因为 fixed 容器位置不变）
- 可能需要 CSS 层解决：键盘显示时给 fixed 容器一个 `transform: translateY(-kbHeight)` 或动态调整高度
- 或改回 `adjustResize` 并彻底重构 CSS 避免色块（但代价大）

---

## 2026-04-21 — Android 虚拟键盘遮挡修复 v3 - 调试会话记录（未解决）

### 背景

用户反馈 Android 虚拟键盘遮挡问题：
- AI 聊天输入框已经工作正常（之前已修复）
- 其他输入框仍有问题：设置抽屉中的输入框（模型选择、API key 输入）、搜索框、翻译文本框
- 点击输入框时出现"黑色方块"遮挡 UI
- 用户明确要求：不想要任何色块（黑色、白色或透明），因为这会遮挡内容且无法操作

### 尝试的方案

**方案 1：恢复 adjustResize + scrollIntoView**
- AndroidManifest.xml: 添加 `android:windowSoftInputMode="adjustResize"`
- capacitor.config.ts: Keyboard 插件 `resize: 'none'`
- App.tsx: 使用 `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- 结果：滚动成功，但出现色块

**方案 2：使用 visualViewport API**
- App.tsx: 监听 `visualViewport.resize` 事件
- 结果：未解决，被移除

**方案 3：使用 focusin/focusout 事件**
- App.tsx: 监听 `focusin` 和 `focusout` 事件
- 结果：未解决，被移除

**方案 4：Capacitor Keyboard 插件不同配置**
- 尝试 `resize: 'none'`、`resize: 'body'`、`resize: 'ionic'`
- 结果：均未解决问题

**方案 5：adjustPan 模式**
- AndroidManifest.xml: 改为 `android:windowSoftInputMode="adjustPan"`
- capacitor.config.ts: Keyboard 插件 `resize: 'body'`
- 结果：色块消失，但自动滚动失效，输入框被键盘遮挡

**方案 6：移除 JavaScript 滚动逻辑**
- App.tsx: 移除所有 scrollIntoView 逻辑，让 adjustPan 自然处理
- 结果：无色块，但输入框被键盘遮挡

**方案 7：移除高度约束**
- SettingsDrawer.tsx: 移除 `h-full`，添加 `bottom-0`
- App.tsx: 移除 CSS `overscroll-behavior: none`
- 结果：未解决

**方案 8：调整 windowBackground 颜色**
- values/styles.xml: 改为白色 (#F9FAFB)
- values-night/styles.xml: 改为白色 (#FFFFFF)、然后改为暗色 (#030712)
- 结果：色块仍然存在

**方案 9：使用 Capacitor Keyboard 插件读取键盘高度**
- App.tsx:
  - 添加 `keyboardHeight` 状态
  - 监听 `keyboardWillShow` 事件获取键盘高度
  - 给滚动容器添加 `paddingBottom` 等于键盘高度
  - 使用 `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- 结果：色块再次出现，输入框跑到顶端

**方案 10：手动计算滚动位置**
- App.tsx: 移除 `scrollIntoView`，手动计算滚动位置
  ```typescript
  const targetScrollTop = scrollContainer.scrollTop + elementRect.top - containerRect.top - keyboardHeight + 20
  ```
- 结果：色块仍然存在，输入框仍跑到顶端

**方案 11：窗口背景改为透明**
- values/styles.xml: 改为 `@android:color/transparent`
- values-night/styles.xml: 改为 `@android:color/transparent`
- 结果：色块仍然存在

### 用户发现的关键悖论

用户在调试过程中发现了两个规律：
1. 要么成功滚动了，但是出现了一个巨大的色块遮挡
2. 要么色块确实不存在了，但是自动滚动失效了，输入框又被键盘遮挡了

用户提出的根本原因假设：
- 我们没有即时读取键盘的高度，所以不可避免地，不知道这玩意要向上滚动多少

### 当前状态

- 色块问题仍未解决
- 输入框滚动到正确位置（键盘上方）仍未实现
- 用户决定休息，暂停调试

### 修改的文件

- `android/app/src/main/AndroidManifest.xml`：多次修改 windowSoftInputMode
- `capacitor.config.ts`：多次修改 Keyboard 插件 resize 模式
- `src/App.tsx`：多次修改键盘处理逻辑（visualViewport、focusin、scrollIntoView、手动滚动计算）
- `src/components/Settings/SettingsDrawer.tsx`：移除高度约束
- `src/index.css`：移除 overscroll-behavior: none
- `android/app/src/main/res/values/styles.xml`：修改 windowBackground 为透明
- `android/app/src/main/res/values-night/styles.xml`：多次修改 windowBackground（白色、暗色、透明）

---

## 2026-04-21 — Android 虚拟键盘遮挡修复 v2 (v0.5.4)

### 改动

- **恢复 visualViewport.resize 监听**：之前添加的 visualViewport 监听被移除，导致除 AI 问答框外的其他输入框（搜索框、翻译文本框、设置输入框）在页面底部时仍被键盘遮挡。现恢复该监听，与 `adjustResize` 配合使用，确保所有输入框在键盘弹出时自动滚动到可见区域。
- **双重保障机制**：`adjustResize`（AndroidManifest）处理 WebView 窗口调整，`visualViewport.resize`（App.tsx）处理输入框滚动定位，两者配合解决所有场景的键盘遮挡问题。

### 修改文件

- `src/App.tsx`：恢复 visualViewport.resize 监听（仅 Android Capacitor）

---

## 2026-04-20 — Android 虚拟键盘遮挡修复 (v0.5.3)

### 改动

- **Android 输入框被键盘遮挡**：在 Android 上，底部输入框（如 AI 对话框）弹出虚拟键盘后会被遮住，看不到输入内容。新增 `visualViewport` resize 监听，键盘弹出时自动将焦点输入框 `scrollIntoView`，确保始终可见。iOS 原生已处理此问题，PC 无虚拟键盘，均不受影响。
- **代码简化（/simplify）**：提取 `findScrollContainer` 工具函数消除重复的 DOM 遍历；切图滚动逻辑用 `hasMountedRef` 替代 `prevIndexRef`，语义更清晰；缓存滚动容器引用避免重复遍历；新增 `cancelAnimationFrame` 清理防止组件卸载后回调残留。

### 修改文件

- `src/App.tsx`：新增 `visualViewport` resize 监听（仅 Android Capacitor）
- `src/components/ImageTranslate/index.tsx`：提取 `findScrollContainer`；`scrollContainerRef` 缓存容器；`hasMountedRef` 替代 `prevIndexRef`；rAF 清理

---

## 2026-04-19 — 列表模式交互修复 (v0.5.2)

### 改动

- **切图跳至 sticky 位置**：切换图片后页面自动滚到图片恰好 sticky 吸顶的位置，图片固定在顶部，译文列表从第一条开始显示，方便沉浸式阅读
- **修复滚动容器检测**：改用 `useEffect` 监听 `currentIndex`（保证 DOM 更新后再测量），先 reset 到 0 再用 `getBoundingClientRect` 精确定位 stickyRef，解决 `offsetTop` 在内容切换后不准的问题

### 修改文件

- `src/components/ImageTranslate/index.tsx`：切图滚动逻辑改为 `useEffect` + 两步定位

---

## 2026-04-19 — 列表模式交互修复 (v0.5.1)

### 改动

- **平移守卫**：图片未放大（scale ≤ 1）时禁止平移，避免误触；仅在放大后 Ctrl+拖拽（PC）或单指拖拽（触屏）才触发平移
- **切图自动回顶**：切换图片（缩略图、左右箭头）后，页面和列表容器自动滚回顶部，避免多图阅读时列表停留在上一张的滚动位置

### 修改文件

- `src/components/ImageTranslate/ImageViewer.tsx`：`handleMouseDown` 和 `handleTouchMove` 加 `scaleRef.current > 1` 守卫
- `src/components/ImageTranslate/index.tsx`：`handleSwitchImage` 加 `scrollTo(top:0)`；prev/next 箭头按钮改用 `handleSwitchImage`

---

## 2026-04-18 — 多图批量翻译 (v0.5.0)

### 改动

- **多图上传**：上传区支持一次多选图片（`multiple`），同时支持拖拽多文件
- **图片列表导航**：有多张图时顶部显示缩略图横条，点击切换；翻译完成的图右下角显示绿点，翻译中显示转圈
- **左右方向键导航**：列表模式图片区左右两侧各有导航按钮，底部显示"当前/总数"计数器
- **批量并行翻译**：点"开始翻译全部"后所有图片同时发起 AI 请求，各自独立更新状态
- **各图独立数据库**：每张图有自己的翻译结果、状态、base64 缓存，互不影响
- **嵌字只针对当前图**：按钮改为"嵌字此图"，仅对当前显示图片操作
- **图片管理**：新增"+"追加图片、"删除"删当前图、"清空"清所有图（多图时出现）

### 修改文件

- `src/stores/imageStore.ts`：单图结构重构为 `ImageEntry[]` 数组；新增 `addImages/removeCurrentImage/clearAll/nextImage/prevImage/setCurrentIndex`；新增按索引操作的 `setBlocksAt/setStatusAt/setImageBase64At`
- `src/components/ImageTranslate/index.tsx`：批量翻译逻辑（`Promise.all`）；缩略图条、导航箭头、计数器 UI；按钮文案更新

---

## 2026-04-18 — 嵌字编辑体验修复 v2

### 改动

- **L1/L2 颜色字段彻底分离**：新增 `l1ColorHue/l1ColorSaturation/l1ColorOpacity` 独立字段，L1 滑块只影响多边形填充，不再串改 L2 文字层
- **ImageViewer resetTransform 修复**：先清除 CSS transform 再用 `offsetHeight` 测量自然尺寸，解决嵌字模式"重置视图"后图片仍被截断的问题（根因：transform 后的 `getBoundingClientRect` 返回缩放后的尺寸导致计算错误）
- **BlockOverlay 完整重写**：
  - 恢复 `HANDLE_STYLE` 常量（之前被另一个 AI 删除导致所有 8 个缩放控制点堆叠在左上角）
  - 修复多边形点添加 bug（之前把已归一化的 startNX/startNY 再传给 getPtr 做坐标换算，导致坐标完全错误）
  - 移除内部的"绘制L1多边形"浮动按钮，改为通过 prop `drawPolygonForIndex` 从父级控制
  - 新增 `drawPolygonForIndex / onPolygonDrawn` props，支持从列表触发绘制并回写到指定 block
- **L1 手动绘制多边形功能完整联通**：列表 L1 卡片"手动绘制L1"按钮 → BlockOverlay 进入十字光标绘制模式 → 点击依次添加顶点 → 3个点后可点首点闭合或点"完成"按钮 → `polygon` 直接更新到对应 block（bbox 同步为 polygon 包围盒）
- **`handleDrawL1` 实际生效**：index.tsx 新增 `drawPolygonForIndex` state，handleDrawL1 设置后传入 BlockOverlay，onPolygonDrawn 重置

### 修改文件

- `src/types/index.ts`：新增 `l1ColorHue/l1ColorSaturation/l1ColorOpacity` 字段
- `src/components/ImageTranslate/ImageEditor.tsx`：l1ColorOpts 使用独立 l1Color 字段
- `src/components/ImageTranslate/TranslationList.tsx`：L1 滑块改用 l1Color 字段；新增 `onDrawL1` prop 和"手动绘制L1"按钮
- `src/components/ImageTranslate/BlockOverlay.tsx`：完整重写，恢复 HANDLE_STYLE，修复多边形绘制逻辑，改为 prop 驱动模式
- `src/components/ImageTranslate/ImageViewer.tsx`：resetTransform 改用 offsetHeight 测量
- `src/components/ImageTranslate/index.tsx`：新增 drawPolygonForIndex state；handleDrawL1 联通 BlockOverlay

---

## 2026-04-17 — L1/L2 架构重构尝试（已回退）

### 背景

用户反馈：
- AI识别的文本框位置不准确（如7,8和4,6位置反了）
- AI误将某些块（如块8）同时分配L1和L2层
- 调整L1大小会影响L2文字，说明两层没有真正独立
- 需要AI通过清晰的格式/架构传达正确的位置指令给嵌字脚本

### 尝试的改动

- **新增数据结构**：在 `src/types/index.ts` 中添加 `TextRegion`、`L1Polygon`、`L2Text` 接口，实现L1/L2完全独立的数据架构
- **AI提示词更新**：在 `src/services/ai.ts` 中更新 `IMAGE_TRANSLATE_FULL_PROMPT`，添加3x3网格定位参考系统，要求AI返回新的JSON格式（`regions` 数组，包含 `id` 和 `visualReference` 字段）
- **AI服务解析更新**：修改 `callImageTranslateAPI` 函数以支持新的 `regions` 格式，同时保持向后兼容旧的 `blocks` 格式
- **渲染逻辑更新**：
  - `ImageEditor.tsx`：修改渲染数据结构，将L1（多边形背景）和L2（文本）的定位数据完全分离（`l1x/l1y/l1w/l1h` 和 `l2x/l2y/l2w/l2h`）
  - `BlockOverlay.tsx`：更新为L1/L2独立定位，分别渲染多边形层和文本层，支持按层选择（`selectedLayer` 参数）

### 用户反馈与结果

- **无效果**：用户回退了这些调整，表示没有达到预期效果
- **位置反而更乱**：用户反馈在这次调整前文本框位置基本正确，调整后位置又乱了
- **需求澄清**：用户澄清实际需求是：
  - AI识别对话框后，精确绘制多边形范围
  - 用白块遮挡原文
  - 文本框可以自由放在白块上层，不受白块多边形形状限制
  - L1/L2命名容易误解，实际是"白块层"和"文本层"

### 结论

此次架构重构尝试未能解决问题，反而引入了新的位置混乱。用户已回退所有改动，需要重新评估方案。

### 修改文件（已回退）

- `src/types/index.ts`：新增 TextRegion、L1Polygon、L2Text 接口
- `src/services/ai.ts`：更新 IMAGE_TRANSLATE_FULL_PROMPT 和 callImageTranslateAPI 解析逻辑
- `src/components/ImageTranslate/ImageEditor.tsx`：更新渲染逻辑使用分离的L1/L2定位数据
- `src/components/ImageTranslate/BlockOverlay.tsx`：更新为L1/L2独立定位渲染

---

## 2026-04-17 — 嵌字体验修复（v0.4.6 补丁）

### 改动

- **导出图片按钮移位**：从 sticky 图片区域内移到列表顶部（sticky 下方），不再遮挡图片编辑区域
- **L2 文字层固定使用原始矩形 bbox**：Pass 2 渲染始终用 AI 返回的原始 `x,y,w,h`，不再使用 polygon 包围盒，且不传 `polyPixels` 给渲染函数，彻底避免异形轮廓导致文字跑出对话框
- **点击图中文本框滚动列表修复**：原先用 `window.scrollTo` 无效（App 的滚动容器是 `overflow-y-auto` div，不是 window）；改为动态向上遍历找到最近可滚动祖先，用 `container.scrollTo` 精确定位，sticky 高度作偏移

### 修改文件

- `src/components/ImageTranslate/ImageEditor.tsx`：Pass 2 改用原始 bbox；不传 polyPixels
- `src/components/ImageTranslate/index.tsx`：ExportButton 移出 sticky；handleSelect 改用滚动容器而非 window

---

## 2026-04-17 — L1/L2 分离修复与功能增强

### 改动

- **L1/L2 颜色属性分离修复**：修复 L1（多边形背景）颜色控制错误使用 L2 属性的问题，现在 L1 调整只影响多边形填充，不影响 L2 文字
- **手动 L1 多边形绘制功能**：新增手动绘制 L1 多边形功能
  - 点击"绘制L1多边形"按钮进入绘制模式
  - 点击添加顶点，点击起始点附近完成多边形（至少3个点）
  - 实时显示多边形轮廓和顶点指示器
  - 完成后自动创建带多边形的新文本块
- **重置视图功能修复**：修复嵌字编辑模式下重置视图不能完整显示图片的问题
  - 计算合适的缩放比例以适应容器高度限制（max-h-[50vh]）
  - 确保图片在高度和宽度约束下完全可见
- **TranslationList 手动绘制按钮**：为多边形块的 L1 层添加"手动绘制L1"按钮

### 修改文件

- `src/components/ImageTranslate/TranslationList.tsx`：L1 颜色控制改用 l1ColorHue/l1ColorSaturation/l1ColorOpacity；添加手动绘制L1按钮
- `src/components/ImageTranslate/BlockOverlay.tsx`：新增多边形绘制模式状态、SVG 覆盖层、点击添加顶点逻辑、自动闭合多边形功能
- `src/components/ImageTranslate/ImageViewer.tsx`：resetTransform 函数增强，支持容器约束下的合适缩放
- `src/components/ImageTranslate/index.tsx`：添加 handleDrawL1 回调并传递给 TranslationList

---

## 2026-04-17 — 嵌字多边形气泡支持 v0.4.6

### 改动

- **TextBlock 新增 `polygon` 字段**：`Array<{x,y}>` 归一化坐标，描述气泡精确轮廓（bubble/caption 类型）
- **TextBlock 新增 `rotation` 字段**：`number`（角度），default 0，用于旋转文字块
- **AI Full Prompt 更新（两次）**：
  - 第一次：要求 AI 为 bubble/caption 块返回 `polygon` 顶点；CoT 提示词 + 刺形气泡内侧边界指引
  - 第二次：加「关键规则」防止串位——要求 AI 先统计所有文字区域再逐个处理，明确每个 block 的 original 必须是该 bbox 位置实际看到的文字
- **双层两阶段渲染架构（Pass 1 / Pass 2）**：
  - Pass 1：所有 polygon 块先统一 fill 多边形区域（Layer 1）
  - Pass 2：所有块的译文文字统一画在最顶层（Layer 2），保证永远不被 Pass 1 覆盖
  - 两个 pass 均支持 `rotation` 旋转变换
- **L1/L2 颜色语义分离**：
  - L1（polygon fill）：base 色改为纯白 `rgb(255,255,255)`，`colorOpacity` 默认 1（不透明）；色调/饱和可调整成任意颜色
  - L2（文字背景矩形）：polygon 块强制 opacity=0（只显示文字，无矩形背景）
  - 非 polygon 普通块：行为不变（采样图片背景色，opacity 默认 1）
- **TranslationList Layer 1 / Layer 2 分层显示**：polygon 块在列表中拆分为两张独立卡片
  - 紫色「L1 背景层」卡片：色调/饱和/透明滑块始终展开，点击后图中 polygon 轮廓变紫色
  - 蓝色「L2 文字层」卡片：译文编辑，旋转角度徽章
  - `selectedLayer: 1|2` 状态区分当前激活层，handleSelect 滚动定位到对应卡片
- **旋转触角（天线拖拽控制旋转）**：选中块后顶部出现靛蓝色圆圈+竖线，拖拽圆圈围绕块中心旋转；Canvas 导出同步旋转渲染
- **背景采色改进**：`sampleFillColor` 改为沿 bbox 四条边采样（32 点），避免内部文字像素干扰
- **BlockOverlay SVG 轮廓**：有 polygon 的块显示 SVG `<polygon>` 轮廓；拖移/缩放时 polygon 顶点随 bbox 同步移动缩放；selectedLayer=1 时轮廓变紫色
- **sticky 滚动偏移修复**：点击图片上的块时，列表对应项滚动到 sticky 图片正下方（`window.scrollTo` + stickyRef 高度偏移）

### 修改文件

- `src/types/index.ts`：TextBlock 加 `polygon?`、`rotation?`
- `src/services/ai.ts`：`IMAGE_TRANSLATE_FULL_PROMPT` 加 polygon schema + CoT + 防串位规则
- `src/components/ImageTranslate/ImageEditor.tsx`：双层两阶段渲染；L1 白色基准色；l1ColorOpts/colorOpts 分离；旋转变换
- `src/components/ImageTranslate/BlockOverlay.tsx`：SVG polygon 层；旋转触角；selectedLayer prop；rotation CSS transform
- `src/components/ImageTranslate/TranslationList.tsx`：L1/L2 双卡片；selectedLayer prop；非 polygon 块行为不变
- `src/components/ImageTranslate/index.tsx`：selectedLayer 状态；handleSelect 按 layer 滚动定位；stickyRef

---

## 2026-04-17 — 清理孤立草稿文件

### 改动

- 删除未挂载的草稿组件 `src/components/ResultView/WordChatView.tsx`（AiChatBox 已在 AiFullView/AiSection/PhraseView 中正式集成）
- 删除 API 调试脚本：`test-conn.mjs`、`test-cors.mjs`、`test-cors-native.mjs`、`test-empty.mjs`、`test-gemini.mjs`、`test-geminipro.mjs`、`test-nov1beta.mjs`、`test-nov1beta-openai.mjs`、`test-post-openai.mjs`
- 删除 `.playwright-mcp/` 目录

---

## 2026-04-16 — 图片翻译列表 + 嵌字模式体验增强 v0.4.5

### 改动

- **背景色调整限制**：列表模式不再传 `onUpdateBlock`，背景色调整滑块仅在嵌字模式下显示
- **译文自动换行**：译文输入框由 `<input>` 改为 `<textarea>`，文字自动换行显示，复制粘贴仍为单行；初始渲染通过 ref 回调撑开正确高度
- **图片最大高度**：列表模式 + 嵌字模式图片统一 `max-h-[50vh]`（原为 45vh）
- **列表模式图片支持缩放平移**：用 `ImageViewer` 包裹，支持 Ctrl+滚轮 / 双指 pinch 缩放及拖拽平移；图片右上角新增重置视图按钮（↩ 图标）
- **嵌字模式图片 sticky**：图片、操作提示、重置视图、收起按钮、导出图片按钮全部加入 sticky 容器，滚动时固定在顶部；支持与列表模式相同的折叠/展开
- **导出图片按钮悬浮**：`ExportButton` 随 sticky 图片容器固定，紧接图片下方
- **ImageViewer 新增 `compact` / `className` prop**：`compact` 隐藏操作提示文字；`className` 支持传入 `max-h-[50vh]` 等约束
- **背景色调整收起按钮**：每个展开滑块的列表块右上角新增「收起」小按钮，点击取消选中并收起滑块；`TranslationList` 新增 `onDeselect` prop

### 修改文件

- `src/components/ImageTranslate/TranslationList.tsx`：textarea 换行、`onDeselect` prop、块点击 stopPropagation、收起按钮
- `src/components/ImageTranslate/index.tsx`：列表模式移除 `onUpdateBlock`、sticky 图片高度、嵌字模式 sticky 结构、`listViewerRef`
- `src/components/ImageTranslate/ImageViewer.tsx`：新增 `compact` / `className` prop
- `src/components/ImageTranslate/ImageEditor.tsx`：canvas 恢复 `w-full`（移除 object-contain，由 ImageViewer overflow-hidden 裁剪）

---

## 2026-04-15 — 图片翻译 sticky 图片异形屏适配 v0.4.2（补丁）

### 改动

- **翻译列表模式 sticky 图片安全区适配**：`sticky top-0` 改为 `sticky top-safe`，防止图片在刘海/打孔屏设备上滚动时被摄像头遮挡
- 新增 `.top-safe` CSS 工具类（`top: env(safe-area-inset-top, 0px)`），与已有的 `.pt-safe`/`.pb-safe` 保持一致

### 修改文件

- `src/index.css`：新增 `.top-safe` 工具类
- `src/components/ImageTranslate/index.tsx`：sticky 图片容器 `top-0` → `top-safe`

---

## 2026-04-14 — iOS 输入框防放大 v0.4.2（补丁）

### 改动

- **iOS 输入框防自动放大**：`src/index.css` 加 `@supports (-webkit-touch-callout: none)` 块，强制 iOS 上 input/select/textarea 字体 ≥ 16px，阻止 Safari focus 时自动缩放页面

### 修改文件

- `src/index.css`：新增 iOS-only font-size 规则

---

## 2026-04-14 — UI 恢复（AI Search 内嵌 + API Key 眼睛图标）v0.4.2

### 改动

- **AI Search 移入搜索框内**：AI 按钮从底部独立行移到搜索框内部右侧（清空 × 右边），有输入内容时显示；底部独立的 Search / AI Search 按钮已移除
- **API Key 显示/隐藏**：设置面板 API Key 输入框右侧加眼睛图标，点击切换明文/密文

### 修改文件

- `src/components/SearchBar/index.tsx`：AI 按钮移入输入框，删除底部按钮行
- `src/components/Settings/SettingsDrawer.tsx`：新增 `showKey` 状态 + 眼睛图标按钮

---

## 2026-04-14 — 超时提示 + 仓库清理 v0.4.1

### 改动

- **生僻词 AI 查询超时提示**：`aiFullLookup` 加 30 秒超时，超时后显示「较为生僻，AI 30 秒内未能解析，建议直接向 AI 提问」，不再无限等待
- **全局 API 60 秒硬上限**：`callApi` 加 60 秒兜底，防止请求永久挂起
- **GitHub 仓库清理**：从 repo 中移除 `CLAUDE.md`、`CHANGELOG.md`、`lexicon-docs/`、`*.db-shm`、`*.db-wal`；更新 `.gitignore` 防止再次误入

---

## 2026-04-13 — 图片翻译嵌字增强 v0.4.0

### 新功能

- **图片缩放 + 平移视图**（ImageViewer 组件）：
  - **PC**：`Ctrl+滚轮` 缩放（以鼠标位置为中心）；`Ctrl+拖拽` 平移
  - **触屏**：双指 pinch 缩放；单指在空白区域拖拽平移
  - 提示文本：底部显示操作说明

- **可交互 bbox 编辑叠加层**（BlockOverlay 组件）：
  - **拖拽移动**：点击 bbox 内部区域拖动调整位置
  - **8 控制点缩放**：4 角 + 4 边中点，拖拽调整大小和形状
  - **选中高亮**：点击 bbox 选中（同步 TranslationList 滚动）
  - **删除**：选中后显示右上角 × 按钮
  - **手动绘制新框**：在空白区域按住拖拽画新框，松开后弹出表单填译文、类型、方向
  - **鼠标 + 触屏双协议**：统一 `getPointer()` 提取坐标，mouse 和 touch 逻辑共用

- **两阶段翻译流程**（性能优化）：
  - **阶段 1（快速）**：点「开始翻译」→ AI 只返回 `original + translation + type + direction`，不计算 bbox
  - **阶段 2（按需）**：点「嵌字编辑」→ 触发第二次 AI 请求补全 bbox 数据
  - 效果：纯列表查看时响应快，进入嵌字模式时才计算坐标（减少不必要的 AI 开销）

- **粘性图片展示**（TranslationList 模式）：
  - 原图默认展开在顶部，右上角「收起」按钮隐藏
  - 收起后顶部显示「展开原图」按钮
  - 图片区为 sticky top-0，滚动翻译列表时保持可见

- **Per-block 颜色调整**（TranslationList 选中时）：
  - **色调滑块**：-180° ~ +180°（RGB→HSL 色彩空间变换）
  - **饱和度滑块**：0% ~ 200%（0=灰度，100=正常，200=高饱和）
  - **透明度滑块**：0% ~ 100%（背景色的 alpha）
  - 实时预览：ImageEditor canvas 立即应用颜色变换

### 改进

- **搜索按钮重新布局**：从搜索框内移到下方，与 Mode Toggle 同一行，改为两个独立按钮「搜索」「AI 搜索」
- **设置面板 Safe Area 优化**：修复 Settings Drawer 顶部 padding，避免在 iOS 刘海下被遮挡
- **bbox 颜色采样优化**：从边框采样改为内部 5×5 网格均值采样，更准确代表气泡背景色
- **ImageEditor 架构准备**：支持 Canvas `ctx.clip()` 多边形剪裁，为未来自由形状文字框预留接口

### 修改文件

- `package.json`：版本 `0.4.0`
- `src/App.tsx`：改为 `h-screen overflow-y-auto` 以支持 sticky positioning
- `src/components/SearchBar/index.tsx`：移除搜索框内按钮，新增下方两个按钮
- `src/components/SearchBar/ModeToggle.tsx`：移除 `mt-2` margin
- `src/components/Settings/SettingsDrawer.tsx`：顶部 padding 改用 `pt-safe`
- `src/components/ImageTranslate/index.tsx`：整体结构重构，两阶段流程、粘性图片、collapsible 图片
- `src/components/ImageTranslate/ImageViewer.tsx`（**新建**）：缩放/平移容器，支持鼠标 wheel + Ctrl + touchpad pinch + touch pinch
- `src/components/ImageTranslate/BlockOverlay.tsx`（**新建**）：可交互 bbox 叠加层，支持移动、缩放、删除、绘制
- `src/components/ImageTranslate/ImageEditor.tsx`：per-block 颜色调整、improved `sampleFillColor`
- `src/components/ImageTranslate/TranslationList.tsx`：新增 `selectedIndex`、color control sliders
- `src/stores/imageStore.ts`：新增 `imageBase64`、`bboxReady`、`updateBlock`、`deleteBlock`、`addBlock`
- `src/services/ai.ts`：拆分为 `aiImageTranslateFast()` 和 `aiImageTranslateFull()`
- `src/types/index.ts`：TextBlock 新增 `colorHue?`、`colorSaturation?`、`colorOpacity?`

---

## 2026-04-13 — AI 强制搜索 + 异形屏适配 v0.3.0

### 新功能

- **AI 强制搜索按钮**：搜索框左侧新增 🔍AI 按钮，点击后跳过备选项、直接用 AI 查询输入框原文
  - 解决问题：输入 "fest" 回车后被自动跳转到 "fester" 的问题
  - 旧放大镜按钮保留，行为与 Enter 一致（取备选项第一项或原文）
- **Ctrl+Enter 快捷键**（PC / Cmd+Enter on Mac）：键盘触发 AI 强制搜索，与 AI 按钮逻辑相同

### 修改文件

- `src/components/SearchBar/index.tsx`：新增 `onForceAi` prop、两个左侧按钮、Ctrl+Enter 处理
- `src/App.tsx`：新增 `handleForceAi` 函数，传入 SearchBar

---

## 2026-04-13 — 异形屏 Safe Area 适配（iOS 刘海 / Android 挖孔屏）

### 改进

- **顶部安全区**：顶栏（Tab + 设置按钮）在 iPhone 刘海 / Dynamic Island / Android 挖孔屏下不再被状态栏遮挡
- **底部安全区**：内容区底部自动留出 iPhone Home 指示条高度
- 纯 CSS 方案，无需 Capacitor 插件；Web 版 fallback 为 0，外观不变

### 修改文件

- `index.html`：viewport meta 加 `viewport-fit=cover`
- `src/index.css`：追加 `.pt-safe` / `.pb-safe` utility（`env(safe-area-inset-top/bottom)`）
- `src/App.tsx`：顶栏 `pt-3` → `pt-safe`；外层容器加 `pb-safe`

---

## 2026-04-11 — iOS 平台支持（GitHub Actions + AltStore，无 Mac 方案）v0.2.3

### 新增

- **iOS 平台初始化**：安装 `@capacitor/ios`，执行 `npx cap add ios` 生成 `ios/` 目录（Capacitor 8，SPM 依赖管理）
- **GitHub Actions iOS 构建流**：`.github/workflows/ios-build.yml`，使用 `macos-latest` runner 编译未签名 IPA
  - 触发条件：推 tag（`v*`）自动构建 + 手动 `workflow_dispatch`
  - 打 tag 时自动上传 IPA 至 GitHub Release
  - 非 tag 构建保存为 Actions Artifact（30 天）
- **ExportOptions.plist**：`ios/ExportOptions.plist`，配置 xcodebuild 无签名导出（ad-hoc / manual signing）
- **安装方式**：AltStore for Windows + 免费 Apple ID 签名安装，7 天自动续签，无需 Mac、无需付费开发者账号

### 构建过程中修复的问题

- **v0.2.0**：Node 版本为 20，Capacitor 8 要求 ≥ 22 → 改为 Node 22
- **v0.2.1**：`xcodebuild -exportArchive` 报 `No Team Found`（无签名 archive 无法走 exportArchive 流程）→ 改为手动从 archive 的 `Products/Applications/` 提取 `.app`，zip 打包成 IPA
- **v0.2.2**：GitHub Actions `GITHUB_TOKEN` 默认无 Release 写权限（403）→ 在 job 中声明 `permissions: contents: write`
- **v0.2.3**：构建成功，IPA 上传至 Release ✅

### 修改文件

- `package.json`：添加 `@capacitor/ios ^8.3.0`
- `ios/`（新建目录）：Capacitor 生成的 Xcode 项目（SPM，无 CocoaPods）
- `.github/workflows/ios-build.yml`（新建）：iOS CI 构建工作流
- `CLAUDE.md`：更新跨平台打包说明

---

## 2026-04-09 — 启动画面暗黑模式适配

### Bug 修复

- **Android splash 暗黑适配**：暗黑模式下启动 app 时白色 splash 闪屏
  - 新建 `drawable/splash_dark.png`（深色 `#030712` + 蓝 X 图标，1280×1920），基于现有 `drawable-port-xxxhdpi/splash.png` 去白底合成
  - 新建 `values-night/styles.xml`，覆盖 `AppTheme.NoActionBarLaunch` 的 `android:background` 为 `@drawable/splash_dark`
  - 系统暗黑模式下 Android 资源系统自动选中 night 变体

- **PC Tauri 启动白闪**：暗黑用户启动时先看到白色窗口再切深色
  - `tauri.conf.json` 窗口配置加 `backgroundColor: "#030712"`，消除 native 窗口层白闪
  - `index.html` `<head>` 加同步 inline script：读 `localStorage` 中的 `lexicon-settings`，若 `darkMode: true` 则在 CSS 解析前给 `html` 加 `.dark` 类，消除 CSS 层白闪
  - 浅色用户启动瞬间会看到一次深色（< 200ms，可接受）

### 修改文件

- `android/app/src/main/res/drawable/splash_dark.png`（新建）
- `android/app/src/main/res/values-night/styles.xml`（新建）
- `src-tauri/tauri.conf.json`：窗口加 `backgroundColor`
- `index.html`：`<head>` 加 dark-mode 预加载脚本

---

## 2026-04-09 — PC 端图标替换

### 改进

- **PC 端应用图标**：将 Tauri 默认蓝色方块替换为 Lexicon "X" 图标（与 Android 端一致）
  - 从 Android `ic_launcher.png`（192×192）放大至 512×512，生成全部 Tauri 所需尺寸
  - 手动构建多尺寸 ICO（16~256px，7 个尺寸），PIL 默认保存只嵌入单尺寸
  - **注意**：替换图标后必须 `cargo clean` 再构建，否则 Rust 增量编译缓存旧图标资源不会更新

### 修改文件

- `src-tauri/icons/*`：全部 17 个图标文件替换为 Lexicon 品牌图标

---

## 2026-04-09 — Bug Fix：Android 键盘色块 + AI 网络兼容 + PC 暗黑过滚

### Bug 修复

- **Android 输入框色块**：点击输入框弹出键盘时，大块 teal 色块遮挡界面
  - 根因：`AndroidManifest.xml` 缺少 `windowSoftInputMode`，默认 `adjustResize` 缩小 WebView 露出底层背景色
  - 修复：activity 加 `android:windowSoftInputMode="adjustPan"` + `capacitor.config.ts` 配置 `plugins.Keyboard.resize: 'none'`

- **Android AI mode fetch failed**：WebView / 原生网络栈在代理环境下 SSL 握手失败
  - 根因：Capacitor WebView 的 Chromium 网络栈和 Android 原生 `HttpURLConnection` 在 VPN 代理（如 NekoBox TUN 模式）下 SSL 握手失败（`net_error -100` / `SSLHandshakeException: Connection closed by peer`），尤其在 GFW 环境下通过代理访问境外 API 时
  - 调试过程：
    1. `server.allowNavigation` 白名单 → 无效（仅影响 navigation，不影响 fetch）
    2. `CapacitorHttp.enabled: true`（原生 Java HTTP）→ `SSLHandshakeException`，原生栈与代理兼容性差
    3. `androidScheme: 'http'`（避免 localhost 自签证书）→ 无效，不影响外发 HTTPS 请求
    4. `network_security_config.xml` 信任用户 CA → 无效，问题不是证书信任
  - 最终方案：`CapacitorHttp.enabled: true` + `androidScheme: 'http'` + `network_security_config.xml`（信任用户 CA + 允许明文）三管齐下；**关键发现**：安装新 app 后必须重启 VPN 连接，否则 Android 的 VPN 路由表不包含新 app
  - 注意：使用 VPN 代理软件（NekoBox / Clash / v2rayNG 等）的用户，安装或更新 Lexicon 后需重启代理连接

- **PC 暗黑模式 overscroll 白色**：Tauri 桌面端暗黑模式下过度滚动露出白色背景
  - 根因：html/body 无背景色，Tailwind dark class 仅作用于 App 组件内 div
  - 修复：`src/index.css` 添加 html/body 背景色（gray-50 / dark: gray-950）+ `overscroll-behavior: none`

### 修改文件

- `capacitor.config.ts`：`server.androidScheme: 'http'` + `plugins.CapacitorHttp.enabled: true` + `plugins.Keyboard.resize: 'none'`
- `android/app/src/main/AndroidManifest.xml`：activity 加 `windowSoftInputMode="adjustPan"` + application 加 `networkSecurityConfig`
- `android/app/src/main/res/xml/network_security_config.xml`：新增，信任系统 + 用户 CA 证书，允许明文流量
- `src/index.css`：html/body 背景色 + dark 适配 + overscroll-behavior

---

## 2026-04-09 — 跨平台打包（Tauri PC + Capacitor Android）

### 新增

- **Tauri 桌面打包**
  - `src-tauri/` 目录：`Cargo.toml`、`tauri.conf.json`、`lib.rs`、`main.rs`、`build.rs`
  - 应用窗口 420×720，可调整大小，最小 360×600
  - `capabilities/default.json`：Tauri v2 权限配置
  - 生成占位图标（蓝色方块，后续可替换）
  - 输出：`Lexicon_0.1.0_x64-setup.exe`（NSIS）+ `Lexicon_0.1.0_x64_en-US.msi`

- **Capacitor Android 打包**
  - `capacitor.config.ts`：appId `com.julian.lexicon`，webDir `dist`
  - `android/` 目录：Gradle 项目，词库自动复制到 assets
  - 输出：`app-debug.apk`（19MB）

- **平台检测工具**：`src/services/platform.ts`（`isTauri()` / `isCapacitor()` / `isWeb()`）

- **Vite 配置优化**：Tauri 模式下跳过 COOP/COEP headers（避免 WebView2 兼容问题），忽略 `src-tauri/` 文件监控

### package.json 变更

- 新增 scripts：`tauri:dev`、`tauri:build`
- 新增 dependencies：`@capacitor/core`、`@capacitor/cli`、`@capacitor/android`
- 新增 devDependencies：`@tauri-apps/cli`、`@tauri-apps/api`

### TS 修复

- `useAiLookup.ts`：移除未使用的 `QueryType` import
- `useSearch.ts`：移除未使用的 `setAiStatus`/`setAiFullResult`/`setPhraseResult` 解构
- `ai.ts`：修复 `aiPhraseQuery` 返回值中 `correctForm` 重复赋值

---

## 2026-04-08 — 图片嵌字（Canvas 去原文 + 贴译文）

### 新增

- **嵌字预览模式**：翻译完成后可切换「翻译列表」/「嵌字预览」
- **Canvas 图片编辑器**（`ImageEditor`）：按文字类型分策略渲染
  - `bubble`（对话框）：采样背景色填充 + 渲染译文
  - `sfx`（音效）：不覆盖背景，描边文字叠加（白色描边 + 深色填充）
  - `caption`（标注）：半透明圆角背景条 + 译文
- **AI 自动分类文字类型**：prompt 要求返回 `type: "bubble" | "sfx" | "caption"`，bbox 严格贴合文字区域
- **可爱字体支持**：Google Fonts 引入快乐体（圆润可爱）、马善政（毛笔手写）、龙藏（硬笔手写），可在 UI 切换
- **导出按钮**（`ExportButton`）：canvas.toBlob() 导出合成后的 PNG 图片
- 翻译列表显示文字类型标签（对话/音效/标注），颜色区分

### 新增组件

- `ImageTranslate/ImageEditor.tsx`：Canvas 嵌字渲染器（forwardRef + useImperativeHandle 暴露 exportBlob）
- `ImageTranslate/ExportButton.tsx`：导出合成图片

### 新增类型

- `TextBlockType`：`'bubble' | 'sfx' | 'caption'`（TextBlock 新增 type 字段）

---

## 2026-04-08 — 图片上传 + AI 翻译

### 新增

- **图片翻译视图**（`ImageTranslateView`）：上传/拖拽图片 → AI Vision API 检测文字 → 返回翻译列表
- **语言选择**：源语言（自动检测/日语/英语/韩语/法语）→ 目标语言（中文/英语/日语）
- **翻译结果可编辑**：每条译文支持手动修改（为 Phase 3 嵌字功能准备）
- **App 顶部 Tab 切换**：「查词」/「图片翻译」两个视图

### 新增组件

- `ImageTranslate/index.tsx`：图片上传 + 翻译主视图
- `ImageTranslate/TranslationList.tsx`：翻译结果列表（可编辑译文）

### 新增 Store

- `imageStore.ts`：图片翻译状态管理（图片、语言、翻译块、加载状态）

### 新增类型

- `TextBlock`：文字块（原文 + 译文 + 归一化 bbox 坐标）
- `ImageTranslation`：图片翻译结果

### 新增 AI 函数

- `aiImageTranslate()`：Vision API 图片文字检测+翻译，返回 TextBlock[]

---

## 2026-04-08 — 搜索增强 + AI 兜底查询 + 词组/句子支持 + AI 问答框

### 新增

- **搜索建议支持词组**：输入含空格时匹配词组条目（前缀 + 模糊双路合并去重）
- **QueryType 识别**：自动判断输入为 `word`/`phrase`/`sentence`（含标点或 ≥5 词→sentence，含空格→phrase）
- **AI 兜底查词**（`aiFullLookup`）：词库无结果时自动切 AI mode，AI 生成完整单词信息（音标、词性、释义+场景、词源、近义词、例句），带「AI 查询」标签
- **AI 词组/句子查询**（`aiPhraseQuery`）：词组/句子走 AI 生成（释义、使用场景、例句、练习），带「AI 查询 · 词组/句子」标签
- **AI 问答框**（`AiChatBox`）：支持多轮对话，以当前单词/词组为上下文提问，加在 AI mode 末尾和所有 AI 视图末尾
- **拼写纠正展示**：AI 返回 `correctForm`，大字显示正确拼写，用户输入有误时小字标注原始输入（红色删除线）

### 新增组件

- `AiFullView`：AI 全量单词视图，复用 WordHeader、SemanticScene、EtymologyCard、SynonymList、PracticeSection
- `PhraseView`：词组/句子视图（释义→使用场景→例句→练习→问答）
- `PhraseExercises`：词组练习组件（评分复用 `evaluateAnswer`）
- `AiChatBox`：AI 问答框组件

### 新增类型

- `QueryType = 'word' | 'phrase' | 'sentence'`
- `AiFullResult`（含 `correctForm`）、`PhraseResult`（含 `correctForm`）、`ChatMessage`

### 新增 AI 服务函数

- `aiFullLookup(word, signal?)`：词库缺失单词的全量 AI 生成
- `aiPhraseQuery(phrase, signal?)`：词组/句子 AI 查询
- `askQuestion(context, history, signal?)`：AI 问答，支持多轮对话历史

### 修改

- `searchStore` 新增 `queryType` 状态，`setQuery` 时自动推断类型
- `resultStore` 新增 `aiFullResult`、`phraseResult`、`chatMessages` 状态及对应缓存
- `db.web.ts` 的 `suggest()` 改为按输入是否含空格分支：单词模式 / 词组模式
- `useSearch` hook 改造：按 queryType 分支处理，词库无结果时自动切 AI mode
- `useAiLookup` hook 新增 `triggerFullLookup` 和 `triggerPhraseQuery`
- `App.tsx` 按 wordResult / aiFullResult / phraseResult 三路条件渲染对应视图
- `AiSection/index.tsx` 末尾新增 `AiChatBox`

---

## 2026-04-07 — 练习评分严格化

### 改进

- **`EVAL_SYSTEM_PROMPT`**（`src/services/ai.ts`）评分规则收紧：
  - 原规则"in spirit 正确即通过"改为"意思 + 语法同时正确才标 correct"
  - 明确不可忽略的错误类型：动词搭配错误（如 `dangerous playing` → `dangerous to play`）、错误时态、主谓一致、句子结构不正确、影响意义的冠词缺失
  - 明确可忽略的范围：仅限次要词的小拼写错、大小写、标点
  - feedback 要求指出具体违反的语法规则（中文）

---

## 2026-04-07 — AI 配置体验 + 稳定性修复

### Settings 大改：AI 服务商选择

- **`SettingsDrawer`** 新增服务商选择网格（15 个预设 + 自定义）：
  OpenAI · Google Gemini · Anthropic · OpenRouter · DeepSeek · Mistral · Groq · Together AI · xAI/Grok · Perplexity · Moonshot/Kimi · SiliconFlow · 智谱 GLM · 零一万物 · 自定义
  - 点击服务商 → Endpoint 自动填入，选中态高亮；手动编辑 Endpoint → 自动切为"自定义"
  - "获取模型列表"按钮：`GET {endpoint}/models`，返回可点击模型列表（点击直接填入）
  - 获取失败时，有预置静态模型的服务商（Gemini / Anthropic / DeepSeek / xAI / Perplexity / Moonshot）显示"查看常用列表"兜底
  - 当前选中模型在列表中高亮
- **"测试连接"按钮**：发送极简请求（max_tokens=10）验证 endpoint + API key + 模型三项是否可用
  - 成功：绿色 ✓ 连接成功 / 失败：红色 ✗ + 具体原因（401 key 无效 / 404 模型不存在 / 429 超频）
  - 切换服务商时自动重置测试状态

### 每服务商独立存储 API Key

- `settingsStore` 将 `aiApiKey: string` 改为 `aiApiKeys: Record<string, string>`（以 providerId 为 key）
- 切换服务商时自动读取对应的 key，互不覆盖
- API Key 输入框右上角显示"已保存"绿色标记
- 新增 `setApiKeyForProvider(providerId, key)` 替代原 `setAiApiKey`

### 修复 `getConfig()` 严重 bug

- 原 `getConfig()` 读 `localStorage.getItem('ai_endpoint')` 等独立 key，但 Zustand persist 存在 `lexicon-settings` 下，实际永远读不到——Settings 页填的配置从未生效
- 修复为正确解析 `localStorage.getItem('lexicon-settings')` → 读取 `state.aiEndpoint`、`state.aiModel`、`state.aiApiKeys[state.aiProvider]`

### AI 板块暗黑模式修复

- `SemanticScene`、`EtymologyCard`、`SynonymList`、`AiStatusBar`、`PracticeSection` 全部 inline style（`#7F77DD` / `#3C3489` / `#EEEDFE`）替换为 Tailwind class
- 暗色模式下自动切换为 `indigo-900/20`（背景）、`indigo-300`（文字）等适配色
- `SkeletonBlock` loading 骨架加 `dark:bg-gray-800` 适配

### AI JSON 解析稳定性

- `callApi` 代码块剥离从简单正则改为 `fenceMatch`（捕获两个 ` ``` ` 之间的内容），兼容模型在 JSON 前加说明文字的情况
- `generateExercises` / `evaluateAnswer` / `analyzeWord` 均加两级兜底：① 直接 parse → ② 正则提取第一个 `[...]` 或 `{...}` 再 parse
- 移除所有 `max_tokens` 硬限制（改用 prompt 控制长度），防止 JSON 写到一半被截断
- 主分析 prompt 新增 "Keep the entire response concise and compact" 等长度约束规则

---

## 2026-04-07 — AI Mode 学习体验增强

### 新增

- **派生词（Etymology 板块）**：`EtymologyCard` 在 story 段落下方新增派生词列表（word / pos / meaning），展示由主词派生的词族（如 satisfy → satisfaction / satisfactory / dissatisfy）
  - `Etymology` 类型新增 `derivedWords: DerivedWord[]` 字段
  - AI system prompt 更新，要求返回 3-6 个派生词

- **课后练习板块**（`PracticeSection`）：AI mode 底部新增练习区域
  - 默认显示"生成练习"按钮（不自动触发，避免用户没空做时浪费 token）
  - 点击后调用 `generateExercises()` 生成场景题（AI 优先选最常用义项场景）
  - 每题独立提交，提交后调用 `evaluateAnswer()` 实时评分
  - 答对：绿色 ✓ 不错！/ 答错：中文错误说明 + 参考句，可重新作答

- **练习题数设置**：`settingsStore` 新增 `maxExercises: number`（默认 5，范围 1-10），`SettingsDrawer` 新增 +/- 控件

### 新增类型（src/types/index.ts）

- `DerivedWord`: `{ word, pos, meaning }`
- `Exercise`: `{ scenario }`
- `EvaluationResult`: `{ correct, feedback, correction }`

### 新增 AI 服务函数（src/services/ai.ts）

- `generateExercises(word, meanings, count, signal?)` — 独立 AI 调用，返回 `Exercise[]`
- `evaluateAnswer(word, scenario, userAnswer, signal?)` — 独立 AI 调用，返回 `EvaluationResult`
- 内部提取公共 `callApi()` 工具函数减少重复代码

### 新增组件

- `src/components/ResultView/AiSection/PracticeSection.tsx`

### 接口变更

- `AiSection` props 新增 `word: string` 和 `meanings: Meaning[]`（由 `ResultView` 传入）
- `SettingsStore` 新增 `maxExercises` + `setMaxExercises`

---

## 2026-04-07 — 历史记录功能

### 新增

- **`src/stores/historyStore.ts`**：Zustand + persist，历史词汇存 localStorage（`lexicon-history`），最多保留 100 条，支持 `add`/`remove`/`clear`
  - 注：放弃 SQLite 写入方案（sql.js 为内存 DB，刷新即丢失）

- **`src/components/SearchBar/HistoryList.tsx`**：历史列表组件
  - 搜索框聚焦且输入为空时出现（dropdown 形式，与 SuggestList 互斥）
  - 顶部"最近查词"标题 + "清除全部"按钮
  - 每条记录可点击查词，hover 显示单条删除按钮

- **`src/hooks/useSearch.ts`**：`selectWord` 查词成功后调用 `historyStore.add(word)`，受 `historyEnabled` 控制

- **`src/components/SearchBar/index.tsx`**：新增 `isFocused` 状态，控制 HistoryList 显示逻辑；`onBlur` 用 150ms 延迟避免点击历史项时列表消失

### 滚动条样式（上一次遗漏记录）

- `src/index.css`：添加全局 webkit scrollbar 样式，亮色 gray-300/暗色 gray-600，宽 6px，透明轨道

---

## 2026-04-07 — 体验优化

### 新增/改进

- **键盘导航**（SearchBar + SuggestList）：
  - `↑` / `↓` 方向键在补全列表中移动高亮
  - `Enter` 选中高亮项（无高亮时沿用原逻辑：取第一条或原始输入）
  - `Escape` 关闭补全列表（再按一次清空搜索框）
  - 活动项自动 `scrollIntoView`，长列表不出界

- **搜索框 focus ring**：输入框获得焦点时显示 indigo 色边框 + 光晕（`focus-within`）

- **WordHeader 词性 badge 暗黑适配**：读取 `settingsStore.darkMode`，动态切换 `badgeBg`/`badgeText`

- **ModeToggle 暗黑适配**：非激活按钮补充 `dark:` 系列 Tailwind 类

- **AI mode 切换自动触发**（App.tsx）：从 Instant 切换到 AI mode 时，若当前有词结果且 `aiStatus === 'idle'`，自动触发 `triggerAi`；用 `prevModeRef` 防止初始渲染误触发

---

## 2026-04-07 — 项目初始化完成（Step 1-11）

### 完成内容

- **Step 1-2**：手动创建 Vite React-TS 项目结构
  - 安装：react 18、react-dom、zustand、sql.js、tailwindcss、@tailwindcss/vite、@types/sql.js
  - 注意：安装的是 Tailwind **v4**（非 v3），配置方式为 CSS `@import "tailwindcss"` + `@theme` block

- **Step 3**：配置 vite.config.ts（含 COOP/COEP headers for sql.js WASM）

- **Step 4**：Tailwind v4 配置（颜色 token 通过 src/index.css `@theme` 定义）

- **Step 5**：创建目录结构

- **Step 6**：src/types/index.ts — 全部全局类型

- **Step 7**：Zustand stores（searchStore、resultStore、settingsStore）

- **Step 8**：服务层（db.ts + db.web.ts + ai.ts）

- **Step 9**：Hooks（useSearch + useAiLookup）

- **Step 10**：全部组件（SearchBar、ResultView、SettingsDrawer 等）

- **Step 11**：TypeScript 零报错，vite build 成功（207KB JS + 15KB CSS）

---

## 2026-04-07 — Step 12：词库导入完成

### 完成内容

- **白屏修复**：`db.web.ts` 改用动态 `import('sql.js')` 避免 CJS 静态导入兼容问题
- **Step 12**：编写并执行 `scripts/mdx-to-sqlite.mjs`
  - 来源：牛津高阶英汉双解词典（第9版）OALD9.mdx（52MB）
  - 输出：`public/lexicon.db`（31MB）：52,861 词条，99,359 释义，67,683 例句，51,899 suggest 条目
  - 用时：32.7 秒，0 错误

---

## 2026-04-07 — sql.js 加载修复 + UI 功能迭代

### Bug 修复

- **sql.js 无法加载**：移除 `optimizeDeps.exclude`，让 Vite 预打包 sql.js

### 新增功能

- **Enter 键直接查词**、**Suggest 列表优化**（短词优先、最多 20 条）
- **相关词组板块**：`DBService` 新增 `getRelatedPhrases`，新增 `PhrasesSection` 组件
- **义项/例句折叠**：超出阈值折叠展开
- **深色模式**：class-based dark mode，`settingsStore` 新增 `darkMode`

---

<!-- 模板：每次改动复制下面这个块到顶部 -->
<!--
## [日期 YYYY-MM-DD]

### 新增
- 

### 修改
- 

### 修复
- 

### 架构变更
- （在这里说明为什么改，不只是改了什么）

### 同步更新的文档
- 
-->
