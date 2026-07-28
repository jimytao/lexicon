# 跨平台跟随系统浅色/深色主题调研

> 调研日期：2026-07-28  
> 适用项目：Lexicon（Capacitor 8 iOS/Android + Tauri 2 Windows + Web；Tailwind **class-based** dark mode `.dark`）  
> 目标：Appearance 增加第三选项 `system`（跟随系统）时，各平台如何检测与监听主题变化。

---

## Executive summary（对 Lexicon 的建议）

**推荐实现路径：以纯 Web `matchMedia('(prefers-color-scheme: dark)')` + `change` 监听为主，不引入专用「读系统主题」原生插件。**

| 场景 | 做法 |
|------|------|
| `appearance === 'system'` | 用 `matchMedia` 读当前值；`addEventListener('change')` 同步 `html.dark`；可选同步 Status Bar / System Bars 为 `DEFAULT` |
| `appearance === 'light' \| 'dark'` | 只改 `html.dark`（及 `meta`/`color-scheme`）；**不要**依赖 media query 切业务 UI（Lexicon 已是 class-based） |
| Capacitor 原生壳 | 保持 iOS **不**写死 `UIUserInterfaceStyle`；Android 继续用 `Theme.AppCompat.DayNight`（Lexicon 已如此）；**关闭/勿启用** WebView algorithmic force-dark |
| Tauri Windows | 内容层靠 WebView2 的 `prefers-color-scheme`；窗口铬可用 `getCurrentWindow().setTheme(...)` / `onThemeChanged`；强制 light/dark 时 `setTheme('light'\|'dark')`，跟随系统时 `setTheme(null)` |
| 防白闪 | 在 `index.html` 内联脚本里同时处理 persisted `system` + `matchMedia`；加 `<meta name="color-scheme" content="light dark">` |

**结论：检测系统主题不需要原生桥；需要原生能力的是「强制与系统相反的外观时改窗口/状态栏铬」以及 splash 资源。** `@capacitor/preferences` 与主题检测无关（仅 KV 存储）。

---

## 1. Web / CSS / JS（所有 WebView 共用基础）

### 1.1 `prefers-color-scheme`

CSS media feature，用于检测用户是否请求 light/dark 主题；偏好通常来自 **操作系统** 或 **UA 设置**。

语法值：`light` | `dark`（规范与 MDN 以二者为主）。

来源：

- [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme)
- [Media Queries Level 5（规范）](https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme)（经 MDN Spec 表引用）

### 1.2 `matchMedia` + `change`

```js
const mql = window.matchMedia('(prefers-color-scheme: dark)')
const isDark = mql.matches
mql.addEventListener('change', (e) => {
  // e.matches === true → 系统现为 dark
})
```

- `Window.matchMedia()` 返回 `MediaQueryList`，可读 `matches`，可监听匹配变化。  
  来源：[MDN: Window.matchMedia()](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia)
- `MediaQueryList` 的 `change` 事件在匹配状态变化时触发。  
  来源：[MDN: MediaQueryList change event](https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event)

> 历史备注：早期曾用 `addListener`/`removeListener`；现代路径以 `addEventListener('change')` 为准（MDN Baseline：change 事件自 ~2020-09 起广泛可用）。

### 1.3 `color-scheme` / `<meta name="color-scheme">`

- CSS `color-scheme`：声明元素可舒适渲染于 light/dark；影响画布、滚动条、表单控件等 **UA 铬**，**不能替代**业务样式（业务仍用 `prefers-color-scheme` 或 class）。  
  来源：[MDN: color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme)
- `<meta name="color-scheme" content="light dark">`：文档级提示，有助于减少加载时闪烁。  
  来源：[MDN: meta name=color-scheme](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/color-scheme)

对 Lexicon（class-based）：业务色走 `.dark`；仍建议设置 `color-scheme`，避免系统 dark 时表单/滚动条与页面不一致，并减轻首屏闪白。

### 1.4 浏览器兼容性与限制

