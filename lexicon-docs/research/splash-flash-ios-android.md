# Capacitor WebView：浅色/深色启动防闪屏（黑闪/白闪）调研

> 调研日期：2026-07-28  
> 适用项目：Lexicon（Capacitor 8；iOS LaunchScreen + Android `Theme.SplashScreen` / `core-splashscreen` 1.2.0；Tailwind **class-based** `.dark`；背景 token 浅 `#FFFFFF` / 深 `#050505`）  
> 范围：iOS 16–26；Android 10–17（API 29 – 预计 API 37+）  
> 一手来源优先：Apple Developer Documentation / WWDC / HIG；developer.android.com；Capacitor 官方文档与上游源码。

---

## 1. Executive summary（对 Lexicon + Capacitor 的推荐策略）

**结论：闪屏来自「原生启动层 → WebView 底色 → Web 首帧」三层颜色不一致；Lexicon 当前在 Android 用透明 `windowBackground`、未接线 `splash_dark`、缺少 SplashScreen 正式属性，在 iOS 用仅浅色 Splash 图 + 默认 `systemBackground`、无 `capacitor.config` `backgroundColor`，正好踩中官方反模式。**

| 层 | 正确做法 | Lexicon 应落地 |
|----|----------|----------------|
| **系统 Launch / Splash** | 浅/深各有**不透明**底色（或 appearance-aware 资源）；Android 12+ 用 `windowSplashScreenBackground` + icon，**禁止透明** | 接好 `values` / `values-night` 的 SplashScreen 主题；iOS Asset Catalog 加 Dark Appearance |
| **Activity / Bridge 过渡** | `postSplashScreenTheme`（或 Capacitor `setTheme(NoActionBar)`）切到与 Web 一致的 DayNight 主题 | 保持 DayNight；强制 light/dark 时用 `UiModeManager` / `AppCompatDelegate` **尽早**声明 |
| **WebView 底色** | Capacitor `backgroundColor`（或默认 `UIColor.systemBackground` / Android WebView bg）与即将显示的 HTML 同色 | `system` 跟系统时依赖 `systemBackground`/DayNight；强制浅/深时设固定色或运行时改原生底色 |
| **Web 首帧** | `index.html` 内联脚本在 React 挂载前加 `.dark` + `color-scheme` | 已有（AGENT.md）；继续保持与原生色对齐 |

**平台一句话：**

- **iOS**：Launch storyboard + Asset Catalog **Any / Dark** splash；勿写死 `UIUserInterfaceStyle`（除非产品强制）；WebView 默认 `systemBackground` 已跟随系统——强制主题时才需要 `backgroundColor` 或 `overrideUserInterfaceStyle`。
- **Android**：用 `Theme.SplashScreen` + **不透明** `windowSplashScreenBackground`（及 night 变体）+ `postSplashScreenTheme` → DayNight；`installSplashScreen`（经 `@capacitor/splash-screen` 或自写）+ 可选 `keepOnScreenCondition`；**不要**用透明 `windowBackground` 当「防闪」手段。

---

## 2. iOS 16–26

### 2.1 Launch Screen / `UILaunchStoryboardName` / storyboard 约束

