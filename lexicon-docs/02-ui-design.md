# 02 — UI 设计与交互逻辑

## 设计原则

- 极简：无多余装饰，信息密度高但不拥挤
- 学习感：信息呈现顺序遵循认知建构路径（概念→理解→溯源→对比→应用）
- 无障碍切换：Instant/AI mode 随时可切，不重置查词结果

## 页面结构（单页应用）

```
App
├── SearchPage（初始态，无查词结果时）
│   ├── SearchBar（含 mode 切换）
│   └── SuggestList（输入时展开）
│
└── ResultPage（有查词结果时）
    ├── SearchBar（收起态，顶部常驻）
    └── ResultView
        ├── WordHeader（单词、音标、词性）
        ├── [InstantSection] 释义 + 例句（始终渲染）
        └── [AiSection] AI 解析板块（AI mode 时渲染）
            ├── SemanticScene（语义情景）
            ├── Etymology（词根词缀）
            ├── Synonyms（近义词辨析）
            └── AiExamples（AI 补充例句，可选）
```

## SearchBar 详细设计

```
┌─────────────────────────────────────────┐
│ 🔍  satisf_                             │
├─────────────────────────────────────────┤
│ [ Instant ]  [ AI mode ]                │
└─────────────────────────────────────────┘
```

- mode 切换按钮紧贴搜索框下方，两个 pill button
- **Instant**：选中时 background-secondary，仅查本地词库
- **AI mode**：选中时带紫色 accent（`#EEEDFE` bg，`#3C3489` text），触发 AI 调用
- 切换 mode 不清空当前结果，AI 板块用 skeleton 占位直到数据返回
- 搜索框有 300ms debounce，防止过度触发补全查询

## SuggestList 设计

- 最多显示 8 条
- 每条：左侧单词（500 weight），右侧简短中文释义（tertiary color，12px）
- 高亮当前选中项（键盘上下键可导航）
- 点击或回车确认，进入 ResultPage

```tsx
// 示例数据结构
{ word: 'satisfaction', zhBrief: '满意；满足感' }
{ word: 'satisfy',      zhBrief: '使满意；满足' }
```

## ResultPage 信息排列顺序

### Instant mode 渲染顺序

1. **WordHeader** — 单词 + 音标 + 词性 badge
2. **释义**（来自本地词库，中英双语）
3. **例句**（来自本地词库）
4. **引导条**：小字提示"切换 AI mode 可查看：语义情景 · 词根词缀 · 近义词辨析"

### AI mode 渲染顺序

1. **WordHeader** — 单词 + 音标 + 词性 badge
2. **释义**（同 Instant，本地词库，无需等 AI）
3. **语义情景**（AI，skeleton 等待中）⬅ 最重要，紧跟释义
4. **词根词缀**（AI）
5. **近义词辨析**（AI）
6. **例句**（本地词库，始终可见）

> 释义和例句始终来自本地词库（L1），AI 板块是增量叠加，不替换。
> 这样即使 AI 请求失败，核心内容不受影响。

## AI 板块 Skeleton 动画

AI 数据加载期间，各板块显示 skeleton：

```tsx
// 语义情景 skeleton：两个灰色圆角矩形
// 词根词缀 skeleton：三个 pill + 一段文字块
// 近义词 skeleton：四个 pill
```

AI 数据返回后，skeleton 淡出，内容淡入（transition: opacity 0.3s）。

## AI badge 视觉标记

AI 解析板块统一在 section label 旁显示 badge：

```
● AI 解析
```

- 紫色小圆点 + "AI 解析" 文字
- 背景 `#EEEDFE`，文字 `#3C3489`
- 用于视觉上区分 L1 内容和 AI 内容

## 词性 Badge 颜色

| 词性 | 背景 | 文字 |
|------|------|------|
| noun | `#E6F1FB` | `#0C447C` |
| verb | `#EAF3DE` | `#27500A` |
| adj  | `#FAEEDA` | `#633806` |
| adv  | `#EEEDFE` | `#3C3489` |
| phrase | `#FAECE7` | `#712B13` |

## Settings 页（抽屉式，右滑或按钮触发）

- AI endpoint URL 输入框
- AI model 输入框（如 `gemini-2.0-flash`）
- API key 输入框（password 类型，不明文显示）
- 测试连接按钮
- 词库状态（已加载 X 条词条）
- 历史记录开关

## 颜色 token（与 Tailwind 配合使用）

```ts
// tailwind.config.ts 自定义 token
colors: {
  ai: {
    bg: '#EEEDFE',
    text: '#3C3489',
    dot: '#7F77DD',
  }
}
```

## 响应式断点

- 移动端（<640px）：单列，搜索栏全宽
- 平板/桌面（≥640px）：最大宽度 480px 居中，模拟移动 app 感
- PC（Tauri）：同平板布局，窗口默认 400×700px
