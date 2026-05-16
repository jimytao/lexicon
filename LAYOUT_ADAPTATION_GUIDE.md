# Lexicon 布局与 UI/UX 适配全指南 (Layout & UI/UX Adaptation Guide)

> **版本：** 2.0 (2026-05-17)  
> **适用平台：** PC (Tauri), iOS (Capacitor), Android 8–16 (Capacitor)  
> **核心原则：** 极致美学、全面屏沉浸、零重叠、流畅交互

本文档作为 Lexicon 项目 UI 开发的"最高准则"。基于过去 UI 迭代引发的适配回归，本文档确立了经过验证的"终极方案"。**任何偏离此准则的改动必须经过严格评审。**

---

## 1. 全面屏与安全区策略 (Edge-to-Edge)

### 1.1 开启沉浸式
- **Android**: `MainActivity.java` 必须调用 `setDecorFitsSystemWindows(false)` (API 30+) 或设置全屏 Flag (API < 30)。同时设置 StatusBar 与 NavigationBar 为透明。
  - > ⚠️ **Android 15+ (API 35)**: targetSdk 35 起，edge-to-edge **强制生效**，`setDecorFitsSystemWindows(true)` 将被系统忽略。Android 16 起临时 opt-out (`windowOptOutEdgeToEdgeEnforcement`) 也将失效。请确保所有 UI 均已正确处理 WindowInsets。
- **iOS**: `index.html` 的 meta 标签必须包含 `viewport-fit=cover`。
- **Viewport Meta（必选）**: 必须包含 `interactive-widget=resizes-content`，明确指定 Android/Chromium 键盘弹出时布局视口随之缩小，使滚动容器能自然适应键盘高度。

### 1.2 安全区工具类 (CSS)
严格使用以下工具类，支持环境变量 `env()` 与 JS 补丁变量 `--safe-area-inset-*` 双重回退：
- `.pt-safe`: `padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`
- `.pb-safe`: `padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))`
- `.top-safe`: `top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`
- `.pb-nav-safe`: 复合留白（用于底部内容），值为 `calc(6rem + env(safe-area-inset-bottom, 0px))`。
- `.top-header-offset`: 用于吸顶于主 Header 下方的元素，值为 `calc(72px + env(safe-area-inset-top, 0px))`。（72px = Header h-14 + 底部 pb-4）

> **历史兼容备注**: iOS 11.0–11.1 使用 `constant(safe-area-inset-*)` 而非 `env()`，该函数已在 iOS 11.2 后废弃。当前 iOS 版本分布已无需兼容，此处仅作记录。

### 1.3 初始化补丁 (App.tsx Logic)
由于旧版 Android WebView（Chromium < 140）可能不报告 `env()` 值（已知 Bug，Capacitor 社区有充分记录），`App.tsx` 必须执行以下初始化：
1. **探测**：创建一个隐藏 Div，尝试应用 `env(safe-area-inset-top)`。
2. **校验**：若计算结果为 `0px` 且平台为 Android，则判定为失效。
3. **注入**：手动向 `:root` 注入 `--safe-area-inset-top: 28px` 作为安全保底。

> **关于 28px**：Android 典型状态栏高度为 24–28dp。28px 取上限以确保在各设备上不发生重叠。替代方案：可使用 `@capacitor-community/safe-area` 插件自动获取精确值。

---

## 2. 键盘避让"动静隔离"方案 (Keyboard Occlusion)

### 2.1 隔离分流表
| 设备环境 | Native 模式 | JS 层逻辑 | 预期行为 |
| :--- | :--- | :--- | :--- |
| **Android 11+** | `adjustResize` _(API 30 deprecated, 但 WebView 场景仍有效)_ | **不注册 focus 监听**。利用 `visualViewport` 微调。 | 系统自动收缩 WebView，内容自然滚动。 |
| **Android 10-** | `adjustPan` | **注册 focusin/focusout**。 | 添加 `45vh` 补白并 `scrollIntoView`。 |
| **iOS** | N/A | 监听 `visualViewport` resize 事件。 | 动态计算真实可用高度并调整 Padding。 |
| **PC** | N/A | 无 | 无需处理。 |

> **Native 拦截**：在 `MainActivity.java` 中，若 `SDK_INT <= 29`（Android 10-），强制通过代码设置 `SOFT_INPUT_ADJUST_PAN`。

### 2.2 实现细节 (Keyboard Infrastructure)
1. **`data-kb-padded` 标记**：JS 动态添加 Padding 时必须给容器设置此属性，确保在 `focusout` 时能精准清除样式。
2. **两段式滚动**：`scrollIntoView({ block: 'center' })` 必须执行两次（立即 + 250ms 延迟），以抵消视口高度变化导致的定位偏差。
3. **Scrollable Ancestor 探测**：自动寻找最近的 `overflow-y-auto` 容器进行 Padding 补偿，而非盲目修改 `body`。

---

## 3. Z-Index 梯度规范

| Z-Index | 组件 | 备注 |
| :--- | :--- | :--- |
| `z-0` | 背景装饰 | 网格、虚化圆点 |
| `z-10` | 页面内容 | 列表项、卡片 |
| `z-20` | Sticky 元素 | 页面内的二级吸顶 |
| `z-30` | **主 Header** | 包含 SearchBar。必须遮挡滚动内容。 |
| `z-50` | **悬浮胶囊底栏** | 位于所有视图之上。 |
| `z-60` | **Toast / Alert** | 全局通知，必须可见。 |
| `z-100+` | 全屏 Modal | 设置页、更新弹窗。 |

## 4. 交互逻辑与反馈规范

### 4.1 触控目标 (Touch Targets)
- **最小尺寸**：所有移动端点击目标（按钮、链接、开关）必须满足最小 **44x44px** 的物理点击区域。对于视觉上较小的图标，应通过增加 `padding` 或透明包裹层来实现。
- **反馈动效**：点击时应有明显的视觉反馈（如 `active:scale-95` 或背景色轻微变化）。

### 4.2 悬浮与可见性 (Hover vs. Touch Visibility)
- **非侵入式悬浮**：在桌面端 (PC) 推荐使用 `group-hover:opacity-100` 来保持界面简洁。
- **移动端常态化**：**严禁**在移动端 (iOS/Android) 依赖 `hover` 触发关键操作按钮（如删除、展开）的可见性。在 `md` 断点以下， these 按钮必须保持常态可见（建议 `opacity-60` 以上），确保触屏用户可感知。

---

## 5. UI 变更审查 Checklist

- [ ] **Viewport 适配**：是否确认 `index.html` 包含 `viewport-fit=cover` 和 `interactive-widget=resizes-content`？
- [ ] **吸顶冲突**：使用 `sticky top-0` 时，是否嵌套了 `pt-safe` 或使用了 `.top-safe`？
- [ ] **点击区域**：移动端点击目标是否满足最小 44x44px 的规范？
- [ ] **悬浮兼容**：是否存在仅靠 hover 才能点中的按钮？移动端是否已设为常态可见？
- [ ] **虚拟键盘**：在 Android 9/10 环境下，点击 Input 是否会触发内容遮挡？
- [ ] **Android 15+ 验证**：确认 edge-to-edge 强制生效后内容仍正确避让。
- [ ] **性能模式**：`.perf-mode` 下是否成功移除了高耗能装饰？

---

**"好的 UI 适配是隐形的：用户不应感知到刘海、挖孔或键盘的存在，只应感受到内容的流畅与沉浸。"**