- Info.plist **`UILaunchStoryboardName`**：指定用于生成启动图的 storyboard 文件名（无扩展名）。  
  来源：[UILaunchStoryboardName](https://developer.apple.com/documentation/bundleresources/information-property-list/uilaunchstoryboardname)
- 也可不用 storyboard，用 **`UILaunchScreen`** 字典（如 `UIColorName`、`UIImageName` 等）配置启动 UI。  
  来源：[UILaunchScreen](https://developer.apple.com/documentation/bundleresources/information-property-list/uilaunchscreen) · [Specifying your app’s launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
- Storyboard 约束（官方）：
  - 仅用 **UIKit** 类；
  - 单一 root view（`UIView` / `UIViewController`）；
  - **禁止**连到代码（actions/outlets）、自定义类、runtime attributes、已废弃视图。  
  来源：[Specifying your app’s launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
- **Appearance-aware assets：可用。** WWDC19 明确：可对 Launch storyboard 做与 App 相同的动态颜色/图片改动以支持 Dark Mode。Asset Catalog 可为同一命名资源提供 light/dark（及 high contrast）变体；绘制时系统按当前 trait 选图。  
  来源：[WWDC19-214 Implementing Dark Mode on iOS](https://developer.apple.com/videos/play/wwdc2019/214/) · [Providing images for different appearances](https://developer.apple.com/documentation/uikit/providing-images-for-different-appearances)
- 设计侧：启动画面应接近首屏，以求「无缝」。  
  来源：[HIG — Launch screens](https://developer.apple.com/design/human-interface-guidelines/launch-screens)（与 Xcode 文档交叉引用）

**注意（实操坑，非 API 废弃）：** 系统会缓存启动快照；改 Launch Screen / Asset 后需清装或重启设备才易验证。Forum 上有「仅 storyboard 预览暗色、真机仍白」的缓存类报告——属验证问题，不否定 appearance 资源模型。

### 2.2 `UITraitCollection` / `UIUserInterfaceStyle` / `overrideUserInterfaceStyle`（启动时）

| API | 行为 |
|-----|------|
| `UIUserInterfaceStyle`（`.unspecified` / `.light` / `.dark`） | 界面风格常量。 |
| `overrideUserInterfaceStyle`（VC） | 强制该 VC 及其子树为 light/dark；默认 `.unspecified` → **从系统或父级继承**。 |
| Info.plist `UIUserInterfaceStyle` | `Automatic`（默认/等同未设）跟随系统；`Light`/`Dark` **强制整 app**，忽略系统变更。 |

来源：

- [UIUserInterfaceStyle](https://developer.apple.com/documentation/uikit/uiuserinterfacestyle)
- [overrideUserInterfaceStyle](https://developer.apple.com/documentation/uikit/uiviewcontroller/overrideuserinterfacestyle)
- [Info.plist UIUserInterfaceStyle](https://developer.apple.com/documentation/bundleresources/information-property-list/uiuserinterfacestyle)

**启动含义：** Launch Screen 快照按**当时系统外观**（及 asset 变体）生成；进程起来后若 VC/`UIUserInterfaceStyle` 强制与系统相反，会出现「启动一色 → App 另一色」的闪变。强制外观应在**首帧前**与 WebView/`html.dark` 对齐。

### 2.3 WKWebView：`backgroundColor` / `isOpaque` / `underPageBackgroundColor`

- **`underPageBackgroundColor`**：页面背后、滚动超出页面边界时可见的颜色；默认从页面（html/body）与 web view 背景推导；可覆盖。  
  来源：[underPageBackgroundColor](https://developer.apple.com/documentation/webkit/wkwebview/underpagebackgroundcolor) · [WWDC21-10032 Explore WKWebView additions](https://developer.apple.com/videos/play/wwdc2021/10032/)
- **`backgroundColor` + `isOpaque`**：决定 WebView 在**内容未绘制/透明**时露出的原生色。首帧前 HTML 未上色时，此色即「白闪/黑闪」来源之一。
- Capacitor 未设 `backgroundColor` 时：`CAPBridgeViewController` 将 `WKWebView` 与 `scrollView` 设为 **`UIColor.systemBackground`**（随 light/dark trait）。若配置了 `backgroundColor`，则用固定色。  
  来源：[CAPBridgeViewController.swift（upstream）](https://github.com/ionic-team/capacitor/blob/main/ios/Capacitor/Capacitor/CAPBridgeViewController.swift) · [Capacitor Config — backgroundColor](https://capacitorjs.com/docs/config)

### 2.4 Info.plist `UIUserInterfaceStyle` 强制浅/深

见 §2.2。对 Lexicon：`system` 外观必须**不设**或 `Automatic`；强制 light/dark 时才写 plist 或设 `overrideUserInterfaceStyle`（并接受 `prefers-color-scheme` 只反映强制值）。

### 2.5 Capacitor iOS：`backgroundColor`、`CAPBridgeViewController`、`systemBackground`

| 配置 | 效果 |
|------|------|
| 全局 / `ios.backgroundColor` | 覆盖 WebView 底色（hex） |
| 未配置 | `UIColor.systemBackground`（iOS 13+ 动态） |
| Launch storyboard | 模板常用 `systemBackgroundColor`，与 WebView 默认对齐 |

来源：[Capacitor Config](https://capacitorjs.com/docs/config) · Capacitor commit [feat(ios): improve initial webview loading appearance](https://github.com/ionic-team/capacitor/commit/49720a5)（Launch + WebView 对齐 system background）

**限制：** 配置项是**编译期/启动期静态色**；用户在设置里切 light↔dark 时，若曾写死 `#FFFFFF`，深色会话仍可能键盘关闭等场景闪白（社区 issue 亦反映「无法 runtime 改底色」）。跟随系统时优先**不要写死**，依赖 `systemBackground`。

### 2.6 Asset Catalog：Any Appearance / Dark Appearance splash

- 在 image set 上设 Appearances = **Any, Dark**（或 Any, Light, Dark），分别放入浅/深图；「Any」兼容旧系统。  
  来源：[Providing images for different appearances](https://developer.apple.com/documentation/uikit/providing-images-for-different-appearances)
- Capacitor `@capacitor/assets` 支持 `splash.png` + `splash-dark.png` 生成。  
  来源：[Splash Screens and Icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons)

### 2.7 iOS compatibility matrix

| 版本 | Launch / Dark | WebView 底色 | 文档状态 |
|------|---------------|--------------|----------|
| **iOS 16–18** | Storyboard + appearance assets；`systemBackground`；`overrideUserInterfaceStyle` | `systemBackground` / `backgroundColor`；`underPageBackgroundColor`（iOS 15+） | 文档完整 |
| **iOS 19–25** | 同左；无官方宣布更换 Launch 模型 | 同左 | 文档按 UIKit 现行页 |
| **iOS 26** | **预期延续** trait / Launch storyboard / Asset Appearance 模型；未见单独「废除 appearance splash」说明 | **预期延续** | **文档按版本号不完整 → 标注「预期延续」** |

---

## 3. Android 10–17

### 3.1 Android 10–11：`windowBackground` / splash drawable / DayNight / `AppCompatDelegate`

- 系统 Dark theme：Android 10（API 29）+。App 主题应继承 **DayNight**（如 `Theme.AppCompat.DayNight`）。  
  来源：[Implement dark theme](https://developer.android.com/develop/ui/views/theming/darktheme)
- 启动屏最佳实践：去掉写死白色背景；用 `?android:attr/colorBackground` 等主题属性；**「Dark-themed `android:windowBackground` drawables only work on Android 10」**（相对更早系统）。  
  同上文档 *Launch screens* 小节。
- 应用内切换：`MODE_NIGHT_NO` / `YES` / `FOLLOW_SYSTEM` → `AppCompatDelegate.setDefaultNightMode()`（API ≤30 推荐路径）。  
  同上。
- Android 12 以前可用全屏 `windowBackground` drawable 做自定义 splash；**从 12 起必须迁移**，否则系统默认 splash 会替换或叠出双 splash。  
  来源：[Migrate to Android 12 splash](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)

### 3.2 Android 12+ SplashScreen API

冷/热启动（非 hot start）由系统显示 SplashScreen Window，覆盖 Activity。

**必做 / 推荐属性（compat 主题 `Theme.SplashScreen`）：**

| 属性 | 作用 |
|------|------|
| `windowSplashScreenBackground` | **单一不透明色**填充窗口背景 |
| `windowSplashScreenAnimatedIcon` | 中心图标（矢量/AVD；迁移文档称其一为 required） |
| `windowSplashScreenAnimationDuration` | 动画时长（动画图标） |
| `postSplashScreenTheme` | splash 结束后 Activity 使用的主题（**required**） |
| 可选 `windowSplashScreenIconBackground` | 图标衬底（`Theme.SplashScreen.IconBackground`） |

官方硬性要求摘要：

- Window background：**single color, no transparency**。
- Day / Night：SplashScreen **compat 库支持** light/dark 元素变体。
- 默认：若未设 splash 背景且 `windowBackground` 为**单色**，则用其作为 splash 背景。
- `SplashScreen.installSplashScreen()`：**在 starting activity 的 `super.onCreate()` 之前**调用。
- `setKeepOnScreenCondition`：在首帧前可继续挡住内容（路由 Activity、等资源就绪）。
- Compat：`androidx.core:core-splashscreen` 把 Android 12 体验带到 **API 23+**。

来源：

- [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen)
- [Migrate your splash screen…](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- [Android 12 behavior changes](https://developer.android.com/about/versions/12/behavior-changes-all)
- [SplashScreen (AndroidX)](https://developer.android.com/reference/kotlin/androidx/core/splashscreen/SplashScreen)

Android 13+：`windowSplashScreenBehavior` 等可控制是否始终显示 icon（见 splash 文档更新段落）。

### 3.3 Android 13–16（及 17）与 WebView / class-based 主题

**`prefers-color-scheme` ↔ `isLightTheme`：**

- WebView **始终**按 app 主题的 `isLightTheme` 设置 `prefers-color-scheme`：`true`/未设 → light；`false` → dark。  
  来源：[Darken web content in WebView](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme) · [Behavior changes targeting Android 13+](https://developer.android.com/about/versions/13/behavior-changes-13)

**Algorithmic darkening：**

- 仅在内容**未**用 `prefers-color-scheme`（及作者未禁用）等条件下，才可能算法压暗。
- Target 33+：`WebSettingsCompat.setAlgorithmicDarkeningAllowed`；更旧：`FORCE_DARK_*`。
- UA darkening 模式下 **`prefers-color-scheme: dark` 可能为 false**（防双重变暗）。

**对 Lexicon（class-based `.dark`）：**

- 业务 UI **不依赖** media query 切主题 → 仍应保证原生 DayNight / `isLightTheme` 与用户选择一致，否则 `matchMedia`（`system` 模式）与系统栏会错。
- **关闭** algorithmic / force-dark，避免与自管 CSS 冲突。

**Android 15–16：** 行为变更以 edge-to-edge、大屏等为主；**未见**废除 SplashScreen API 的说明。Status Bar `backgroundColor` 等在高 API 受限（Capacitor Status Bar 文档），与 splash 正交但影响「铬」一致性。  
来源：[Android 15 / 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)

**Android 17（预计 API 37+）：** 平台文档尚不完整；**预期延续** SplashScreen + DayNight + WebView `isLightTheme` 模型。标注：**预期延续**。

### 3.4 AndroidX `core-splashscreen` 对 API 29–30

- 官方：compat 在全版本显示**一致的** Android 12 风格 splash；若直接用平台 API，则 11 及以下仍像迁移前，12+ 才是新样式。  
  来源：[Migrate…](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- Lexicon：`minSdk 24`，`coreSplashScreenVersion = 1.2.0`（Capacitor 8 模板）。API 29–30 走 compat 实现，**仍应**配置不透明 `windowSplashScreenBackground` 与 icon，而不是依赖旧全屏 PNG + 透明窗。

### 3.5 Capacitor `BridgeActivity`：`setTheme(AppTheme.NoActionBar)` 与闪屏

上游 `BridgeActivity.onCreate`：

1. `super.onCreate(...)`
2. `getApplication().setTheme(R.style.AppTheme_NoActionBar)`
3. `setTheme(R.style.AppTheme_NoActionBar)`
4. `setContentView` → 创建 WebView

来源：[BridgeActivity.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java)

Manifest 上 Activity 主题为 **`AppTheme.NoActionBarLaunch`**（`Theme.SplashScreen`），进程创建后切到 **`NoActionBar`**。这相当于官方 `postSplashScreenTheme` 的角色。

若安装 **`@capacitor/splash-screen`**：插件内 `SplashScreen.installSplashScreen(activity)` + `setKeepOnScreenCondition`，可延长系统 splash 直到 `hide()`。  
来源：[capacitor-plugins SplashScreen.java](https://github.com/ionic-team/capacitor-plugins/blob/main/splash-screen/android/src/main/java/com/capacitorjs/plugins/splashscreen/SplashScreen.java) · [Splash Screen API 文档](https://capacitorjs.com/docs/apis/splash-screen)

**Lexicon 当前未依赖 `@capacitor/splash-screen`** → 依赖系统默认 dismiss（首帧）+ `BridgeActivity` 切主题；更需保证 Launch 主题与 NoActionBar 的 **window/背景色**在浅/深下都不透明且与 Web 一致。

Android WebView `backgroundColor`：Capacitor `Bridge` 在配置了 `backgroundColor` 时 `webView.setBackgroundColor(...)`。  
来源：[Bridge.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java)

### 3.6 `UiModeManager.setApplicationNightMode`（API 31+）

官方 *Change themes in-app*：

- **API 31+**：用 `UiModeManager#setApplicationNightMode` 告知系统 app 主题 → **「lets the system match the theme during the splash screen」**。
- **API ≤30**：用 `AppCompatDelegate.setDefaultNightMode()`。

来源：[Implement dark theme](https://developer.android.com/develop/ui/views/theming/darktheme) · [UiModeManager](https://developer.android.com/reference/android/app/UiModeManager)

对「设置里强制 dark、但系统是 light」：若仅改 Web `.dark` 而不改 night mode，**冷启动 splash 仍跟系统**，必闪。强制外观必须尽早写 night mode（并准备 `values` / `values-night` 资源）。

### 3.7 Android compatibility matrix

| API / 版本 | Splash 机制 | 主题 API | WebView 主题 | 文档状态 |
|------------|-------------|----------|--------------|----------|
| **29–30**（10–11） | 旧 `windowBackground` drawable；建议已接 compat | `AppCompatDelegate.setDefaultNightMode` | Force Dark / 早期 FORCE_DARK；DayNight 推荐 | 完整 |
| **31–32**（12–12L） | 系统强制 SplashScreen；须迁移 | `setApplicationNightMode` 可用 | 过渡期 algorithmic API | 完整；第三方 launcher 上 icon 异常见 Capacitor 文档 |
| **33–34**（13–14） | 同上 + `windowSplashScreenBehavior` 等 | 同上 | `prefers-color-scheme` **绑定** `isLightTheme`；algorithmic API 更新 | 完整 |
| **35–36**（15–16） | SplashScreen **预期仍适用**；edge-to-edge 强制 | 同上 | 同左；铬/inset 变化 | 行为变更页无「废 splash」 |
| **37+**（17 预计） | **预期延续** | **预期延续** | **预期延续** | **文档不完整 → 预期延续** |

---

## 4. Lexicon 现状问题对照

对照代码与文档（2026-07-28）：

| 已知点 | 现状 | 与官方的冲突 / 闪屏机制 |
|--------|------|-------------------------|
| **transparent `windowBackground`** | `AppTheme.NoActionBar` 与 `NoActionBarLaunch` 在 `values` 与 `values-night` 均为 `@android:color/transparent` | Android 明确要求 splash 背景 **opaque single color**；透明会导致系统默认色/未定义闪烁 |
| **`splash` / `splash_dark` 未接线** | 存在 `drawable/splash.png`、`splash_dark.png` 及多密度 `splash.png`；**styles 未引用**；`NoActionBarLaunch` 无 `windowSplashScreenBackground` / `AnimatedIcon` / `postSplashScreenTheme` | AGENT.md 写「values-night 深色 splash（splash_dark）」与**实文件不符**（night 仍是 transparent） |
| **Capacitor `systemBackground`（iOS）** | 未设 `backgroundColor` → WebView 用 `systemBackground` | 跟随系统时合理；与 **仅浅色** Splash 图叠加深色启动仍可能图标/底不一致 |
| **无 `backgroundColor` config** | `capacitor.config.ts` 无全局/`ios`/`android` `backgroundColor` | 强制浅/深时无法静态对齐 WebView 底；`system` 模式反而应保持不设 |
| **`BridgeActivity` 切浅色主题？** | 切到 `AppTheme.NoActionBar`，parent 为 **`DayNight.NoActionBar`**（非 Light） | 命名易误解；实际是 DayNight。若用户强制 dark 但未 `setDefaultNightMode`/`setApplicationNightMode`，冷启动仍跟系统 |
| **iOS Splash asset** | `Splash.imageset` **无** Dark Appearance 槽；LaunchScreen 用 `systemBackgroundColor` + 浅色图 | 深色模式：底可能暗、图仍浅（或缓存浅色快照） |
| **无 `@capacitor/splash-screen`** | package.json 无此依赖 | 无 `installSplashScreen` / `keepOnScreenCondition`；Web 首帧前可能过早露出未就绪 WebView |
| **Web 防闪** | `index.html` 内联 + `color-scheme`（AGENT） | 正确，但挡不住**原生层** transparent / 错色 |

---

## 5. Recommended implementation plan（分阶段）

### Phase 0 — 对齐色板（跨端）

- 锁定原生与 Web 同色：浅 `#FFFFFF`，深 `#050505`（与 `src/index.css` `--color-background` 一致；勿混用旧 `#030712`）。
- 文件：`colors.xml` / `values-night/colors.xml`（Android）；可选 Named Color asset（iOS）。

### Phase 1 — Android SplashScreen 正规化（优先，闪屏最重）

1. `AppTheme.NoActionBarLaunch`：
   - `parent=Theme.SplashScreen`（已有）
   - `windowSplashScreenBackground` → `@color/splash_bg`（浅）
   - `windowSplashScreenAnimatedIcon` → 自适应/矢量 logo（或现有 icon）
   - `postSplashScreenTheme` → `@style/AppTheme.NoActionBar`
   - **删除** transparent `windowBackground` / `android:background`
2. `values-night`：同结构，`splash_bg` / icon 用深色；若继续用位图，可 `windowSplashScreenBackground` 指深色，**或**将 `splash_dark` 仅作 pre-12 遗留（minSdk 24 + compat 后以色+icon 为主）。
3. `AppTheme.NoActionBar`：不透明 `windowBackground` = 同色（防切主题后露系统默认白/黑）。
4. 可选：加入 `@capacitor/splash-screen`，在 Web ready 后 `SplashScreen.hide()`，并用 `keepOnScreenCondition` 盖住加载空窗。
5. 强制 appearance：读持久化设置后，API 31+ `UiModeManager.setApplicationNightMode`，否则 `AppCompatDelegate.setDefaultNightMode`（尽量早于首屏绘制）。

**文件类型：** `styles.xml`、`values-night/styles.xml`、`colors.xml`、`drawable`/`mipmap` 矢量、可选 `MainActivity.java`、`capacitor.config.ts`、`package.json`。

### Phase 2 — iOS Launch + WebView

1. `Splash.imageset`：Appearances = Any, Dark；或用 `@capacitor/assets` 的 `splash-dark.png` 再 generate。
2. LaunchScreen：背景用 `systemBackground` 或 Named Color（Any/Dark）；图用 appearance-aware Splash。
3. **不设** `UIUserInterfaceStyle`（保留 system）。
4. `capacitor.config`：`system` 模式不写死 `backgroundColor`；若产品只要强制浅/深，再考虑静态色或原生桥改色。
5. 清缓存验证：重装 / 删 App 后看 Launch。

**文件类型：** `Assets.xcassets`、`LaunchScreen.storyboard`、`Info.plist`（通常不动 Appearance）、`capacitor.config.ts`。

### Phase 3 — Web 与强制主题闭环

- 保持 `index.html` 同步脚本。
- `appearance === 'light'|'dark'`：同步 Status Bar；Android night mode；iOS 可选 `overrideUserInterfaceStyle`（需原生插件/自定义 VC）。
- 明确：**不要**开 WebView algorithmic darkening。

### Phase 4 — 回归矩阵

- 冷启动 × {系统浅, 系统深} × {app: system, light, dark}
- Android 10 模拟器 + API 31/33/35 真机；iOS 16+ 浅/深
- 验证无双 splash、无透明露底、无「闪系统默认白/黑」

---

## 6. Pitfalls & version-specific gotchas

1. **透明 `windowBackground`「防闪」是反模式** — Android 12+ 要求不透明单色；透明 = 未定义/默认 splash 行为。  
   [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen)
2. **未迁移旧 splash** — 系统默认 splash 替换自定义，或 Activity splash + 系统 splash 双闪。  
   [Migrate…](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
3. **只改 Web `.dark`、不改 night mode** — 冷启动 splash 与 `isLightTheme`/`prefers-color-scheme` 仍跟系统。  
   [Implement dark theme](https://developer.android.com/develop/ui/views/theming/darktheme) · [WebView dark](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme)
4. **`installSplashScreen` 必须在 `super.onCreate` 前** — Capacitor 插件在内部处理；自写时勿放错。  
   [Migrate…](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
5. **Android 12/12L 第三方 Launcher** — 启动 splash 图可能不显示（Google 在 13 修、不 backport）。  
   [Capacitor Splash Screen](https://capacitorjs.com/docs/apis/splash-screen)
6. **iOS Launch 缓存** — 改 storyboard/asset 后真机仍旧图，易误判「Dark Appearance 无效」。
7. **写死 `capacitor.config` `backgroundColor`** — 无法同时完美服务浅/深；跟随系统应依赖 `systemBackground`。  
   [Config](https://capacitorjs.com/docs/config) · Capacitor issues 讨论 runtime 改色限制
8. **UA algorithmic darkening** — 可使 `prefers-color-scheme` 失真；与 class-based 主题叠加更糟。  
   [Darken web content in WebView](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme)
9. **Launch storyboard 限制** — 无自定义类/代码；复杂 Lottie 等不能进 Launch。  
   [Specifying your app’s launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
10. **Info.plist 强制 `UIUserInterfaceStyle`** — 破坏 `system` 选项与真实系统偏好。  
    [UIUserInterfaceStyle](https://developer.apple.com/documentation/bundleresources/information-property-list/uiuserinterfacestyle)
11. **iOS 26 / Android 17** — 以现行 API 文档为准，版本专章缺失处按 **预期延续** 规划，发版前再核对 release notes。

---

## 7. 关键主张与官方链接索引

| # | 主张 | 链接 |
|---|------|------|
| 1 | iOS 须提供 Launch Screen（storyboard 名或 `UILaunchScreen`） | [UILaunchStoryboardName](https://developer.apple.com/documentation/bundleresources/information-property-list/uilaunchstoryboardname) · [UILaunchScreen](https://developer.apple.com/documentation/bundleresources/information-property-list/uilaunchscreen) · [Specifying launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen) |
| 2 | Launch storyboard 仅限基础 UIKit、无代码连接 | 同上 Specifying… |
| 3 | Asset Catalog 可为 light/dark（Any Appearance）提供不同图；系统按 trait 绘制 | [Providing images for different appearances](https://developer.apple.com/documentation/uikit/providing-images-for-different-appearances) |
| 4 | Launch storyboard 应支持 Dark Mode（与动态色/图同一套） | [WWDC19-214](https://developer.apple.com/videos/play/wwdc2019/214/) |
| 5 | `overrideUserInterfaceStyle` 强制 VC 子树外观；默认继承系统 | [overrideUserInterfaceStyle](https://developer.apple.com/documentation/uikit/uiviewcontroller/overrideuserinterfacestyle) |
| 6 | Info.plist `UIUserInterfaceStyle` 可强制 Light/Dark 并忽略系统 | [UIUserInterfaceStyle (plist)](https://developer.apple.com/documentation/bundleresources/information-property-list/uiuserinterfacestyle) |
| 7 | `underPageBackgroundColor` 为页背后色，默认可由内容与 web view 推导 | [underPageBackgroundColor](https://developer.apple.com/documentation/webkit/wkwebview/underpagebackgroundcolor) |
| 8 | Capacitor 未设 `backgroundColor` 时用 `UIColor.systemBackground` | [CAPBridgeViewController](https://github.com/ionic-team/capacitor/blob/main/ios/Capacitor/Capacitor/CAPBridgeViewController.swift) · [Config](https://capacitorjs.com/docs/config) |
| 9 | Capacitor assets：`splash.png` + `splash-dark.png` | [Splash Screens and Icons](https://capacitorjs.com/docs/guides/splash-screens-and-icons) |
| 10 | Android 10+ Dark theme；DayNight；启动屏勿写死白底 | [Implement dark theme](https://developer.android.com/develop/ui/views/theming/darktheme) |
| 11 | API 31+ 用 `setApplicationNightMode` 以便 **splash 匹配** app 主题；≤30 用 `AppCompatDelegate` | 同上 |
| 12 | Android 12+ 系统强制 SplashScreen；须迁移 | [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen) · [Migrate](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate) · [API 31 behavior](https://developer.android.com/about/versions/12/behavior-changes-all) |
| 13 | Splash 背景须**单色不透明**；compat 支持 Day/Night | [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen) |
| 14 | `postSplashScreenTheme`、`installSplashScreen`（`super.onCreate` 前）、`keepOnScreenCondition` | [Migrate](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate) |
| 15 | `core-splashscreen` 将 12 体验带到 API 23+ | [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen) |
| 16 | WebView `prefers-color-scheme` 跟 `isLightTheme`；algorithmic darkening 规则与副作用 | [Darken web content in WebView](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme) · [Android 13 behavior](https://developer.android.com/about/versions/13/behavior-changes-13) |
| 17 | Capacitor `BridgeActivity` 从 Launch 主题切到 `AppTheme.NoActionBar` | [BridgeActivity.java](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java) |
| 18 | Capacitor 4+ 建议 DayNight + Android 12 SplashScreen 主题 | [Updating to 4.0](https://capacitorjs.com/docs/updating/4-0) |
| 19 | HIG：启动画面应接近首屏 | [HIG Launch screens](https://developer.apple.com/design/human-interface-guidelines/launch-screens) |

---

## 附录：与姊妹调研的关系

- 系统外观检测与 `matchMedia`：见 [`system-appearance-crossplatform.md`](./system-appearance-crossplatform.md)。  
- 本文聚焦 **原生启动层与 WebView 底色**；不重复 Status Bar / Tauri 细节，仅在计划中交叉引用。