| 能力 | 兼容性要点 |
|------|------------|
| `prefers-color-scheme` | MDN：**Baseline Widely available**（约自 2020-01）。Can I Use：Chrome 76+、Safari 12.1+、iOS Safari **13+**、Firefox 67+、Edge 79+。[caniuse.com/prefers-color-scheme](https://caniuse.com/prefers-color-scheme) |
| `matchMedia` | Baseline Widely available（约自 2015）。 |
| `change` on MQL | Baseline Widely available（约自 2020-09）。 |
| OS 无系统主题时 | Can I Use 注明：还取决于 **OS 是否提供** light/dark 偏好。 |

**限制（与 Lexicon 相关）：**

1. Media query 反映的是 **WebView/文档当前暴露的 color scheme**，不一定等于「用户设置里的系统值」，若宿主强制了 light/dark。  
2. Class-based dark 与 media query **解耦**：仅 `matchMedia` 不会自动加 `.dark`，必须自行同步。  
3. 嵌入文档的 `prefers-color-scheme` 可受父级 `color-scheme` 影响（MDN Embedded elements）。  
4. HTTP Client Hint `Sec-CH-Prefers-Color-Scheme` 面向服务端首屏，对本地 SPA 非必需。[MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-CH-Prefers-Color-Scheme)

---

## 2. iOS 14 – iOS 26（含文档现状说明）

### 2.1 文档现状 / 预期延续

- **iOS 13** 引入系统 Dark Mode；iOS 14–18+ 的 UIKit 外观模型（`UIUserInterfaceStyle` / trait）**无已知破坏性替换**。  
- Can I Use 已列出 **Safari on iOS 13–26.x** 对 `prefers-color-scheme` 的支持，说明到调研日（2026-07）UA 表已覆盖 iOS 26 线。  
- **「iOS 26」**：若 Apple 平台文档尚未按「26」单独开章节，外观 API 预期仍延续 iOS 13 以来的 trait / `UIUserInterfaceStyle` 模型；**以当前 UIKit 文档为准，标注为预期延续**。

### 2.2 UIKit / SwiftUI 系统外观

| API | 作用 |
|-----|------|
| `UIUserInterfaceStyle`（`.unspecified` / `.light` / `.dark`） | 表示界面风格常量。[Apple: UIUserInterfaceStyle](https://developer.apple.com/documentation/uikit/uiuserinterfacestyle) |
| `traitCollection.userInterfaceStyle` | 查询当前风格。[Apple: userInterfaceStyle](https://developer.apple.com/documentation/uikit/uitraitcollection/userinterfacestyle) |
| `overrideUserInterfaceStyle`（window / VC / view） | 局部或全局覆盖风格。[Choosing a specific interface style](https://developer.apple.com/documentation/uikit/choosing-a-specific-interface-style-for-your-ios-app) |
| Info.plist `UIUserInterfaceStyle`（Xcode 显示为 Appearance） | **强制**整 app 为 Light 或 Dark，**忽略用户系统偏好**。同上官方「Choosing a specific interface style」文档族；Apple Forums 亦引述该行为：[thread/117555](https://developer.apple.com/forums/thread/117555) |
| SwiftUI `preferredColorScheme(_:)` | 设置 presentation 偏好。[Apple](https://developer.apple.com/documentation/swiftui/view/preferredcolorscheme(_:)) |

历史：WWDC19《Implementing Dark Mode on iOS》《Supporting Dark Mode in Your Web Content》确立 iOS 13+ 模型与 Web 侧 `color-scheme` + `prefers-color-scheme`。[WWDC19-214](https://developer.apple.com/videos/play/wwdc2019/214/) · [WWDC19-511](https://developer.apple.com/videos/play/wwdc2019/511/)

### 2.3 WKWebView / Capacitor WebView 与 `prefers-color-scheme`

Apple 官方 Web 内容指引：用 `color-scheme` 声明支持，用 `@media (prefers-color-scheme: dark)` 自定义样式；内容在 Safari / 嵌入场景（含 app 内 Web）应反映用户偏好。[WWDC19-511](https://developer.apple.com/videos/play/wwdc2019/511/)

行为要点（一手 + 平台惯例）：

- WKWebView 的 `prefers-color-scheme` 跟随 **该 WebView 所处界面的 `userInterfaceStyle`**（系统或 `overrideUserInterfaceStyle` / plist 强制后的结果）。  
- Capacitor 的 iOS WebView 即 WKWebView；**未**在 Info.plist 强制 Appearance 时，系统切换会传到页面 media query。  
- **Lexicon 现状**：`ios/App/App/Info.plist` **未**设置 `UIUserInterfaceStyle` → 适合 `system` 选项。

### 2.4 Info.plist / 强制浅深色的影响

| 配置 | 对 `system` 的影响 |
|------|-------------------|
| 不设 `UIUserInterfaceStyle` | 跟随系统；`matchMedia` 可用 |
| `UIUserInterfaceStyle = Light` 或 `Dark` | 系统偏好被忽略；`matchMedia` **只反映强制值**，无法真正「跟随系统」 |

运行时强制单页/整窗：用 `overrideUserInterfaceStyle`（见 Apple Choosing interface style 文档）。

### 2.5 Capacitor 相关（iOS）

- **检测主题**：官方无「DarkMode 插件」要求；Web `matchMedia` 即可。  
- **Status Bar / System Bars**：  
  - Capacitor 8 内置 [System Bars](https://capacitorjs.com/docs/apis/system-bars)：`SystemBarsStyle.Default` = 基于设备外观（Dark→浅色图标，Light→深色图标）。  
  - 独立 [@capacitor/status-bar](https://capacitorjs.com/docs/apis/status-bar)：`Style.Default` 同样跟设备外观。  
  - 要求 `UIViewControllerBasedStatusBarAppearance = YES`（Lexicon 已为 `true`）。  
- **`@capacitor/preferences`**：KV 存储，**与系统主题无关**；仅可存用户选的 `appearance`。  
- **Splash**：[@capacitor/assets](https://capacitorjs.com/docs/guides/splash-screens-and-icons) 支持 `splash.png` + `splash-dark.png`。

### 2.6 iOS 13+ 历史与 14–26「破坏性」

- Dark Mode：**iOS 13** 起系统级。  
- Web：`prefers-color-scheme` 在 **iOS Safari 13+**（Can I Use）。  
- iOS 14–26：外观仍基于 trait / `UIUserInterfaceStyle`；**未发现**官方宣布废弃 `prefers-color-scheme` 或改掉 WKWebView 映射模型。  
- 状态栏：iOS 13 起 `Default` 可自动随界面风格切换（WWDC19-214 叙述）。

---

## 3. Android 9 – 17（API 28 – 预计 36+）

### 3.1 版本与文档现状

| 版本 | API | 系统 Dark 主题 |
|------|-----|----------------|
| Android 9 Pie | 28 | **无**官方系统级 Dark theme（AppCompat DayNight 仍可做 app 内夜间） |
| Android 10 | 29 | **引入**系统 Dark theme（系统 UI + apps）[Android 10 features](https://developer.android.com/about/versions/10/features) |
| Android 11 | 30 | 延续；文档仍推荐 `AppCompatDelegate.setDefaultNightMode`（≤ API 30） |
| Android 12 | 31–32 | Splash / `UiModeManager.setApplicationNightMode`（API 31+）等；WebView force-dark 演进 |
| Android 13 | 33 | WebView：`setAlgorithmicDarkeningAllowed` 路径（targetSdk ≥ 33） |
| Android 14–15 | 34–35 | 边缘到边缘等；主题模型延续 |
| Android 16 | **36** | Capacitor 8 Status Bar 文档已按 API 36 描述行为变化 [Status Bar](https://capacitorjs.com/docs/apis/status-bar) |
| Android 17 | 预计 37+ | **文档尚不完整**；预期延续 DayNight + WebView color-scheme 模型（标注：预期延续） |

### 3.2 `uiMode` / Night mode / AppCompat

- `Configuration.uiMode` 与 `UI_MODE_NIGHT_MASK` / `UI_MODE_NIGHT_YES|NO|UNDEFINED`：读当前是否夜间。官方 WebView 示例用其配合 force dark。[Darken web content in WebView](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme)
- [Implement dark theme](https://developer.android.com/develop/ui/views/theming/darktheme)：  
  - 推荐用户选项：Light → `MODE_NIGHT_NO`；Dark → `MODE_NIGHT_YES`；跟随系统 → `MODE_NIGHT_FOLLOW_SYSTEM`（AppCompat）。  
  - API 31+：可用 `UiModeManager.setApplicationNightMode`，便于 **启动 splash** 与主题一致。  
  - API ≤ 30：`AppCompatDelegate.setDefaultNightMode()`。  
- 主题资源：`Theme.MaterialComponents.DayNight` / `Theme.AppCompat.DayNight` + `values-night/`。

**Lexicon 现状**：`AppTheme.NoActionBar` 已使用 `Theme.AppCompat.DayNight.NoActionBar`，并有 `values-night/styles.xml`。Capacitor 4+ 亦建议 DayNight 以自动跟设备主题。[Updating to 4.0](https://capacitorjs.com/docs/updating/4-0)

### 3.3 WebView：`FORCE_DARK` / `ALGORITHMIC_DARKENING`

官方指南：[Darken web content in WebView](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme)

要点：

1. **若页面已用 `prefers-color-scheme`**，且作者允许，WebView 会按 app 主题自动应用作者定义的 light/dark 样式。  
2. **Algorithmic / Force Dark**：对**没有**自己 dark 样式的页面做算法压暗。  
   - targetSdk ≤ 32：`WebSettingsCompat.setForceDark`（`FORCE_DARK_ON/OFF/AUTO`）。  
   - targetSdk ≥ 33：转向 `setAlgorithmicDarkeningAllowed(true/false)`。  
3. 两种策略：  
   - **Web theme darkening**：尊重 `@media (prefers-color-scheme: dark)`。  
   - **User-agent darkening**：UA 反色；此时 **`prefers-color-scheme: dark` 可能为 false**（官方明确写出）。  
4. DayNight + 自管切换时，常需显式 `FORCE_DARK_ON/OFF` 并监听配置变化（官方 snippet 用 `uiMode`）。

**对 Lexicon**：已有完整 Tailwind `.dark` 主题 → **应禁用 algorithmic force-dark**，避免「双重变暗」或 media query 失真。检测用 `matchMedia` 即可。

### 3.4 Capacitor Android WebView 是否暴露 `prefers-color-scheme`

- Capacitor Android 使用系统 WebView（Chromium）。在 **DayNight** 且未错误启用 UA darkening 时，会向页面暴露与 app night mode 一致的 `prefers-color-scheme`（与 Android 官方「web content uses prefers-color-scheme」描述一致）。  
- Android 9：无系统 Dark；WebView 通常表现为 light preference，除非 app 自行 `MODE_NIGHT_YES`。

### 3.5 Android 9 vs 10+；12–17 变更摘要

| 主题 | 说明 |
|------|------|
| Android 9 | 无官方系统 Dark theme；`system` 选项在多数设备上等价于 light（除非 OEM 私货）。App 仍可用 DayNight。 |
| Android 10+ | 系统 Dark；WebView force-dark API 从 Q 起有意义（Jetpack Webkit 注明 API &lt; Q 无效果）。 |
| Android 12 | SplashScreen API；`setApplicationNightMode` 利于启动主题。Capacitor assets 文档指向 Android 12+ splash 形态变化。 |
| Android 13 | Algorithmic darkening API 与 targetSdk 33+ 对齐。 |
| Android 15–16 | 强制 edge-to-edge；Status Bar `overlaysWebView`/`backgroundColor` 在 API 35+ 受限，API 36 起 opt-out 不可用（Capacitor Status Bar 文档）。**与主题检测正交，但影响铬联动。** |
| Android 17 | **预期延续**；无单独「废除 prefers-color-scheme」迹象。 |

---

## 4. Windows（Tauri 2 / WebView2）

### 4.1 系统主题检测（原生）

官方 Win32 指引：[Support Dark and Light themes in Win32 apps](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-windows-themes)（ms.date 2026-06-16）

推荐 API：

1. `Windows.UI.ViewManagement.UISettings`  
2. `GetColorValue(UIColorType.Foreground)` + 亮度启发式判断是否 Dark  
3. `UISettings.ColorValuesChanged` 监听变化  

事件参考：[UISettings.ColorValuesChanged](https://learn.microsoft.com/en-us/uwp/api/windows.ui.viewmanagement.uisettings.colorvalueschanged?view=winrt-28000)

注册表（社区/问答常用，**非**上述 Learn 主路径的首选）：  
`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize` → `AppsUseLightTheme`（1=light, 0=dark）。Learn Q&A 中多次提及；主文档以 UISettings 为准。

### 4.2 WebView2 与 `prefers-color-scheme`

`ICoreWebView2Profile` / `CoreWebView2Profile.PreferredColorScheme`：

> 设置关联 profile 的整体 color scheme；通过设置 media feature **`prefers-color-scheme`**，使网站可响应；并影响 WebView2 UI（对话框、菜单等）。

来源：[ICoreWebView2Profile](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile?view=webview2-1.0.2957.106)

枚举：[CoreWebView2PreferredColorScheme](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2preferredcolorscheme)

| 值 | 含义 |
|----|------|
| `Auto` (0) | 自动（跟系统） |
| `Light` (1) | 强制浅色 |
| `Dark` (2) | 强制深色 |

**默认 Auto 时**，页面 `matchMedia('(prefers-color-scheme: dark)')` 应跟随 Windows 应用模式。

### 4.3 Tauri 2 官方 API

主题相关在 **`@tauri-apps/api/window`**（及 app 级），**不是** `tauri-plugin-os` 的核心职责（调研时官方 os 插件页未将其标为主题 API；社区另有 `tauri-plugin-theme` 列表项）。

| API | 行为 | 来源 |
|-----|------|------|
| `getCurrentWindow().theme()` | 当前窗口主题 `light` \| `dark` \| `null` | [window namespace](https://v2.tauri.app/reference/javascript/api/namespacewindow/) |
| `getCurrentWindow().onThemeChanged(handler)` | 监听系统/窗口主题变化 | 同上 |
| `getCurrentWindow().setTheme(theme?)` | 设主题；**`null`/`undefined` = 跟随系统**；Linux/macOS 为 app-wide | 同上 |
| `setTheme` from `@tauri-apps/api/app` | 应用级主题；**iOS/Android Unsupported** | [app namespace](https://v2.tauri.app/reference/javascript/api/namespaceapp/) |
| 窗口配置 `theme` | 初始主题，默认系统；Windows + macOS 10.14+ | window WindowOptions |

历史：Tauri 1.3 release notes 提到 Windows 上按 Window theme 调整 webview 以改善 `prefers-color-scheme`。[Tauri 1.3 blog](https://v2.tauri.app/blog/tauri-1-3/)

### 4.4 跟随系统 vs 强制 light/dark

| 目标 | Web 内容（`.dark`） | WebView2 / 窗口 |
|------|---------------------|-----------------|
| 跟随系统 | `matchMedia` 同步 class；或依赖 Auto | `PreferredColorScheme.Auto`；Tauri `setTheme(null)` |
| 强制 dark | 加 `.dark`，可设 `color-scheme: dark` | `setTheme('dark')`（铬）；必要时原生侧 PreferredColorScheme.Dark |
| 强制 light | 去掉 `.dark` | `setTheme('light')` |

对 Lexicon：仅 class 同步即可驱动 UI；Tauri 上建议 **同时** `setTheme` 与 appearance 对齐，避免标题栏与内容不一致。

---

## 5. Capacitor 特定

### 5.1 Capacitor 8 对 dark mode 的推荐做法

官方并未单独成章「Dark Mode Guide」，但分散指引一致：

1. **Android DayNight** 主题以跟随设备（Updating 4.0，仍适用于后续模板）。  
2. **Web 内容自管样式**（`prefers-color-scheme` 或 class）。  
3. **System Bars / Status Bar** 使用 `DEFAULT` 跟设备，或随应用主题设 `LIGHT`/`DARK`。  
4. Splash 提供 `splash-dark.png`。

**不需要**为「读系统主题」单独装原生插件；`matchMedia` 足够。

### 5.2 纯 `matchMedia` vs 原生桥

| 需求 | 是否需要原生 |
|------|----------------|
| 读/听系统（WebView）主题 | **否** — `matchMedia` |
| 持久化用户选项 `light\|dark\|system` | Preferences / 现有 Zustand persist 即可 |
| 强制与系统相反时改 **原生窗口** 风格 | iOS：`overrideUserInterfaceStyle`（若还要改 WK 的 media）；Android：`AppCompatDelegate` / night mode；多数 class-based 应用 **只改 `.dark` 即可** |
| 状态栏图标对比度 | 建议用 SystemBars/StatusBar API |
| Splash 深浅资源 | 构建资源，非运行时桥 |

### 5.3 Status bar / splash 注意点

- `Style.Default` / `SystemBarsStyle.Default`：跟 **设备** 外观，不是跟你的 in-app 强制主题。若用户选了强制 dark 而系统为 light，应显式 `setStyle(Dark)`（浅色图标）。  
- Android 15+/16：edge-to-edge 限制 Status Bar 背景 API（见上）。  
- Splash：Android 12+ 系统 splash 与旧全屏图不同；深色用 `splash-dark` / night 资源，避免启动闪白/闪黑。[Splash Screens and Icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons)

---

## Compatibility matrix

| 平台 | 系统 Dark | WebView `prefers-color-scheme` | JS 监听 | 备注 |
|------|-----------|--------------------------------|--------|------|
| 现代桌面/移动浏览器 | 视 OS | ✅ | `matchMedia` + `change` | Chrome 76+ / Safari 12.1+ / Firefox 67+ |
| iOS 14–18 | ✅（13+） | ✅（随 UIUserInterfaceStyle） | ✅ | 勿设 plist Appearance |
| iOS 19–26 | ✅（预期） | ✅（Can I Use 至 26.x） | ✅ | **文档按 UIKit 延续标注** |
| Android 9 (28) | ❌ 官方系统 Dark | 通常 light | ✅ 但几乎总是 light | `system`≈light |
| Android 10–11 (29–30) | ✅ | ✅（DayNight 下） | ✅ | 勿开 UA force-dark |
| Android 12–13 (31–33) | ✅ | ✅；注意 algorithmic API 变更 | ✅ | Splash / targetSdk 33 |
| Android 14–16 (34–36) | ✅ | ✅ | ✅ | Edge-to-edge；Capacitor 已文档化 16 |
| Android 17 (预计 37+) | 预期 ✅ | 预期 ✅ | 预期 ✅ | **文档不完整 / 预期延续** |
| Windows 10/11 + WebView2 | ✅ | ✅（PreferredColorScheme Auto） | ✅ | 可用 Tauri theme API 对齐铬 |
| Tauri 2 | ✅ | ✅ | `matchMedia` 和/或 `onThemeChanged` | `setTheme(null)` 跟随系统 |

---

## Recommended implementation for Lexicon

### 数据模型

将 `darkMode: boolean` 演进为例如：

```ts
type Appearance = 'light' | 'dark' | 'system'
```

派生：`resolvedDark = appearance === 'system' ? mql.matches : appearance === 'dark'`。

### 推荐路径（默认）

```text
┌─────────────────────────────────────────┐
│ appearance (persist)                    │
│  light | dark | system                  │
└───────────────┬─────────────────────────┘
                │
     ┌──────────▼──────────┐
     │ resolve → boolean   │
     │ system → matchMedia │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ html.classList .dark│  ← 已有 App.tsx / index.html 模式
     │ color-scheme meta   │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ Optional chrome:    │
     │ Capacitor SystemBars│
     │ Tauri setTheme()    │
     └─────────────────────┘
```

1. **`index.html` 内联脚本**（防闪）：  
   - 读 persist 的 `appearance`；  
   - `system` 时用 `matchMedia('(prefers-color-scheme: dark)').matches`；  
   - 再 `classList.add('dark')`。  
2. **运行时**：`system` 注册 `mql.addEventListener('change', ...)`；离开 `system` 时移除。  
3. **Capacitor**：`system` → `SystemBars.setStyle({ style: Default })`；强制时 Light/Dark。  
4. **Tauri**：`system` → `setTheme(null)` + 可用 `onThemeChanged` 双保险；强制 → `setTheme('light'|'dark')`。  
5. **不要**为读主题引入插件；**不要**开 Android WebView algorithmic darkening。

### 何时才需要原生桥

仅当产品要求：**强制 light 时连 WKWebView 的 `prefers-color-scheme` 也必须变 light**（例如第三方 iframe 只认 media query）。此时 iOS 需 `overrideUserInterfaceStyle`，Android 需 `setDefaultNightMode`。Lexicon 自有 UI 全走 `.dark` 时 **通常不需要**。

---

## Pitfalls

| 陷阱 | 说明 | 缓解 |
|------|------|------|
| **首屏白闪 / 黑闪** | React hydrate 前无 `.dark` | 内联脚本覆盖 `system`；`<meta name="color-scheme" content="light dark">`；CSS `color-scheme` |
| **Android Force Dark / Algorithmic** | 自有 dark CSS + UA 压暗 → 双重暗或 media 为 false | 关闭 algorithmic；依赖作者 `prefers-color-scheme` + class |
| **Info.plist `UIUserInterfaceStyle`** | 永久切断系统跟随 | 不要设置；强制用 in-app class 或运行时 override |
| **StatusBar Default vs 强制主题** | Default 跟 **设备** 不跟 in-app | 强制 light/dark 时显式设 Style |
| **Splash 与主题不一致** | 启动闪一下反色 | `splash-dark.png` / `values-night`；API 31+ 考虑 `setApplicationNightMode` |
| **仅改 class、忽略 `color-scheme`** | 滚动条/表单仍跟 OS | 同步设置 `document.documentElement.style.colorScheme` |
| **Android 9 上的 `system`** | 无系统 Dark | 文档/UI 可接受「等同浅色」或隐藏 system |
| **PWA/部分 WebView 不派发 change** | 少见；个别后台恢复问题见 Apple Forums | 回前台时重新读 `mql.matches` |
| **Tauri 只改 DOM 不改 window theme** | 标题栏与内容不一致 | 同步 `setTheme` |
| **把 Preferences 当成主题 API** | 无系统监听 | 只用它存用户选项 |

---

## Lexicon 现状对照（调研时仓库）

| 项 | 现状 |
|----|------|
| Tailwind | `@variant dark (&:where(.dark, .dark *))` — class-based |
| 设置 | `darkMode: boolean` + Toggle；persist `lexicon-settings` |
| 首屏 | `index.html` 仅当 `darkMode === true` 加 `.dark`（尚无 system） |
| Android | 已 `DayNight` + `values-night` |
| iOS | 未强制 `UIUserInterfaceStyle` |
| 文档 | `06-crossplatform.md` 写「深色模式 = CSS prefers-color-scheme」——与当前 **class 手动开关** 不完全一致；加 `system` 后应更新该表 |

---

## Primary sources index

| 主题 | URL |
|------|-----|
| prefers-color-scheme | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme |
| matchMedia | https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia |
| MQL change | https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/change_event |
| color-scheme CSS | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme |
| meta color-scheme | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/color-scheme |
| Can I Use | https://caniuse.com/prefers-color-scheme |
| UIUserInterfaceStyle | https://developer.apple.com/documentation/uikit/uiuserinterfacestyle |
| Choosing interface style | https://developer.apple.com/documentation/uikit/choosing-a-specific-interface-style-for-your-ios-app |
| Supporting Dark Mode (UI) | https://developer.apple.com/documentation/uikit/supporting-dark-mode-in-your-interface |
| WWDC19 Web Dark Mode | https://developer.apple.com/videos/play/wwdc2019/511/ |
| WWDC19 iOS Dark Mode | https://developer.apple.com/videos/play/wwdc2019/214/ |
| Android dark theme | https://developer.android.com/develop/ui/views/theming/darktheme |
| WebView darken | https://developer.android.com/develop/ui/views/layout/webapps/dark-theme |
| Android 10 features | https://developer.android.com/about/versions/10/features |
| Win32 dark/light | https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-windows-themes |
| UISettings.ColorValuesChanged | https://learn.microsoft.com/en-us/uwp/api/windows.ui.viewmanagement.uisettings.colorvalueschanged |
| WebView2 PreferredColorScheme | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile |
| PreferredColorScheme enum | https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2preferredcolorscheme |
| Tauri window theme | https://v2.tauri.app/reference/javascript/api/namespacewindow/ |
| Tauri app setTheme | https://v2.tauri.app/reference/javascript/api/namespaceapp/ |
| Capacitor System Bars | https://capacitorjs.com/docs/apis/system-bars |
| Capacitor Status Bar | https://capacitorjs.com/docs/apis/status-bar |
| Capacitor Splash/Icons | https://capacitorjs.com/docs/guides/splash-screens-and-icons |
| Capacitor DayNight note | https://capacitorjs.com/docs/updating/4-0 |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-28 | 初稿：跨平台 system appearance 一手资料调研 |
