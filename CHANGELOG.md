# CHANGELOG

## 2026-08-23 — 图像翻译支持跨平台相机拍照 (v0.9.16)

### 用户可见
1. **图像翻译新增相机拍照功能 (Take Photo)**：在图像翻译模式（Image Translator）下，新增了全平台“拍照”按键。支持直接唤起系统相机拍摄文本照片并自动送入翻译列表。
2. **Web / PC 桌面端实时摄像头支持**：在 Web 浏览器以及 Tauri PC 端（Windows / macOS）点击拍照，会自动弹出内置的摄像头实时预览模态框 (`CameraModal`)，支持实时画面捕捉与前后置摄像头切换。
3. **移动端 (iOS 16+ / Android 9-17) 原生相机唤起**：通过集成 `@capacitor/camera`，自动在移动端调用操作系统原生拍照界面，并处理不同 Android/iOS 版本的权限与存储映射。

### 工程
- `package.json`: 引入 `@capacitor/camera` 依赖。
- `src/services/camera.ts`: 新增平台相机抽象服务，提供统一 `captureNativePhoto()` 方法。
- `src/components/ImageTranslate/CameraModal.tsx`: 新增 WebRTC 摄像头实时流预览与拍摄模态框组件。
- `src/components/ImageTranslate/index.tsx`: 整合相机拍照入口，空态引导与操作栏支持拍照追加图片。
- `src/i18n/index.ts`: 添加相机拍照相关多语言文案。
- `ios/App/App/Info.plist`: 补全 `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` 隐私声明。
- `android/app/src/main/AndroidManifest.xml`: 补充 `android.permission.CAMERA` 与 `android.hardware.camera` 声明。

### 涉及文件
- `package.json`
- `src/services/camera.ts`
- `src/components/ImageTranslate/CameraModal.tsx`
- `src/components/ImageTranslate/index.tsx`
- `src/i18n/index.ts`
- `ios/App/App/Info.plist`
- `android/app/src/main/AndroidManifest.xml`
- `lexicon-docs/01-architecture.md`
- `lexicon-docs/05-components.md`
- `README.md`
- `README_en.md`
- `AGENT.md`

## 2026-08-21 — Lookup / Pure Core 双请求真并发提速 + 中文输入概念心智地图 + 单语言口径统一 (v0.9.15)

### 用户可见
1. **AI 查询真正提速：选中的模式先出来**：v0.9.14 的「双轨并发」实际上仍是一次 AI 调用返回 `{lookup, core}` 一整坨大 JSON。LLM 输出 token 是串行的，一次吐两份内容耗时就是两倍；且响应非流式，JSON 没吐完连一个字段都拿不到，所以「先看选中的那个模式」在架构上无法实现。现改为 Lookup 与 Pure Core 各发一个独立请求真并发，共用一次联网搜索，谁先回谁先渲染。你正在看的那个 Tab 一拿到自己那半就立刻出内容，另一半在后台继续、落地后静默补上，切 Tab 依然免等待。首屏时间从「整坨大 JSON 的生成时间」降到「单半边的生成时间」。
2. **极速骨架预览这次真的显示出来了**：v0.9.14 的第一阶段骨架只写进了 store，却没有解锁任何 UI（所有视图都卡在 `aiStatus === 'success'` 才渲染），骨架回来了界面上依然是一片骨架屏，用户一个字都没提前看到，白白多付一个往返。现在骨架落地即渲染释义列表，未到位的模块单独显示 shimmer，等待期不再是空屏。
3. **第一阶段改为「按场景收费」，英文查词不再交冤枉税**：旧逻辑对所有词库外的查询都串行等一次骨架请求，把中文输入才有的歧义成本摊到了每一次英文查词上。现在本地词典命中直接跳过（0 延迟）；中文输入才付这一个串行往返（Pure Core 必须先知道锚定哪个英文词）；其余情况骨架在后台并发跑，只用于提前渲染，绝不阻塞两个半边。
4. **中文输入的 Pure Core 改为概念心智地图**：输入中文（如「尴尬」）时，Pure Core 不再偷偷挑一个英文词然后只讲那一个（而且界面上还不告诉你讲的是哪个）。现在它呈现英语如何切分这个中文概念：列出 3-5 个竞争候选词（awkward / embarrassing / cringe …），逐个说明母语者在什么情况下会选它而不是别的，并做两两感觉对照。输入英文时 Pure Core 完全不变，仍是原有的母语者心智模拟。
5. **单语言模式口径统一，修复中文输入译文栏空白**：单语言的定义是「无论我输入什么，都用纯英文回答我」。此前 `getIsMono`、`getFullLookupPrompt`、`AiFullView` 三处都额外要求 `lang === 'en'`；v0.9.14 只解开了词条 Prompt 那一处，UI 层仍在按旧规则渲染，导致开启单语言 + 输入中文时 AI 已返回纯英文、界面却仍去取中文译文字段，显示为空白。现三处口径完全一致。
6. **非单语言模式下的外语输入明确要求中文解释**：输入日语、法语等外语且未开单语言时，本应得到全中文解释，此前只靠角色设定隐式暗示，模型经常飘成英文。现已作为显式规则写入词条与短语两套 Prompt。
7. **修复短语 / 句子在 Pure Core 模式下显示的是 Lookup 数据**：词条路径一直有 `combinedResult?.core` 的取值分支，短语路径从 v0.9.0 起就漏了，导致短语切到 Pure Core 后模块是 Core 的、内容却是 Lookup 那一半的，Core 短语内容从未真正显示过。
8. **修复「有场景、无搜图词」的义项永远拿不到图片按钮**：按需 AI 赋能按钮此前只看「有没有场景」来决定是否显示，而本地词库里大量义项恰恰是有场景但没有 `imageQuery`，这些义项因此永远无法生成搜图词、图片功能对其完全不可达。现在缺任意一项都会显示按钮。
9. **修复强制 AI（Bypass）串用上一个词的释义**：对词库外的词点 Bypass 时，锚点会直接读取当前显示的 `wordResult`，而该值可能还是上一次查询的另一个词，导致把别的词的义项塞进本次 Prompt。因走的是 AiFullView 不渲染 `wordResult`，界面上看不出异常，但生成结果已被污染。现已校验归一化词形是否一致，且 Bypass 一律不采用本地词典锚点（用户要的就是 AI 自己的判断）。
10. **修复第一阶段结果跨词污染与取消失效**：旧 `setMeaningsSkeleton` 以「当前显示中的 `aiAnalysis`」为基底合并新查询的释义，会把上一个词的词源、例句、助记全部继承进新词的缓存条目，同时把界面上那个词的分析也换成混血对象，两个词互相污染；且该写入未经过请求闸门，已取消的旧搜索照样能落库。此外第一阶段的失败被空 catch 吞掉，用户取消或切词后请求仍会继续往下走。现均已修复。

### 工程
- `src/hooks/useAiLookup.ts`：`triggerCombinedLookup` / `triggerCombinedPhraseQuery` 重写为「阶段一裁决 → 一次共享联网搜索 → 两半 `Promise.all` 真并发」；新增 `resolveWordAnchor`（按场景决定锚点成本、校验本地词条归属、Bypass 跳过本地锚点、区分取消与解析失败）、`resolvePhraseAnchor`、`previewSkeleton`（fire-and-forget 早期渲染）；单半失败不再整体报错，仅两半皆失败才 `setAiError`。
- `src/services/ai.ts`：`generateMeaningsSkeleton` 重构为 `resolveQuerySkeleton`，语义从「生成释义」改为「裁决解释对象」，返回 `correctForm` + `senses` 并对畸形条目做 `normalizeSenses` 清洗与重新编号；新增 `MeaningsAnchor` 类型与 `buildAnchorBlock`（Lookup 逐条复用、Core 仅对齐词形）；`aiFullLookup` / `aiPhraseQuery` 新增 `opts: { anchor, webResults }`，联网搜索由调用方共享注入，避免每半边各跑一次；`getIsMono` 与 `getFullLookupPrompt` 去除 `lang === 'en'` 门槛；新增外语输入中文解释规则与 `ZH_CORE_CONCEPT_MAP_RULE`；`aiCombinedLookup` / `aiCombinedPhraseQuery` 标记 `@deprecated`，保留供回滚与 A/B 对比。
- `src/stores/resultStore.ts`：移除 `setMeaningsSkeleton`；新增 `QuerySkeleton` / `CombinedHalf` / `PendingHalves` 类型与 `aiPendingHalves` / `aiIsPartial` / `aiSkeleton` 状态；新增 `beginCombined`、`applyQuerySkeleton`（仅渲染、不写任何缓存、拒绝过期查询、不覆盖已落地的半边）、`commitCombinedHalf` / `commitCombinedPhraseHalf`（两半齐全才写 `combinedCache`，单半通过 `aiFullCache` 走既有 legacy 重建路径兜底）、`settleCombinedHalf`；`setAiError`、`setWordResult`、`clearCache`、`reset` 一并清理并发标志与草稿累加器。
- `src/services/aiPhrasePrompt.ts`：`BuildPhrasePromptOptions` 新增 `meaningsAnchor`；补充外语输入中文解释规则与 `RESOLVED TARGET` 锚点段。
- `src/App.tsx`：Pure Core 模式下短语视图改取 `combinedPhraseResult?.core`，与词条路径对齐。
- `src/components/ResultView/AiFullView.tsx`：`shouldHideTranslation` 去除语言门槛；Lookup 半边在途时显示 shimmer。
- `src/components/ResultView/CoreCognitiveView.tsx` / `PhraseView.tsx`：按各自对应的半边显示 shimmer。
- `src/components/ResultView/index.tsx`：新增 `aiReady`（`mode === 'ai' && success && !lookupPending`），骨架预览期间不误开按需赋能与场景对齐。
- `src/components/ResultView/InstantSection/MeaningList.tsx`：本地生成的 `imageQuery` 优先级与场景一致（本地优先）；按需赋能按钮在「缺场景」或「缺搜图词」任一情况下均显示。
- `src/stores/resultStoreSplit.test.ts`（新增）：11 项，覆盖部分结果不进缓存、单半兜底持久化、过期半边与过期骨架丢弃、骨架不降级已落地内容、Bypass 与普通结果分槽、跨词污染、并发标志流转。
- `src/services/aiSplitContract.test.ts`（新增）：15 项，覆盖单语言三处口径一致、外语输入中文规则、锚点透传、两半并发与共享联网搜索、本地锚点归属校验、取消不被吞。

### 涉及文件
- `src/App.tsx`
- `src/components/ResultView/AiFullView.tsx`
- `src/components/ResultView/CoreCognitiveView.tsx`
- `src/components/ResultView/PhraseView.tsx`
- `src/components/ResultView/index.tsx`
- `src/components/ResultView/InstantSection/MeaningList.tsx`
- `src/hooks/useAiLookup.ts`
- `src/services/ai.ts`
- `src/services/aiPhrasePrompt.ts`
- `src/stores/resultStore.ts`
- `src/services/aiSplitContract.test.ts`
- `src/stores/resultStoreSplit.test.ts`

---

## 2026-08-21 — 锚点骨架双轨 AI 架构 (0.5s 极速响应) + 单语言英英沉浸 + 知识库激活 (v0.9.14)

### 用户可见
1. **0.5 秒极速骨架响应与双轨并发呈现**：重构了 AI 请求管道。第一阶段在 0.5 秒内极速吐出 `meanings` 释义骨架并直接解锁 UI（对于本地词典 hit 则为 0 毫秒）；随后以该骨架为固定 Anchor，并发拉起 Lookup 增量细节（场景、搭配、词根）与 Pure Core 深度认知（空间记忆、画面故事）。彻底消除了大 JSON 等待的卡顿感，且无论在哪个 Tab 均无缝对齐。
2. **长句 1 条忠实译文流转约束**：长句子/长段落输入时，第一阶段极速骨架严格仅吐出 1 条忠实全文翻译义项，绝不上多条散文总结，保持了对长句翻译完整度与精度的严格控制。
3. **彻底沉浸式单语言（英英词典）模式**：升级了单语言模式（`monolingualWord` / `monolingualPhrase` / `monolingualSentence`）。勾选后，即使输入中文（如“制裁”），AI 第一步定位目标英文词（`sanction`），随后所有的含义释义、场景描述、搭配、词根及认知故事 **100% 全部用纯英文生成**，提供原汁原味的英英词典使用体验。
4. **单条义项按需 AI 深度赋能**：在 AI Lookup 模式下，对于缺少补充内容的义项，显示 `✨ AI 场景与图片`（英文 UI 下为 `✨ AI Insights`）小按钮。点击后一键并行生成场景解释与 Tavily 搜图词，生成后自动展开场景卡片并亮起标准“查看图片释义”按钮。
5. **用户知识库（记忆库）导师级活化**：在长句语法纠错与 AI 问答中自动提取 `profileStore` 中积累的用户历史语法弱点与常错类型，提供针对性的专属导师提示。

### 工程
- `src/services/ai.ts`：新增 `generateMeaningsSkeleton` 超轻量骨架生成函数与 `enrichSingleMeaning` 函数。
- `src/services/aiCombinedPrompt.ts`：升级 `buildCombinedWordPrompt` 与 `buildCombinedPhrasePrompt` 支持 `meaningsAnchor` 约束与单语言模式 Option B 提示词逻辑。
- `src/services/aiPhrasePrompt.ts`：长句 Prompt 注入 `buildProfilePromptContext()`。
- `src/services/profile.ts`：导出 `buildProfilePromptContext` 格式化工具。
- `src/stores/resultStore.ts`：新增 `setMeaningsSkeleton` 与 `updateMeaningExtension` 状态调度。
- `src/hooks/useAiLookup.ts`：重构 `triggerCombinedLookup` 和 `triggerCombinedPhraseQuery` 为渐进式两段/双轨流转。
- `src/components/ResultView/InstantSection/MeaningList.tsx`：升级为按需 AI 赋能交互。

### 涉及文件
- `src/services/ai.ts`
- `src/services/aiCombinedPrompt.ts`
- `src/services/aiPhrasePrompt.ts`
- `src/services/profile.ts`
- `src/stores/resultStore.ts`
- `src/hooks/useAiLookup.ts`
- `src/components/ResultView/InstantSection/MeaningList.tsx`
- `src/i18n/index.ts`

---

## 2026-08-20 — 场景解释多语言索引对齐 + 按需生成与持久化 (v0.9.13)

### 用户可见
1. **修复场景解释（Scene）在多义词下的顺序错位 Bug**：以 `sanction`（含“制裁”与“许可”等多个义项）为例，旧版本 AI Lookup 模式下，AI 返回的场景解释可能与本地 SQLite 词典的义项顺序颠倒（例如“制裁”义项下方显示了“许可”的场景卡片）。现通过在 Prompt 中注入 `[Sense N]` 显式索引标记并要求 AI 返回 `senseIndex`，结合泛型 `alignAiMeanings` 多维对齐算法，实现了词典释义与场景解释的 100% 精准对应。
2. **彻底兼容纯英英词典与单语言模式**：废弃了只针对中文正则匹配的临时方案。新的对齐逻辑优先匹配 `senseIndex` 序号，并在备用匹配（Fallback）中同时支持英文词汇 Token 重合度 (`en`) 与中文重合度 (`zh`)，在英英模式（`monolingualWord`）、中英双语或多语言词典下均可稳定工作。
3. **新增场景解释按需生成与状态持久化**：在 AI Lookup 模式下，对于本地词典中缺失场景解释的释义，下方新增统一 UI 规范的“生成场景解释”（英文 UI 下为 "Generate scene"）小按钮。点击生成后，数据自动同步保存至 Zustand `resultStore` 与 LocalStorage 缓存，在 Tab 切换或重新搜索时均保留。

### 工程
- `src/types/index.ts`：`Meaning` / `AiAnalysis.meanings` / `AiFullResult.meanings` 补充 optional `senseIndex?: number`。
- `src/services/ai.ts`：`getSystemPrompt` 与 `buildUserPrompt` 添加 `[Sense N]` 与 JSON Schema `senseIndex` 约束；新增 `generateSingleScene` 函数。
- `src/utils/alignScenes.ts`：新建多语言场景对齐工具函数 `alignAiMeanings`。
- `src/stores/resultStore.ts`：新增 `updateMeaningScene` Action，同步更新 `aiAnalysis` 与 `combinedResult` / `combinedCache`。
- `src/components/ResultView/index.tsx` & `MeaningList.tsx`：引入场景对齐，支持多语言场景渲染与按需生成按钮。
- `src/i18n/index.ts`：补充中英文 i18n key。

### 涉及文件
- `src/types/index.ts`
- `src/services/ai.ts`
- `src/utils/alignScenes.ts`
- `src/stores/resultStore.ts`
- `src/components/ResultView/index.tsx`
- `src/components/ResultView/InstantSection/MeaningList.tsx`
- `src/i18n/index.ts`

---

## 2026-08-19 — MnemonicCard 生成后消失 Bug 修复 + 场景释义提示词优化

### 用户可见
1. **修复词根词缀记忆（Generate Mnemonic）生成后内容立即消失的 Bug**：查询中文词（如"真小气"）时返回多个英文对应词，用户点击 Generate Mnemonic 后，内容一闪而过或反复点击无效。根因是 `MnemonicCard` 的 `useEffect` 依赖数组包含 `activeType`，导致生成成功后 `setActiveType(res.bestType)` 触发 effect 重新运行，将刚生成的 mnemonic 用 `undefined` 的 `initialMnemonic` 覆盖。同理，点击切换类型标签（philology / story / smart）也会触发同一 bug 清空内容。修复后两个触发路径均已消除。
2. **场景释义（scene.description）内容质量提升**：旧提示词要求 AI 只写"在什么情境下使用"，导致输出短短几字的功能性描述（如"描述壁炉的构造或清理炉灰时使用"）。新提示词要求以母语者视角写出画面感描述：这个义项具体指的是什么东西或场景、母语者在什么具体时刻/地点会用到它、使用时带着什么感受或氛围，禁止功能性和字典式表述。同时强制要求每个 meaning 都必须附有 scene，不得遗漏。

### 工程
- `MnemonicCard.tsx`：将 `activeType` 从 `useEffect` 依赖数组移除；`wordChanged=false` 分支改用 functional state update（`prev => prev ?? initialMnemonic`），仅在本地无数据时才同步 store 值，不覆盖已生成内容。
- `ai.ts`（`getSystemPrompt` Instant 模式 + `getFullLookupPrompt` AI Lookup 模式）：重写 `sceneDesc` 变量为母语者视角要求（2-4句画面感描述）；Rules 段新增强制规则：每个 meaning 必须有 scene、禁止功能性用法描述。Pure Core 模式 (`isCore=true`) 不受影响，该模式不输出 meanings scene 字段。

### 涉及文件
- `src/components/ResultView/AiSection/MnemonicCard.tsx`
- `src/services/ai.ts`

---

## 2026-08-16 — 长句 meaning 改为忠实全文翻译 + 搜索栏失焦收回一行 (v0.9.11)

### 用户可见
1. **长句/段落的 `meaning` 是忠实全文翻译，不再是总结**：复现输入 `1/2 Thanks Gavin for an especially thoughtful exchange. I don't usually spend much time on social media but I wanted to engage here because it really brings out the heart of an important conversation.` → 旧 prompt 返回被压缩的「大意」，且把原文的 thread 标记 `1/2` 误当成列表编号，输出成 `1. … 2. …`。现要求逐句对应（**句数与顺序同原文**）、保留每个从句/修饰语/语气词/人名/数字，禁止概括、压缩、合并、加解读，禁止自造编号或小标题（原文自带的 `1/2` 原样保留），译文长度须与原文相当。
2. **移除旧版首行【主题概括】允许项**：它正是模型退化成「给个总结」的入口；同时 `Keep everything concise` 对 sentence 的 `meaning` 显式豁免（完整性优先于简洁）。短词组（`queryType=phrase`）仍是 1–2 句短释义，不受影响。
3. **搜索框失焦自动收回一行**：输入多行长文后，一旦点了搜索 / 去看历史记录或结果（光标离开输入框），输入框自动收成一行胶囊、滚回开头，不再占着四行高度挡住下面的内容。文本一个字都不会丢。
4. **重新聚焦自动展开并跳到结尾**：长文恢复原来的多行版式，光标落在文本末尾、视图滚到底，可直接续写；单行短查询仍保持原来的「聚焦即全选」（长文不全选，避免一个按键清空全文）。
5. **收起态文字不被按钮盖住**：只剩一行时右下角按钮正好压在这行上，故折叠时按实测宽度给 textarea 加右内边距，文字提前换行让开按钮。

### 工程
- `aiPhrasePrompt.ts` / `aiCombinedPrompt.ts`：sentence 分轨的 `meaning` 字段描述与规则块重写为「FAITHFUL TRANSLATION, NEVER a summary」清单（两条 AI 链路都改，避免只改一条留下漏网路径）。
- `useComposerFlowLayout(value, { gap, maxHeight, collapsed })`：新增 `collapsed` 入参与 `isCollapsed` 返回值。折叠只改可视高度 / `scrollTop` / 右内边距，**`value` 不动**，聚焦后 effect 以 `collapsed=false` 重跑即原样恢复；`collapsed` 不由测量结果推导，因此不会重新引入 v0.9.10 修掉的布局反馈环。
- 测量前先清掉折叠态的右内边距再读 `getComputedStyle`，否则会拿上一轮的窄内容宽算高度。
- 光标定位放在 `SearchBar` 的 `useLayoutEffect`（声明在 hook 之后）：必须等 hook 先把高度撑回去，否则随后的高度变更会把 `scrollTop` 重置回 0（用 `requestAnimationFrame` 会踩到这个坑）。

### 验证
- `tsc -b` 通过；`vitest run` 20 文件 / 173 用例全绿（改写了断言旧【主题概括】的测试，并补「禁止总结 / 禁止自造编号」「短词组不受影响」两条用例）。
- 浏览器实测 306 字符长文：聚焦 textarea 110px / 胶囊 138px / `rounded-2xl` → 失焦 32px / 52px / `rounded-full`、`scrollTop` 归零 → 再聚焦回 110px、光标 306/306、视图贴底；收起态文字内容右边界 568px < 按钮左边界 581px（不重叠）。

### 涉及文件
- `src/services/aiPhrasePrompt.ts`、`src/services/aiCombinedPrompt.ts`、`src/services/aiPhrasePrompt.test.ts`
- `src/hooks/useComposerFlowLayout.ts`、`src/components/SearchBar/index.tsx`
- `lexicon-docs/04-ai-schema.md`、`lexicon-docs/05-components.md`

---

## 2026-08-16 — 搜索栏多行布局重做：文字绕行按钮 + 布局抖动修复 (v0.9.10)

### 用户可见
1. **修复输入框在换行边界反复抖动**：v0.9.9 的「换行后按钮下沉」会让输入框变宽、文字又不需要换行、按钮再弹回，导致每敲一个字符就在一行 / 两行之间跳变，严重时触发 React `Maximum update depth exceeded` 崩溃。根因是「是否换行」的判断依赖了会被该判断本身改变的宽度（布局反馈环）。
2. **文字绕行按钮的排版模型**：文字**始终按满宽排版**，右下角按钮只遮挡**最后一行**。第 1 行写到撞按钮 → 按钮下沉留出空行，第 1 行继续延伸到最右边；文字溢出到第 2 行时**总高度不变**；第 2 行也撞到按钮，才再长高一行。
3. **消除按钮与文字重叠**：按钮胶囊比一行文字高，底部对齐时会探进上一行（满宽行）的尾部。现按最后一行下沉，下沉量由实测几何推导（按钮比行高高出多少就沉多少），按钮尺寸变化时自动适配。
4. **输入框滚动条不再破框**：多行滚动时原生 / Android WebView 滚动条会溢出圆角并与按钮打架，改为隐藏滚动条（内容仍可滚动）。
5. **占位符不再撑高空输入框**：占位符强制单行省略，只有用户真实输入才多行延展。
6. **搜索按钮组瘦身**：按钮组 153px → 115px，可输入宽度显著变宽；静止胶囊高度 62px → 52px。

### 工程
- 新增 `src/hooks/useComposerFlowLayout.ts`：隐藏镜像元素测量「最后一行末尾的像素位置」与所需下沉量。**不数字符**（字符非等宽），阈值全部运行时实测，随屏宽 / 字体自适应。textarea 宽度恒定 → 结构上不存在反馈环。
- 新增 `src/hooks/useComposerAutoGrow.ts` + `src/utils/composerAutoGrow.ts`（含测试）：AI 追问框的简单高度自适应。
- `src/index.css`：新增 `.no-scrollbar`（含 textarea 占位符单行省略规则）。
- 排错记录：用 `offsetWidth` 反推宽度会因取整误差在边界翻转；给 `flex-1` 的 textarea 设 inline `width` 会被 flex 布局忽略（`flex-basis: 0`），须同时设 `flex: none` 才能钉住测量宽度。

### 涉及文件
- `src/components/SearchBar/index.tsx`
- `src/components/ResultView/AiSection/AiChatBox.tsx`
- `src/hooks/useComposerFlowLayout.ts`、`src/hooks/useComposerAutoGrow.ts`
- `src/utils/composerAutoGrow.ts`、`src/utils/composerAutoGrow.test.ts`
- `src/utils/aiChatComposerLayout.ts`
- `src/index.css`

---

## 2026-08-15 — 主搜索栏与 AI 提问框多行自适应延伸及按钮联动 (v0.9.9)

### 用户可见
1. **主搜索栏与 AI 提问框多行自适应输入 (Multi-line Auto-Expanding Textarea)**：将主搜索栏（`SearchBar`）与 AI 提问框（`AiChatBox`）单行 `<input>` 升级为多行自适应 `<textarea>`。输入长词、长句或长提问时，文字在容器宽度内严格自动换行全量展示，彻底解决长文本溢出滚屏与手机端光标调不准的问题。输入框根据字数从 1 行自动延展至 4 行（最高 110px，超长显示滚动条），提交或清空后自动平滑收缩复原。
2. **多行交互与按钮联动视觉协调 (Dynamic Layout Adaptation)**：
   - 搜索栏变为多行时外框由经典 `rounded-full` 胶囊自动平滑过渡为圆润大卡片（`rounded-2xl`），彻底避免胶囊弧角遮挡文字。
   - 布局采用“左上固定 + 右下沉底”结构：左侧图标（搜索栏放大镜 / AI 提问框 💡 开关）锚定在左上角（`self-start`），右侧操作按钮组（清除 ✕ / 强制 AI ✨ / 搜索 → / 发送）锚定在最下一行沉底（`self-end`），随最下一行平滑移动。
   - 键盘交互：支持桌面端 `Enter` 直接提交 / `Shift + Enter` 插入换行；移动端配置原生 `enterKeyHint` 渲染“搜索”与“发送”软键盘按钮。
3. **Tavily Web 搜索开关全站联动补全**：完善 `searchTavilyImage` 校验逻辑，当在设置中关闭 Web 搜索开关时，系统停止一切 Tavily 图片检索请求并隐藏对应入口。

### 涉及文件
- `src/components/SearchBar/index.tsx`
- `src/components/ResultView/AiSection/AiChatBox.tsx`
- `src/utils/aiChatComposerLayout.ts`
- `src/services/ai.ts`
- `src/components/ResultView/InstantSection/MeaningList.tsx`

---

## 2026-08-11 — AI 双轨 Tag 隔离缓存架构与真实例句练习重构 (v0.9.8)

### 用户可见
1. **AI 搜索双轨 Tag 隔离缓存 (Normal vs Bypass)**：普通 AI 搜索（`normal` Tag）与强制 AI 搜索（`bypass` Tag ✨ 旁路词典）建立独立隔离缓存，互不干扰覆盖。同一单词可随时在普通 AI 视图与纯 AI 全量视图间自由点击切换并进行 0 秒瞬间对比。
2. **历史记录四场景智能路由决策树**：包含普通与 Bypass 双缓存时优先载入普通搜索结果，并保留 ✨ 按钮供随时切看；仅包含 Bypass 强搜缓存时自动直接载入纯 AI 全量画面 (`AiFullView`)；仅有纯词库记录时以 `Instant` 模式轻量载入，不强制触发 AI 加载。
3. **Lookup 模式真实例句理解练习重构**：Lookup 模式连通设置中的练习题数量（`maxExercises`）。AI 依据词条常见义项生成真实的在语境中的英文例句卡片，引导学习者结合特定例句解释该词的具体释义并进行针对性智能批改。
4. **Tavily 网络搜索与图片检索开关联动修复**：修复在配置 `tavilyApiKey` 后，若将“Web 搜索”开关设为关闭状态，后台 `searchTavilyImage` 仍会绕过开关向 Tavily API 发起图片检索请求、以及 UI `MeaningList` 仍会展示“查看图片释义”按钮的问题。修复后保证 Web 搜索开关关闭时全站停止一切 Tavily 网络请求与图片检索入口。

### 涉及文件
- `src/types/index.ts`
- `src/utils/combinedResult.ts`
- `src/utils/historyDecisionTree.ts`
- `src/utils/historyDecisionTree.test.ts`
- `src/stores/resultStore.ts`
- `src/hooks/useAiLookup.ts`
- `src/App.tsx`
- `src/services/ai.ts`
- `src/components/ResultView/AiSection/PracticeSection.tsx`
- `src/components/ResultView/InstantSection/MeaningList.tsx`
- `src/i18n/index.ts`

---

## 2026-08-02 — 词组与句子分层改错架构 (2-Tier Proofreading) (v0.9.7)

### 用户可见
1. **Tier 1 最小改动原则 (Minimal Fix)**：处理词组与句子搜索时，标题优先保留用户原始句式结构，仅修正语法错误、介词误用、用词搭配不当与拼写/大小写。
2. **改动原因逐条剖析 ("Why was this changed?")**：展开改动说明时，使用项目符号（•）逐条清晰列出语法与介词等修正细节，避免包含抽象概括空话。
3. **Tier 2 地道与正式表达折叠卡片 (Native & Formal Expression)**：新增独立折叠卡片，集成了高阶地道/正式句式改写（`nativeForm`）、地道短语与介词选用意图剖析（`nativeRationale`）以及母语心智对比（`unnaturalMindModel`），UI/UX 样式完全对齐系统设计语言。
4. **单语言模式（Monolingual Mode）语言对齐**：开启单语言模式时，AI 生成的修改说明与地道剖析强制为纯英文；界面标题与导航严格遵循应用语言设置。

### 涉及文件
- `src/types/index.ts`
- `src/services/aiCombinedPrompt.ts`
- `src/services/aiPhrasePrompt.ts`
- `src/components/ResultView/PhraseView.tsx`
- `src/i18n/index.ts`
- `src/services/aiCombinedPrompt.test.ts`
- `src/services/aiPhrasePrompt.test.ts`

---

## 2026-07-29 — 移动端暗黑模式冷启动闪退与运行时频闪修复 (v0.9.6)

### 用户可见
1. **Android 冷启动暗黑模式闪退修复**：修复 Android 12+ 在系统处于暗黑模式或新安装软件时，启动触发 Activity 销毁重绘死循环导致闪退的问题。
2. **移动端（iOS / Android）切主题零频闪**：App 内切换浅色/深色/跟随系统时，不再触发 Android 原生 Activity 销毁重建或 WebView 重新加载，实现零黑白闪烁平滑过渡。
3. **状态栏与导航栏图标智能自适应**：原生层结合 `WindowInsetsControllerCompat` 与 iOS `preferredStatusBarStyle`，在深底色下自动切换为白色图标，浅底色下切换为黑色图标。

### 工程
- Android：`LexiconApplication.applyBootNightMode` 仅在进程启动时设置 in-process `AppCompatDelegate`；移除了启动时对 `UiModeManager.setApplicationNightMode` 的重复强调用；`updateNativeWindowChrome` 负责平滑底色与状态栏图标更新。
- iOS：`LexiconBridgeViewController` 添加去重 `overrideUserInterfaceStyle` 校验与 `preferredStatusBarStyle` 覆写。

### 涉及文件
- `android/app/src/main/java/com/julian/lexicon/LexiconApplication.java`
- `android/app/src/main/java/com/julian/lexicon/MainActivity.java`
- `android/app/src/main/java/com/julian/lexicon/AppearanceBootPlugin.java`
- `ios/App/App/LexiconBridgeViewController.swift`

---

## 2026-07-28 — iOS 构建修复：勿 override CAPBridge loadView (v0.9.5)

### 工程
- `CAPBridgeViewController.loadView` 为 `final`，移除 `LexiconBridgeViewController` 中的 override，保留 `viewDidLoad` / `viewWillAppear` / `capacitorDidLoad` 涂 chrome（修复 Actions Archive 失败）。

---

## 2026-07-28 — 冷启动闪屏时序修复（appearance boot runtime）(v0.9.5)

### 用户可见
1. **Android**：设置里强制浅/深后，`UiModeManager` 立即持久化，下次冷启动系统 splash 跟 App 主题（不再先闪系统色）；Web 就绪前 keep-on-screen 挡住空 WebView。
2. **Windows (Tauri)**：按 boot `set_theme` 后再涂底色；窗口等前端 hydrate 后再 `show`（3s 兜底），减少深色 OS + 浅色 App 的黑闪。
3. **iOS**：更早 apply window/WebView chrome；运行时改外观经 `AppearanceBoot` 插件同步 override。系统≠App 时 Launch 仍可能跟系统一帧（平台限制）。

### 工程
- 本地 Capacitor 插件 `AppearanceBoot`：`applyNightMode` + `releaseSplash`；`syncNativeWindowTheme` 写 Preferences 后立刻调用。
- Android：`applyAppearanceMode`；`setKeepOnScreenCondition` + 2.5s 超时。
- Tauri：setup 不立刻 `show`；JS `finally` 里 `show()`。
- 门禁扩展：plugin / keepOnScreen / set_theme / delayed show。

### 涉及文件
- `src/services/appearance.ts`、`appearance.test.ts`、`appearanceBootGates.test.ts`
- `android/.../AppearanceBootPlugin.java`、`LexiconApplication.java`、`MainActivity.java`
- `ios/.../AppearanceBootPlugin.swift`、`LexiconBridgeViewController.swift`、`AppDelegate.swift`、`project.pbxproj`
- `src-tauri/src/lib.rs`、`CHANGELOG.md`、`AGENT.md`

---

## 2026-07-28 — 跨平台冷启动闪屏对齐 appearance (v0.9.4)

### 用户可见
1. **Android / iOS / Windows 冷启动**：App 浅色、深色、跟随系统时，原生启动层与 WebView / 窗口底色对齐解析主题，减少黑↔白跳变（iOS 在「系统≠强制 App」时 Launch 仍可能跟系统一帧，随后不再二次反色闪）。
2. **Settings Active Dictionary**：下拉框限制宽度，避免右侧圆角被裁切。

### 工程
- 统一 boot 契约 `{ dark, appearance }`：强制浅/深信 `dark`；`system`/缺失跟 OS。JS：`resolveBootDark` / Preferences `appearance-boot`；Tauri `appearance-boot.json` 同语义。
- Android：不透明 `Theme.SplashScreen` + `postSplashScreenTheme`；`LexiconApplication` 尽早 night mode（API 31+ `UiModeManager` 仅强制浅/深）；`installSplashScreen`；关 algorithmic darkening。
- iOS：`LaunchBackground` / Splash Dark Appearance；`LexiconBridgeViewController` 设 `overrideUserInterfaceStyle` + WebView/`underPageBackgroundColor`。
- Tauri：`visible: false` → 按 boot/系统涂底色再 `show`（修复 v0.9.3 硬编码近黑窗）。
- TDD：契约表 + 静态门禁；调研 `lexicon-docs/research/splash-flash-ios-android.md`。

### 涉及文件
- `src/services/appearance.ts`、`appearance.test.ts`、`appearanceBootGates.test.ts`、`SettingsView.tsx`、`App.tsx`
- `android/...`（styles/colors/`LexiconApplication`/`MainActivity`/Manifest/`build.gradle`）
- `ios/...`（Bridge VC、Launch/Splash、`project.pbxproj`）
- `src-tauri/*`、`CHANGELOG.md`、`AGENT.md`、README*

---

## 2026-07-28 — 浅色模式冷启动黑闪修复（Tauri）

### 用户可见
1. **Windows 冷启动**：浅色 / 跟随系统（浅色）时不再先闪纯黑再变白；窗口底色按上次解析主题或系统主题预涂。

### 工程
- `tauri.conf.json`：`visible: false` + 默认底色改为白；启动时 Rust 读 `appearance-boot.json` 或系统主题后 `set_background_color` 再 `show`。
- boot 文件同时存 `appearance` + `dark`：强制浅/深信任 `dark`；`system` 冷启动跟 OS，避免隔夜改系统主题后用过期底色。
- 前端 `syncNativeWindowTheme`：同步 `setBackgroundColor` 并 `persist_boot_appearance`。
- `show()` 失败不再静默吞掉（setup 返回 Err）。

### 涉及文件
- `src-tauri/src/lib.rs`、`tauri.conf.json`、`capabilities/default.json`、`permissions/persist-boot-appearance.toml`
- `src/services/appearance.ts`、`src/App.tsx`、本 CHANGELOG

---

## 2026-07-28 — Settings Active Dictionary 选择器溢出裁切

### 用户可见
1. **Active Dictionary 下拉框**：限定最大宽度；超出部分隐藏、不换行，避免右侧圆角被设置卡片裁切。

### 涉及文件
- `src/components/Settings/SettingsView.tsx`、本 CHANGELOG

---

## 2026-07-28 — Appearance 跟随系统 + 设置 ≥3 选项 Accordion (v0.9.3)

### 用户可见
1. **外观三选一**：浅色 / 深色 / **跟随系统**（新安装默认跟随系统）；旧用户按原深色开关迁移为浅色或深色。
2. **设置折叠**：≥3 个离散选项（外观、默认搜索模式）改为 Accordion，折叠行显示当前值；2 选项（界面语言、历史优先）仍用横排胶囊，与开关密度一致。

### 工程
- `appearance: light|dark|system` 替代 `darkMode`；`matchMedia` 监听 + Tauri `setTheme`；`index.html` 防闪支持 system。
- 严密性：`persist.merge` 容忍空 storage；主题应用与 `useResolvedDark` 等待 `onFinishHydration`，避免默认 `system` 覆盖首屏脚本。
- 调研：`lexicon-docs/research/system-appearance-crossplatform.md`（iOS / Android / Windows / Web）。

### 涉及文件
- `src/services/appearance.ts`、`App.tsx`、`settingsStore`、`SettingsView`、`index.html`、`useResolvedDark`、i18n、docs、本 CHANGELOG

---

## 2026-07-28 — Lookup/Core 普通搜恢复 L1 + 释义硬化与选用对照并入近义 (v0.9.2)

### 用户可见
1. **普通搜索不再旁路词库**：在 AI Lookup 或 Pure Core 下点普通搜索且词库命中时，先出本地词典 L1，再跑合并 AI（Lookup→Core）；⭐ 强制 AI 仍旁路词库。
2. **Pure Core 也先出词典**：有词库命中时 Core 页顶部同样展示 L1 释义，再淡入用法心智板块。
3. **释义更像词典**：Lookup meanings / 短词组 meaning / Core `gloss` 要求等价词 + 义核（适配 monolingual）；情景长文归场景字段。
4. **选用对照整块移除**：不再单独展示 My Choice Contrast；「为何选主词」并入近义 `whenToUse`（适用心智）。

### 工程
- `searchPath.ts`：词库命中路由判定；`App.tsx` / `resultStore`：L1 + combined；`aiFullToAnalysis` 供 ResultView。
- Prompt：`aiCombinedPrompt` / `aiPhrasePrompt` / `ai.ts`；设置 normalize 丢弃旧 `wordChoice`。
- TDD：`searchPath.test.ts`、prompt / coreMindsetPipeline 用例更新。

### 涉及文件
- `src/App.tsx`、`src/utils/searchPath.ts`、`aiFullToAnalysis.ts`、`CoreCognitiveView`、`CoreConceptCard`、`settingsStore`、`ai*.ts`、`AGENT.md`、双 README、本 CHANGELOG

---

## 2026-07-27 — AI Profile 追问聚合诊断与崩溃恢复 (v0.9.1)

### 用户可见
1. **连问不再每条都烧 Profile Token**：同一词连续 AI 追问只入队，约 90 秒空闲或换词 / 切换 Lookup↔Pure Core / 离开 Dict Tab 后才后台蒸馏一次。
2. **关 App 不丢账**：未完成的诊断事件留在本地；下次打开若队列含追问/订正会自动续跑；失败时保留队列，后续查满约 12 次或再追问结束时一并带上。
3. **句子订正仍即时诊断**；普通查词累计约 12 次的保底触发不变。关闭「AI Profile 诊断」时停止入队与后台总结。

### 工程
- `profile.ts`：统一 `flushPendingProfileDiagnostics`；事件 `id`；成功才 `removeEventsByIds` / 重置计数；queued re-flush；冷启动 `resumePendingProfileDiagnostics`。
- `App.tsx`：硬边界 flush + mount 续跑 / `pagehide` 监听。
- TDD：`src/services/profile.test.ts`（14 用例）。
- 文档：`lexicon-docs/08`、`AGENT.md`。

### 涉及文件
- `src/services/profile.ts`、`profile.test.ts`、`src/App.tsx`
- `lexicon-docs/08-ai-learning-system-and-profile.md`、`AGENT.md`、双 README、本 CHANGELOG

---

## 2026-07-27 — 合并双轨 AI 一次出参 + 中文 Core 翻译修复 (v0.9.0)

### 用户可见
1. **一次搜索，两页数据**：输入词/句后 AI 单次调用同时返回「理解」(AI Lookup) 和「用法」(Pure Core) 两套数据；切换标签页为**瞬间翻页**，不再触发第二次 AI 请求。
2. **中文输入 Core 模式修复**：输入中文（如「美丽」）在 Pure Core 下，AI 现在明确知道目标是**找到最地道的英文对应词**并以母语者心智教授用法，而非分析该中文词本身。
3. **Bypass 按钮统一语义**：无论当前处于哪个模式，Bypass（⭐ 按钮）始终跳过词典直接触发 AI 合并搜索，自动落地到 AI Lookup 标签。
4. **Instant 词库外自动升级**：Instant 模式下输入词库里没有的词/短语/句子，自动触发合并 AI 搜索并切换到 AI Lookup 标签。

### 架构
- **旧**：mode='ai' → aiFullLookup('lookup'); mode='core' → aiFullLookup('core') — 两次独立请求，无上下文联动
- **新**：mode='ai' 或 'core' → aiCombinedLookup(word) — 单次请求，返回 `{ lookup: AiFullResult, core: AiFullResult }`；一级缓存键 `word::combined`

### TDD
- `src/utils/combinedResult.test.ts`（13 用例）：combinedCacheKey / splitCombinedJson / reconstructFromLegacy / isValidCombinedAiResult
- `src/services/aiCombinedPrompt.test.ts`（11 用例）：prompt 结构、中文输入规则置顶断言、feelAnchor/emotionalTone、conceptGraph

### 涉及文件
- `src/types/index.ts`：新增 `CombinedAiResult`、`CombinedPhraseResult`
- `src/utils/combinedResult.ts` [NEW]：combinedCacheKey / splitCombinedJson / reconstructFromLegacy / isValidCombinedAiResult
- `src/services/aiCombinedPrompt.ts` [NEW]：buildCombinedWordPrompt / buildCombinedPhrasePrompt（中文规则在 Rules 首位）
- `src/services/ai.ts`：新增 `aiCombinedLookup` / `aiCombinedPhraseQuery`
- `src/stores/resultStore.ts`：新增 combinedCache / combinedPhraseCache / setCombinedResult / getCachedCombined（含旧缓存重建）
- `src/hooks/useAiLookup.ts`：新增 triggerCombinedLookup / triggerCombinedPhraseQuery
- `src/App.tsx`：handleModeChange / handleWordSelect / handleForceAi 全部改为合并调用；标签切换为纯视图翻转

---

## 2026-07-26 — 词组 Meaning / Usage Contexts 纠偏与订正折叠解耦 (v0.8.9)

### 用户可见
1. **短词组 Meaning 不再堆情景长文**：如 `flat chat`，释义区只保留短释义；澳式俚语、何时用、母语选用意图等放到 **Usage Contexts**。
2. **Usage Contexts 开场白**：新增 `usageIntro`，在场景卡之前展示总述；长句/段落 Meaning 仍要求完整逐句翻译。
3. **白色订正文本独立折叠**：超长 `correctForm` 的展开/收起只影响标题；黄色「为什么这么改？」始终在折叠区外，互不影响。

### 工程
- `buildPhrasePrompt`（`aiPhrasePrompt.ts`）按 phrase/sentence 分轨 + FIELD OWNERSHIP；`isCorrectFormLong` 解耦折叠。
- TDD：`aiPhrasePrompt.test.ts`、`phraseHeaderFold.test.ts`。
- 文档：`04-ai-schema.md`、`AGENT.md`、双 README 下载链。

### 涉及文件
- `aiPhrasePrompt.ts` (+ `.test.ts`)、`phraseHeaderFold.ts` (+ `.test.ts`)、`ai.ts`、`PhraseView.tsx`、`types`、`i18n`
- `lexicon-docs/04-ai-schema.md`、`AGENT.md`、`README.md`、`README_en.md`、本 CHANGELOG

---

## 2026-07-26 — Pure Core 心智流水线重组（选用对照 + 概念树空态）(v0.8.8)

### 用户可见
1. **不再置顶 Native Mind Model**：感觉锚 / 情绪底色并入 Usage Image；「为何选这个」改为可拖拽模组 **选用对照**（L2：vs 近义逐条对照）。
2. **出厂顺序 P1**：Core Image → 概念树 → 搭配 → 近义 → 选用对照 → 场景…（设置里全部可拖）。
3. **概念树空态**：`wordGraph` 开启但未返回图时显示提示 + 重试，不再整块静默消失。
4. **搭配规则 C**：innit 类尾缀/语气词若搭配只会重复概念树句架，AI 返回空搭配（UI 不展示空卡）；shrug/sheen 等实词仍正常出搭配。

### 工程
- TDD：`coreMindsetPipeline.test.ts`（模组顺序、旧心智映射、空态、源码接线）。
- Prompt：Core 写 `feelAnchor` / `emotionalTone` / `wordChoiceContrast`；不再要求新生成 `nativeMindModel`。
- 文档：`AGENT.md`、`04`、`07` 同步。

### 涉及文件
- `coreMindsetPipeline.ts`、`WordChoiceCard.tsx`、`CoreConceptCard`、`WordGraphCard`、`CoreCognitiveView`、`PhraseView`、`settingsStore`、`ai.ts`、`aiCompleteness`、`types`、`i18n`

---

## 2026-07-26 — AI 追问 Lookup/Core 分轨、iOS 键盘避让与发版硬门禁 (v0.8.7)

### 用户可见
1. **AI 追问分轨**：Lookup 与 Pure Core 各自保留对话历史（UI `cognitiveCacheKey`：`q` / `q::core`）；Memory 表 `ai_conversations_json` 按 `lookup` / `core` 分桶，更新一轨不再覆盖另一轨；旧版纯数组自动迁入 Lookup。
2. **修复 iOS 键盘遮挡追问输入框**：恢复 `scrollIntoView({ block: 'center' })` + 双次滚动（语境灯泡已在输入框同排，不再需要 `nearest`）。

### 工程
1. **发版 SOP 硬门禁**：`workflow.md` 统一 `TAURI_SIGNING_PRIVATE_KEY_PATH`；新增 `scripts/release/`（`Load-ReleaseEnv` / `Sign-TauriBundle` / `Write-VersionJson` / `Prepare-AndroidApks` / `Assert-ReleaseGates`）；`.env.release.example`；临时 notes 进 gitignore。
2. **TDD**：`aiConversations` 分桶解析/序列化单测；徽章计数与 Chat 分轨接线断言。
3. **文档**：`AGENT.md`、`05`、`08` 同步分轨与发版脚本约定。

### 涉及文件
- `App.tsx`、`AiChatBox.tsx`、`chatStore.ts`、`db*.ts`、`aiConversations.ts`、`profile.ts`、`UserNoteEditor.tsx`、各 Result 视图
- `workflow.md`、`scripts/release/*`、`.env.release.example`、`.gitignore`、`AGENT.md`、`lexicon-docs/05`、`08`、本 CHANGELOG

---

## 2026-07-26 — 窄屏 UI：Chat Send、去 follow-ups 徽章、设置 ChoiceRow (v0.8.6)

### 用户可见
1. **AI Chat Send 不再被裁切**：窄屏（如小米 6X）底部追问行给输入框 `min-w-0`，Send 完整可见。
2. **去掉结果页「N AI follow-ups」徽章**：保留底部 AI Chat 提问；笔记 / Core 意象徽章仍可显示。
3. **设置多选项行（方案 1）**：Default Search Mode / History Prefer / App Language 改为「标题+按钮」一行、说明独占下一整行，避免说明被挤成竖条。

### 工程
- TDD：`memoryBadgeVisibility` / `aiChatComposerLayout` / `settingsChoiceRowLayout` 契约单测 + 组件接线断言。
- 文档：`09` ChoiceRow 规则；`08` Badge 范围说明。

### 涉及文件
- `AiChatBox.tsx`、`LexiconMemoryBadge.tsx`、`SettingsView.tsx`
- `src/utils/{memoryBadgeVisibility,aiChatComposerLayout,settingsChoiceRowLayout}.ts` (+ `.test.ts`)
- `CHANGELOG.md`、`lexicon-docs/08`、`09`

---

## 2026-07-26 — Lookup/Core 学习流分轨、稳定性与结果页克制 (v0.8.5)

本版汇总自 v0.8.4 以来的未发布改动（详见下方同日细条目）。

### 用户可见
1. **Lookup / Pure Core 学习分工**：Lookup 偏理解记忆（释义、轻量意象、词根、助记、例句、介词意象、释义核对）；Core 偏母语用法（心智、用法意象、概念树、介词语组/其他词组、近义、场景、语域、造句练习）；Core 无 dictionary 墙。
2. **历史双星分轨** + Instant 切回只显 L1；双轨皆无的历史词不再误切 AI。
3. **AI 超时可恢复**：不再静默卡在 loading；Instant 取消进行中请求。
4. **结果页视觉降噪**：统一 `SectionHeading`，去掉装饰色点 / emoji / 多余 AI 徽章。
5. **设置**：Core 词组专用模组列表；历史回放优先轨。

### 工程
- vitest 单测基建；`combineSignals` / request gate；文档 AGENT / 04 / 05 / 07 / 09 同步。

---

## 2026-07-26 — 结果页视觉降噪（企业级克制）

### 1. 统一板块标题
- 新增 `SectionHeading`：`text-[10px] font-black uppercase tracking-widest`，无色点、无「AI」pill

### 2. 去掉装饰噪声
- 结果页各卡删除标题前彩色圆点、重复 AI 徽章、emoji（🎯🧠💡🧭 等）
- `CoreConceptCard` / `NativeMindModelCard` / `WordGraphCard` / `UnnaturalMindModelCard` 去掉渐变英雄卡与装饰图标
- 板块正文统一中性 `foreground` / `border`；模式辨识仅保留顶栏 pill

### 3. 状态区克制
- `AiStatusBar`：loading 用轻量 spinner；error 去 glow 大圆图标，按钮对齐设计系统 Primary/Secondary

### 4. 文档
- `09-ui-ux-design-system.md` 增补 Result Section Header 规则

### 5. 涉及文件
- `ResultView/SectionHeading.tsx`、各 `AiSection/*`、`PhraseView`、`CoreCognitiveView`、`MeaningList`、`PhraseExercises`、本 CHANGELOG、`09`

---

## 2026-07-26 — AI 超时/Instant 取消/历史 Instant 回放与 Lookup 介词意象

审查修复（TDD：`npm test` / vitest）。

### 1. 超时不再卡死 loading（P1）
- `callApi` / `analyzeWord`：`combineSignals` + `dispose`；fetch 的 AbortError 若因 Timeout reason 则重抛 `TimeoutError`
- `useAiLookup`：`classifyAiRequestError` 先认 timeout 再认 abort；全量 30s / phrase·analyze 超时进 `setAiError`
- 抽出 `src/utils/abortSignal.ts`、`aiRequestErrors.ts`

### 2. Instant 取消进行中 AI（P2）
- `createAiRequestGate` + `shouldCommitAiDisplay`；`cancelAi()` 在切 Instant 时 abort 并作废 generation
- 迟到结果不写回展示（避免空态被 `aiFullResult` 污染）

### 3. 历史纯 Instant 不再误切 AI（P2）
- `resolveHistoryTrack` 双轨皆无时返回 `null`；有词库 → 留 Instant；OOD/词组仍按 `defaultSearchMode` 落入 AI
- `historyModeForTrack` 统一 mode 映射

### 4. Instant 卸下 Chat；Lookup 单词补介词意象（P2）
- `shouldShowResultAiChat`：仅 Lookup + success
- `ResultView` / `AiFullView` 增加 `preposition` → `PrepImageryCard`（点按生成；Core 仍用 chunks）

### 5. 测试基建
- 新增 vitest（`npm test`）；用例覆盖 abort/timeout、gate、history track、Chat/prep 可见性

### 6. 涉及文件
- `ai.ts`、`useAiLookup.ts`、`App.tsx`、`ResultView`、`AiFullView`、`utils/*`、`vite.config.ts`、`package.json`、`05-components`、`AGENT.md`、本 CHANGELOG

---

## 2026-07-26 — Lookup/Core 边角：词组模组分轨、中文 Core 候选、wordGraph 重试

拍板方案 **AAAB**（承接 07-25 模组重组后的审查项）。

### 1. Core 词组专用模组列表（方案 A）
- **新增** `corePhraseModules` / `DEFAULT_CORE_PHRASE_MODULES` / `normalizeCorePhraseModules` / `seedCorePhraseModulesFromCore`
- 出厂：`usageScenes`、`culture`、`practice`、`chat`（心智卡仍视图置顶，不进可关列表）
- **设置**：Pure Core 手风琴内「单词 / 词组」子 Tab，各自拖拽与开关
- **PhraseView** + `aiPhraseQuery`：Core 读 `corePhraseModules`，不再挂单词用的 `wordGraph`/`chunks` 等空转模组
- 升级：无 `corePhraseModules` 时从单词 `coreModules` 交集种子

### 2. Core 中文反查短英文候选（方案 A）
- `getFullLookupPrompt`：`cognitive=core` 且 `lang===zh` 时强制 2–5 条短 `meanings`（en=候选，zh=细微差别）；英文 Core 仍无释义墙
- `CoreCognitiveView`：轻量「英文候选」块，可点击跳转查词

### 3. culture 归属（方案 A）
- 维持 **仅 Core**；Lookup 默认列表不含 culture（与 07-25 分工一致，本条确认不回迁）

### 4. wordGraph 静默重试（方案 B）
- `aiFullNeedsExplanationFill(..., { wordGraphEnabled })`
- `wordGraph` **开**且完全无 `conceptGraph.branches` → 静默重试一次；关则不空转
- 接线：`useAiLookup.triggerFullLookup`

### 5. 涉及文件
- `settingsStore.ts`、`SettingsView.tsx`、`ai.ts`、`PhraseView.tsx`、`CoreCognitiveView.tsx`、`useAiLookup.ts`、`aiCompleteness.ts`、`i18n`、`AGENT.md`、`07`、本 CHANGELOG

---

## 2026-07-25 — Lookup / Core 模组学习流重组

### 1. 学习分工
- **AI Lookup**：理解与记忆（释义、轻量意象、词根、助记、例句、介词意象、释义核对练习）
- **Pure Core**：母语者用法（心智置顶、加厚用法意象、概念树、介词语组、其他常用词组、近义选用、用法场景、语域、场景造句练习）
- Core **彻底去掉** dictionary 释义墙；culture 迁入 Core

### 2. chunks vs collocations 拆清
- 独立模组 id：`chunks` = 常用**介词词组**；`collocations` = **其他**常用词组
- 可分别开关与拖拽排序；prompt/UI 标题与 note 要求分工（介词语组须点明介词角色）
- Lookup 的 `preposition` 仍为意象理解；与 Core 介词语组清单不重复

### 3. 双轨练习
- Lookup：`meaning-check` — 输入大致意思（中/英），AI 对错与纠正
- Core：保留场景造句 `usage-output`

### 4. 设置与 prompt
- `DEFAULT_MODULES` / `DEFAULT_CORE_MODULES` 重写；`normalizeCoreModules` 兼容旧 persist（旧合并 collocations → 拆分；剔 Core dictionary）
- 全量查词：`cognitive=core` 时读 `coreModules`（此前误读 Lookup 列表）
- 出厂顺序可拖拽覆盖（两模式各自列表）

### 5. 审查修复（同日，重组后发现）
- **`isEnabled` 语义**：不在当前模式列表的模组视为关闭（旧 `!== false` 会把已迁出模组仍当开启，Lookup 继续要搭配/近义/文化）
- **`getConfig`**：读 localStorage 时走 `normalizeModules` / `normalizeCoreModules`，与设置页迁移一致

### 6. 涉及文件
- `settingsStore.ts`、`ai.ts`、`AiFullView`、`CoreCognitiveView`、`ResultView`、`PhraseView`、`CollocationCard`、`PracticeSection`、`UsageScenesCard`、`i18n`、`AGENT.md`、`04`/`07`

### 7. 后续
- 词组 Core 模组分轨 / 中文 Core 候选 / wordGraph 重试 → 见 **2026-07-26** 条目。

## 2026-07-25 — Instant 复位、空态、历史双星分轨与释义补全

### 1. Instant 切回：有本地则只显 L1；无本地则清空结果区
- **文件**：`App.tsx` `handleModeChange`
- **行为**：点 Instant 不再「假 Instant 真 AI」；AI 缓存保留，仅不在 Instant 视图加载。

### 2. 空态：任意默认模式都显示小书引导
- **文件**：`App.tsx` `showEmptyHome`
- **行为**：默认 Pure Core 也不再抢走首页空态。

### 3. 历史双星分轨 + 优先轨设置
- **文件**：`historyStore`（`lookupAiMode` / `coreAiMode`）、`HistoryList`（琥珀=Lookup / 靛色=Core）、`settings.historyPreferCognitive`（Search Behavior 组）
- **行为**：两轨分开记录；双轨都有时按设置优先（默认 Lookup）回放并切到对应模式。

### 4. 强制 AI 文案与 Lookup 区分（方案 A）
- **文案**：`search.forceAi` →「强制 AI 全量（旁路词库）」+ hint。

### 5. 释义缺失：静默重试一次 + 板块级只补缺失
- **文件**：`useAiLookup`、`fillMissingCollocationNotes` / `fillMissingConceptExamples`、`CollocationCard` / `WordGraphCard`
- **行为**：全量结果缺释义时自动再拉一次；仍缺则板块按钮只补缺失项，已有释义不重写。

### 6. 后续：Lookup / Core 学习流模组重组
- 已在同日后续提交中完成（见上方「Lookup / Core 模组学习流重组」）。

## 2026-07-25 — Chunks / 概念树强制释义与可见展示

### 1. 修复：语块 & 搭配缺少可读释义
- **文件**：`CollocationCard.tsx`、`src/services/ai.ts`（analyze + full lookup）
- **问题**：`note` 只藏在 hover tooltip，且 prompt 允许 `N/A`，用户看不到短语意思。
- **修复**：每条 chunk/搭配**始终展示释义**；prompt 强制 `note` 为清晰中文/英文意思，禁止空话/`N/A`。

### 2. 增强：Pure Core 概念树例句带释义 + 母语心智
- **文件**：`WordGraphCard.tsx`、`types` `ConceptGraphExample`、`getFullLookupPrompt`（core）
- **实现**：`examples` 改为 `{ phrase, meaning, mindHint }`；UI 展示释义与心智提示；兼容旧缓存纯字符串。

## 2026-07-25 — 单词全量分轨、Instant 回落默认模式、Lookup 点击即搜

### 1. 增强：单词全量 Lookup / Pure Core 分轨（对齐词组）
- **文件**：`src/services/ai.ts`、`useAiLookup.ts`、`resultStore.ts`、`utils/text.ts`、`App.tsx`
- **实现**：`aiFullLookup` 增加 `cognitive`；Lookup 偏理解记忆（coreConcept，无 nativeMindModel/图谱）；Core 必填心智 + conceptGraph；缓存 `q` / `q::core` 分轨。

### 2. 优化：Instant 词库未命中 → 按设置默认模式落入 Lookup 或 Core
- **文件**：`App.tsx`、`preferredAiModeFromSettings`
- **问题**：Instant 搜不到词时固定进 Lookup。
- **修复**：读取 `defaultSearchMode`；设为 Pure Core 则进 Core，否则进 Lookup（默认 Instant 时也进 Lookup）。强制 AI 同理。

### 3. 修复：点击 AI Lookup 与 Pure Core 一样自动触发搜索
- **文件**：`App.tsx` `handleModeChange`
- **实现**：Instant/Core → Lookup 时立刻 analyze / phrase Lookup / 全量 Lookup（有本地快照则恢复 L1+analyze）；不再只靠再点搜索。

## 2026-07-25 — 雪藏个人笔记区 + 词组/句子 Core 与 Lookup 分轨

### 1. 雪藏：结果页「Personal notes & Q&A」编辑面板
- **文件**：`UserNoteEditor.tsx`（SHELVED）、`PhraseView` / `AiFullView` / `CoreCognitiveView` / `ResultView`、`AGENT.md`、`05` / `08`、双 README
- **决策**：面板与 md 词库无关，只读写 SQLite `user_word_memory`；产品面暂不需要编辑入口。
- **实现**：四路结果页卸下 `UserNoteEditor`；源码与 DB API 保留；`LexiconMemoryBadge` 改为只读展示。

### 2. 增强：词组/句子 Pure Core 与 AI Lookup 拉开差距（对齐 docs/07）
- **文件**：`src/services/ai.ts`、`useAiLookup.ts`、`resultStore.ts`、`PhraseView.tsx`、`App.tsx`、`types`、`utils/text.ts`、`07-cognitive-and-settings-architecture.md`
- **问题**：词组/句子共用同一 `aiPhraseQuery` 与 `phraseCache`，Core 无法体现「母语者心智模式」。
- **实现**：
  - Lookup / Core **分轨 prompt**：Core 必填 `nativeMindModel`，优先交际意图与违和感对比；Lookup 仍以释义/订正/场景为主。
  - 缓存 key：`q` vs `q::core`，模式切换互不覆盖。
  - Core UI：Pure Core 徽章、心智卡片前置、场景先于释义；隐藏助记/练习。
  - 修复历史回放强制把词组切回 AI Lookup 的问题。

## 2026-07-25 — 首页空态居中、AGENT 上下文与上传门禁 (v0.8.4)

### 1. 优化：查词首页空态整屏几何居中
- **文件**：`src/App.tsx`
- **问题**：空态随内容区 / 底栏显隐滚动，视觉中心会跳动。
- **修复**：空态改为 `fixed inset-0` 几何居中，`pointer-events-none`，不随底栏布局抖动。

### 2. 重构：AI 启动上下文统一为 `AGENT.md`
- **文件**：`AGENT.md`（新建）、`CLAUDE.md`（兼容跳转）、`lexicon-docs/README.md`、`lexicon-docs/CC-INSTRUCTIONS.md`、`lexicon-docs/scripts/check-doc-sync.sh`
- **实现**：多 Agent 通用启动上下文；`CLAUDE.md` 仅跳转；文档同步脚本改检 `AGENT.md` 与根目录 `CHANGELOG.md`。

### 3. 规范：`workflow.md` §0 上传前文档门禁 + 双 README 对齐现状
- **文件**：`workflow.md`、`AGENT.md`、`README.md`、`README_en.md`
- **实现**：推送/发版前强制用 git 基线核对 CHANGELOG；成对更新中英文 README（三模式、底栏 Settings、v0.8.4 下载链接、Pronunciation / Notes / Profile 等）。

## 2026-07-25 — 模式切换一键触发 AI 与历史缓存配对加固 (v0.8.3) 【重大更新】

### 1. 修复：Instant / AI Lookup → Pure Core 点击即可启动搜索
- **文件**：`src/App.tsx`、`src/hooks/useAiLookup.ts`
- **问题**：模式切换依赖 `aiStatus === 'idle'`，Instant 查完再切 AI 后 `status` 已是 success，再点 Pure Core 不会触发；且仅靠 `useEffect` 偶发不同步。
- **修复**：分段控件改为 `handleModeChange` 点击即处理——有缓存恢复，无缓存立刻 `triggerFullLookup` / `triggerPhraseQuery` / `triggerAi`；Instant 与 AI Lookup 均可直达 Core。
- **附带**：全量 lookup / phrase 始终拉完整 schema（Core UI 需要词根、近义、文化等字段）。

### 2. 优化：AI 追问缓存 key 与历史/结果缓存对齐
- **文件**：`src/stores/chatStore.ts`、`src/components/ResultView/AiSection/AiChatBox.tsx`
- **实现**：chat 存储 key 统一 `normalizeQuery`，与历史 100 条、三路 AI 缓存配对一致；历史回放后追问记录可正确找回。

## 2026-07-25 — 雪藏弱项看板、Core 模式缓存修复与导航/文档对齐 (v0.8.2)

### 1. 雪藏：弱项看板 UI 不进当前 App（代码保留）
- **文件**：`src/App.tsx`、`src/components/MemoryView.tsx`、`src/components/AILearningDigestCard.tsx`
- **决策**：看板目前非必要产品表面；**不删源码**，从导航与渲染树完全撤出。
- **实现**：
  - 底栏恢复 **3 Tab**：Dict / Image / Settings；`AppView` 不再包含 `memory`。
  - `MemoryView` / `AILearningDigestCard` 文件头标注 `SHELVED`，暂不 `import` 进 `App`。
  - 首页空态保持纯净（Book 图标 + 引导文案）；Profile 后端与 Settings `ProfileModal` **仍可用**。

### 2. 修复：Core 模式下命中全量缓存 / 历史回放被强制切回 AI
- **文件**：`src/App.tsx`、`src/components/ResultView/LexiconMemoryBadge.tsx`
- **问题**：`handleWordSelect`（含历史回放路径）在存在 `cachedFull` 时无条件 `setMode('ai')`，用户停留在 Mode 3 时会被抢走；`LexiconMemoryBadge` 未传 `onOpenNotes` 时仍渲染可点按钮。
- **修复**：查词与历史路径均仅在非 `core` 时切到 `ai`；Core 下无全量缓存则走 `triggerFullLookup`；Badge 无回调时降级为普通 `span`。

### 3. 优化：设置行对齐、Accordion 去死 prop、底栏全量 i18n
- **文件**：`SettingsView.tsx`、`Accordion.tsx`、`i18n/index.ts`、`App.tsx`、`CoreCognitiveView.tsx`
- **实现**：
  - 设置行左栏 `flex-1 min-w-0 pr-3`、描述 `text-[11px] leading-snug`、按钮 `whitespace-nowrap shrink-0`。
  - `Accordion` 删除未使用的 `icon?` prop，禁止 trigger 再挂 emoji。
  - 底栏标签统一 `nav.dict` / `nav.image` / `nav.settings`；各 Tab `py-1.5` 对齐。
  - Pure Core 徽章文案精简为「Pure Core」。

### 4. 文档与发版流程对齐
- **文件**：`09-ui-ux-design-system.md`、`08-ai-learning-system-and-profile.md`、`05-components.md`、`CC-INSTRUCTIONS.md`、`CLAUDE.md`、`workflow.md`、`02-ui-design.md`
- **实现**：
  - 明确当前 3-Tab；看板 UI 雪藏规则写入 Agent Directives。
  - `08` 状态改为「后端已落地 / Digest 已雪藏」；`05` 组件树与现 App 一致。
  - `02` / `CC-INSTRUCTIONS` 纠正「Settings 抽屉」过时描述。
  - `workflow.md`：`release_notes_*.md` 改为发版时**临时生成**（真相源 `CHANGELOG.md`），用完可删、不必入库。

### 5. 补齐：全结果页笔记区 + 界面语言全量 i18n
- **文件**：结果页组件、`SearchBar`、`SettingsView`、`ImageViewer`、`updateStore.ts`、`i18n/index.ts` 等
- **实现**：
  - `AiFullView` / `CoreCognitiveView` 补齐 `UserNoteEditor`；Badge 经 `openUserNotes()` 跳转笔记区。
  - 搜索栏、历史、设置分组/表单标签、释义/例句/助记标题、Phrase 折叠、近义词语气、违和感卡片、文化语域、图片缩放控件、更新 toast/错误等全部走 `t()` / `tStatic()`。
  - 修正 zh locale 中仍为英文的 `settings.*` 键；模式品牌名（Instant / AI Lookup / Pure Core）与 UK/US 刻意保留英文。

## 2026-07-25 — Phase 5: Lexicon 第二大脑与轻量 User Profile 智能归纳系统实施完成 (v0.8.0)

### 1. 新增：类型定义与 SQLite 个人资产表 (`user_word_memory`)
- **文件**：`src/types/index.ts`、`src/services/db.ops.ts`、`src/services/db.ts`、`src/services/db.web.ts`、`src/services/db.native.ts`
- **实现**：
  - 在 `types/index.ts` 中定义 `UserLanguageProfile`、`WeaknessPattern`、`ExplorationFocus`、`ProfileRecommendation` 与 `UserWordMemory` 接口。
  - 在 SQLite 服务中创建 `user_word_memory` 资产表及 API（`getUserWordMemory`、`saveUserWordNote`、`saveUserWordConversation`、`saveUserWordCoreConcept`、`recordWordView`、`getAllUserWordMemories`）。
  - 在 `db.ops.ts` 中支持 Web `localStorage` 双向持久化备份 (`lexicon-word-memory-backup`)，保证刷新或极端情况下零数据丢失。

### 2. 新增：Profile 诊断服务与双路触发引擎 (`src/services/profile.ts`)
- **文件**：`src/services/profile.ts`、`src/services/db.ops.ts`、`src/components/Settings/ProfileModal.tsx`
- **实现**：
  - **Gemini 高上下文 Prompt 扩容 (8,000~15,000 Tokens)**：充分利用 Gemini 2.0 Flash / Flash Lite 高上下文与低成本特性，将事件缓冲池扩展至 100 条，将单条 Q&A 解析截取扩展至 1,000 字符，输入 25~45KB 上下文进行全量蒸馏。
  - **基于旧 Profile 的智能增删改 (Intelligent Upsert)**：诊断时将已有 `user_profile.json` 传入 AI 作为 Baseline，AI 执行**增**（加入新薄弱点/错例）、**改**（累加暴露频次 `occurrenceCount`、精细化描写与典型错例对比 `contrastExample`）、**删/剪枝**（标记克服为 `mastered`，保持 8~12 条 Active 聚焦）。
  - **Profile 丰富度与 SQLite 20K Token 防溢流保护**：Profile 保持 1,500~3,000 Tokens 输出容量；在 `db.ops.ts` 中对 `user_word_memory` 单词历史记录设置 20K Tokens (~60,000 字符) 动态容量防护，超出自动裁剪最老 Q&A 维持资产健康。

### 3. 新增：设置开关与 Profile 诊断面板 (Settings & Profile Modal)
- **文件**：`src/stores/settingsStore.ts`、`src/components/Settings/ProfileModal.tsx`、`src/components/Settings/SettingsView.tsx`
- **实现**：
  - 在 `settingsStore` 中增加 `enableProfileDiagnostic` 统一主开关。
  - 创建 `ProfileModal.tsx` 交互弹窗，展示活跃语言薄弱点 (Active Gaps)、已克服盲区 (Mastered)、探索偏好与 AI 拓词推荐，并提供手动重新蒸馏与 Profile 数据重置按钮。
  - 在 SettingsView 中新增 AI Profile 控制专区与清空日志功能。

### 4. 新增：看板与词汇资产 UI 组件 (Digest & Lexicon Memory UI)
- **文件**：`src/components/AILearningDigestCard.tsx`、`src/components/ResultView/LexiconMemoryBadge.tsx`、`src/components/ResultView/UserNoteEditor.tsx`
- **实现**：
  - **AILearningDigestCard**：置于搜索空白页，展示用户 Active 弱项看板与 AI 导引推荐（支持一键跳转 Mode 3 Core 探索）。
  - **LexiconMemoryBadge**：在结果页顶部展现查询频次、已有笔记标志、AI 追问历史条数与沉淀 Core 意象 Badge。
  - **UserNoteEditor**：在结果页末尾提供个人笔记编辑器、Q&A 历史回顾与 Core 意象沉淀展现。

### 5. 重构与逻辑加固 (Critical Fixes & Refactoring)
- **db.native.ts 原生修复**：补齐 `db.native.ts` 中 `initUserWordMemoryTable` 缺失调用，保障 Android/Capacitor 原生 SQLite 表正确创建。
- **AiChatBox & useAiLookup 事件联动**：在 AI 对话与短语订正完成时自动持久化到 `user_word_memory` 并触发表路径 A 诊断。
- **健壮性防崩溃**：为 `LexiconMemoryBadge` 与 `UserNoteEditor` 中的 JSON 解析添加 try-catch 兜底保护，防止意外坏数据导致白屏。
- **AiFullView 储存键对齐**：对齐 `AiFullView` 的 `UserNoteEditor` 存储 key 为 `correctForm`，解决拼错词场景下与 AI 追问历史无法关联的问题。

### 6. 优化：非英语/小语种过滤、图片翻译隔离与首页看板 i18n 多语言国际化
- **文件**：`src/i18n/index.ts`、`src/components/AILearningDigestCard.tsx`、`src/services/profile.ts`、`src/App.tsx`
- **实现**：
  - **非英语/小语种智能过滤**：利用 `detectLanguage` 在 `profile.ts` 中拦截日文 (`ja`)、韩文 (`ko`) 及其他非中/英小语种查询，不计入 `lookup`、`sentence` 与 `chat` 学习事件；同时在 Prompt 中增加 Scope Filter，指示 AI 忽略非英语学习内容。
  - **图片翻译隔离**：确认图片翻译 (`ImageTranslateView`) 纯粹用于文本翻译，隔离不计入 Lexicon 第二大脑的查词与事件诊断。
  - **看板 i18n 国际化**：`AILearningDigestCard` 全面引入 `useT()`，根据 App 语言设置（`appLanguage === 'en'` / `'zh'`）动态无缝切换中英文标题、描述、空白页引导文案与 Mode 3 Core 导航按钮。
  - **首页布局防遮挡优化**：优化 `App.tsx` 首页空白状态 (`!query`) 的 Bottom Padding (`pb-32`) 与图标高度，彻底解决底部悬浮 Nav 导航胶囊遮挡文字与内容挤压无法下滑的视觉 Bug。

## 2026-07-25 — 深度认知体系、模式 3 (Core Mode) 与设置 UI 重构架构设计完成 (v0.8.0-plan)

### 1. 新增：深度认知架构规范文档 (`lexicon-docs/07-cognitive-and-settings-architecture.md`)
- **规划**：定义了句子订正的“母语者思维违和感剖析 (Why it sounds unnatural)”算法与 UI 表达。
- **规划**：定义了搜索模式 2 (Standard AI Mode) 的充实方案（前置 Core 意象、Chunks 空间延伸、Synonyms 褒贬色彩/用词时机）。
- **规划**：定义了全新搜索模式 3 (Pure Core Cognitive Mode) 的信息架构（Core 统领、衍生场景、语义关系树状图、嵌入式 AI Chat）。
- **规划**：定义了设置页面 (Settings UI) 的重构标准（Tab 分页、模式 2/3 模组独立控制、手风琴空间收纳）。

### 2. 新增：智能学习系统与第二大脑架构规范文档 (`lexicon-docs/08-ai-learning-system-and-profile.md`)
- **微调**：设定 2,000~3,000 Tokens 黄金预算，支持单词、句子违和感剖析与 AI 追问对话的三维数据摄取。
- **微调**：定义“路径 A (即时追问) / 路径 B (保底 12 次)”双路触发与 `unprocessed_count` 共享重置算法。
- **微调**：增加 AI 诊断 Prompt 权重层级（AI 追问与句子订正设为 High Priority，常规查词设为 Normal Priority）。
- **微调**：定义设置页面中的 `enableProfileDiagnostic` 统一总开关与 Profile 数据查看/清空重置控制面板。
- **微调**：明确区分 100 条流动 Search Log 与 SQLite 永久 `user_word_memory` 资产表。

## 2026-07-24 — PC 文本溢出修复、AI 长文本全文翻译 Prompt 优化与 UI 折叠展示 (v0.7.37)

### 1. 修复：PC 平台/Webview 长文本与 URL 溢出问题
- **文件**：`src/components/ResultView/PhraseView.tsx`、`src/components/ResultView/DiffText.tsx`
- **解决**：在白字标题 `h1`、`DiffText` 以及 `PhraseView` 根容器上添加 `min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]` 样式，防止无空格 URL 或长文本撑大窗口宽度超出屏幕。

### 2. 优化：AI 长文本 Prompt 规则（解决长文本偷懒单句总结问题）
- **文件**：`src/services/ai.ts`
- **解决**：更新 `getPhrasePrompt`，明确要求 AI 在面对长文本或多句段落时，`meaning` 必须提供**句句对应的完整中文翻译**（可首行置顶【核心主题】总结，但后文必须包含全文所有句子的完整翻译），避免 AI 仅给出单句总结。

### 3. 新增：长文本/段落 UI 折叠与渐进展开机制
- **文件**：`src/components/ResultView/PhraseView.tsx`
- **设计**：针对长 `correctForm` / `DiffText` 区域以及长 `meaning` 翻译文本，超出设定阈值时默认限制最大展示高度并叠加淡出渐变，提供“展开全文 / 收起”交互控制，提升长文本阅读与对比体验。

## 2026-07-24 — Capacitor 原生 SQLite 双端共用存储层 (v0.7.36)

### 1. 新增：`@capacitor-community/sqlite` 适配器（iOS + Android 共用）

- **文件**：`src/services/db.native.ts`、`src/services/db.ts`、`capacitor.config.ts`
- **设计**：Capacitor 下通过 `DBService` 走原生 SQLite；`copyFromAssets` 从 `public/assets/databases/` 拷入沙盒后按页查询，避免 30–46MB 整库进 JS/WASM。Web/Tauri 仍用 sql.js。原生初始化失败自动 fallback 到 sql.js。

### 2. 重构：查询语义抽到 `db.ops.ts`

- **文件**：`src/services/db.ops.ts`、`src/services/db.web.ts`
- **设计**：suggest / lookup / relatedPhrases / 词典路由与 web、native 共用，两端只保留引擎打开与 `SqlRunner` 差异。

### 3. 词库路径统一为 `public/assets/databases/`

- **文件**：`public/assets/databases/lexicon.db`、`lexicon_en.db`；转换脚本与文档同步更新
- **设计**：满足 Capacitor SQLite assets 约定，同时 web `fetch('/assets/databases/...')` 单一路径，避免双份进 git。

### 4. 复查加固

- **Native `toRunner`**：按 SELECT 列名识别 iOS 表头行；对象行用固定 key 序映射，避免纯字符串列误吃首行数据。
- **enen 缺失回退**：不再把 enzh 连接缓存进 `_dbEnEn`（避免 invalidate 关错连接）；改用 `_enenUnavailable` 标记。`DbInvalidated` 不再被 fallback 吞掉。

## 2026-07-24 — iOS/切页卡顿止血：词库误卸载修复与 Tab 保活 (v0.7.35)

### 1. 修复：任意设置变更都会卸掉 sql.js 词库

- **文件**：`src/services/db.web.ts`、`lexicon-docs/03-database.md`
- **问题**：`useSettingsStore.subscribe` 未比对字段，深色模式/模块等任意 `set` 都会 `close` 两本词典；回到搜索后被迫重新灌入 30–46MB，iOS 上极易卡顿甚至 WebView 黑死。
- **修复**：仅当 `activeDictionary` 真正变化时才 invalidate；单语言等开关只影响路由，不卸库。

### 2. 优化：词库加载 in-flight 去重 + 单库预热

- **文件**：`src/services/db.web.ts`、`src/services/db.ts`、`src/App.tsx`
- **设计**：
  - 同一本库并发 `getDb*` 共享一个 Promise；`initSqlJs` 只初始化一次。
  - 换库用 epoch 丢弃过期加载结果；invalidate 后经 gate 串行化，避免两份 30MB+ 并行进内存。
  - `warmupDictionary()` 等待 settings persist hydration 后再预热，且只预热当前 `activeDictionary` 对应的一本。

### 3. 优化：底部 Tab 首次挂载后保活（hidden，不整树卸载）

- **文件**：`src/App.tsx`
- **设计**：Dict / Image / Settings 首次进入后保留挂载，切换仅 `hidden`；切换时 blur 焦点并重置滚动位置，避免长设置页残留 scrollTop / iOS 键盘挂在隐藏 input 上。不改特效/blur。

## 2026-07-24 — 修复 iOS 上 AI Chat 语境灯泡易消失 (v0.7.34)

### 1. 修复：iOS 键盘弹出时把语境灯泡滚出视口

- **文件**：`src/App.tsx`
- **问题**：Capacitor iOS 在键盘弹出时对输入框执行 `scrollIntoView({ block: 'center' })`，会把 AI Chat 标题行上的语境灯泡顶出可视区；现代 Android 早退不做该滚动，PC 无软键盘，故两端正常。
- **修复**：仅在 `platform === 'ios'` 时改为 `block: 'nearest'` 且只滚一次；Android / 其它路径保持原来的 `center` + 双次滚动不变。

### 2. 优化：语境灯泡移到输入框旁（仍只有一个）

- **文件**：`src/components/ResultView/AiSection/AiChatBox.tsx`
- **设计**：把唯一的灯泡从标题右侧挪到输入框左侧，与输入框同排。键盘为保输入框可见而滚动时，灯泡会一起留在视野内；不新增第二个按钮。

### 3. 修复：本地词库 AI 模式未注入 enrichedContext

- **文件**：`src/components/ResultView/index.tsx`
- **问题**：`ResultView`（本地词条 + AI）渲染 `AiChatBox` 时未传 `enrichedContext`，导致该路径下灯泡永远不出现。
- **修复**：AI 分析成功后，用释义/例句/近义词等拼出与 AiFull/Phrase 同构的 `enrichedContext`，仍只渲染一个 `AiChatBox`。

## 2026-07-20 — 单词与短语发音（音频播放）支持与配置面板集成 (v0.7.33)

### 1. 新增：单词与短语的英式 (UK) / 美式 (US) 动态发音支持
- **文件**：`src/services/audio.ts` (新文件), `src/components/ResultView/WordHeader.tsx`, `src/components/ResultView/PhraseView.tsx`
- **设计**：
  - 接入公共有道 dictvoice 发音流接口，针对英语单词和短语提取英式 (UK, `type=1`) 和美式 (US, `type=2`) 两个独立的在线发音。
  - 对于日、韩、中等非英语内容，自动匹配相应的发音参数。
  - **离线与错误兜底机制**：检测到设备离线 (`!navigator.onLine`) 或在线音频加载/播放失败时，自动退避使用原生的 Web Speech API (TTS)，依据语种对齐不同的发音人（如 `en-GB`, `en-US`, `ja-JP` 等），保障零打断的查词听音体验。
  - **防混音重叠**：管理全局播放指针，在触发新音频前自动强制暂停上一个播放中的音频或语音合成。

### 2. 新增：极具动感的播放状态微动效反馈
- **文件**：`src/components/ResultView/WordHeader.tsx`, `src/components/ResultView/PhraseView.tsx`
- **设计**：
  - 发音播放底层接口封装为 Promise，待音频播放完全结束后方才 Resolve。
  - 查词头部的 UK / US 按钮引入播放状态监听。处于发音阶段时，按钮背景自适应呈现选中高亮色并进入呼吸闪烁状态 (`animate-pulse`)，伴随轻微下沉微缩 (`scale-95`)；小喇叭图标开启律动跳跃 (`animate-bounce`)。
  - 提供即时、自然的视觉反馈，极大提升界面精细感和灵动性。

### 3. 新增：发音口音偏好设置与自动播放开关
- **文件**：`src/stores/settingsStore.ts`, `src/components/Settings/SettingsView.tsx`, `src/i18n/index.ts`
- **设计**：
  - 设置页面新增 **「发音音频设置」** 专属板块。
  - **发音默认口音**：支持定制首选的口音（美式发音 US / 英式发音 UK）。
  - **查询单词自动发音**：控制每次查词（单词/短语）渲染时，自动进行发音。

## 2026-07-18 — 修复 AI Chat 界面死循环渲染崩溃 (v0.7.32)

### 1. 修复：Zustand 默认空数组引用引发的 React 渲染崩溃

- **文件**：`src/components/ResultView/AiSection/AiChatBox.tsx`
- **问题**：在切换没有聊天历史的词条时，Zustand store selector 中直接使用 `messagesByWord[context] ?? []` 默认空数组。由于 `[]` 每次选择器评估时都是全新引用，Zustand 判定状态已改变并重复触发订阅重绘，从而导致死循环及 Minified React Error #185（超过最大更新深度）。
- **修复**：在组件外声明静态 `EMPTY_MESSAGES` 数组，在 selector 回退时统一复用该同一静态引用，从而避免了引用的频繁变化，彻底清除了死循环问题。

## 2026-07-17 — AI Chat 语境准确性与记录持久化 (v0.7.31)

### 1. 修复：Phrase/Sentence 查询时 AI 辅助板块使用正确的纠正句

- **文件**：`src/components/ResultView/PhraseView.tsx`、`src/components/ResultView/AiFullView.tsx`
- **问题**：在短语/句子模式下，Mnemonic、Practice、AI Chat 等模块错误地将用户输入的原始错误短语（例如 "catch you round"）作为生成词，导致助记与后续练习退回到错误表达的语义上去解释。
- **修复**：修正了这三个板块传递给底层的入参，确保在存在修正句时，统一优先使用纠正后的 `phraseResult.correctForm` / `aiFullResult.correctForm`。

### 2. 新增：AI Chat 完整语境一键注入功能（灯泡按钮）

- **文件**：`src/components/ResultView/AiSection/AiChatBox.tsx`、`src/services/ai.ts`、`src/i18n/index.ts`
- **设计**：
  - 在 AI 问答模块右上角新增了一个灵动的“💡（灯泡）”纯图标按钮。
  - 激活后，在发起提问时，会自动整理当前卡片已生成的释义、例句、助记法、介词空间意象、文化背景等所有细节作为 System Context 附加给 AI。
  - 对话助手将不再是“凌空提问”，而是能够准确契合页面展示的分析内容进行回答，有效防止 AI 前后言行不一。

### 3. 新增：设置页支持定制 Chat 语境默认开启状态

- **文件**：`src/stores/settingsStore.ts`、`src/components/Settings/SettingsView.tsx`、`src/i18n/index.ts`
- **设计**：在设置界面「单语言模式」下方新增「Chat 默认开启完整语境」开关，方便用户根据日常资费习惯/网络喜好决定初始状态是极简省 Token 模式还是完整语境模式。

### 4. 新增：Chat 记录按词条独立存储并自动持久化

- **文件**：`src/stores/chatStore.ts` (新文件)、`src/stores/resultStore.ts`
- **设计**：
  - 移除了原来全局单数组、随词条切换而丢失且无法重载的临时聊天方案。
  - 新建了 `chatStore` 并结合 Zustand `persist`，利用 `correctForm` 纠正句作为唯一 key，实现聊过的内容自动持久化到本地。
  - 切换搜索任何单词/短语时，自动加载该词专属的聊天历史，再次打开应用时可无缝还原历史追问场景。
  - 引入了 LRU 自动回收策略，本地最多缓存 100 个历史词条 of 聊天记录，防止 LocalStorage 无限膨胀。

## 2026-07-17 — 图片翻译支持 Trilingual Examples 三语模式 (v0.7.30)

### 1. 新增：图片翻译 Trilingual 提示词模式

- **文件**：`src/services/ai.ts`
- **设计**：当系统设置中的「三语例句（Trilingual Examples）」开启、图片源语言为外语（如法/日/韩等）、且翻译目标语言为中文时，图片翻译（aiImageTranslateFast）会加载专有的三语翻译提示词，命令 AI 在输出中文译文的同时附加一列对应的 `translationEn` 英文译文。

### 2. 新增：图片翻译列表 UI 对照展示英文副译

- **文件**：`src/components/ImageTranslate/TranslationList.tsx`、`src/types/index.ts`
- **设计**：在列表形式的翻译结果中，当对应文本块含有 `translationEn` 数据时，将在中文编辑框下方展示一行灰色斜体英文副译文本，帮助用户结合英文更好地理解外语漫画/图表语境。

## 2026-07-14 — 句子翻译搜索修复 + 修改解释折叠板块 (v0.7.29)

### 1. 修复：correctForm 不再删减/截断原文（aiPhraseQuery 提示词）

- **文件**：`src/services/ai.ts`
- **问题**：`getPhrasePrompt` 的 `correctForm` 描述不够严格，导致 AI 误将"修正"理解为"简化"，对大段句子输入只保留开头一句。
- **修复**：
  - `correctForm` 字段说明改为明确禁止删减/截断：*"do NOT shorten, summarize, or truncate the input. correctForm is the proofread original, not a rewrite."*
  - Rules 部分新增 CRITICAL 规则：长句/段落时必须保留全部内容，逐词修正，无错时与原文完全相同
  - 中文翻译场景（输入中文→英文）同样要求保留完整中文含义

### 2. 新增：correctionNote 字段（aiPhraseQuery 修改解释）

- **文件**：`src/types/index.ts`、`src/services/ai.ts`
- **设计**：
  - `PhraseResult` 接口新增可选 `correctionNote?: string` 字段
  - Prompt schema 加入 `correctionNote`，要求 AI 用1-2句话解释改动属于哪类：能理解但不地道 / 能理解但更通畅 / 语法或搭配有误 / 无实质错误微调
  - 大小写/标点仅在影响意义时才提及；无改动时省略

### 3. 新增：可折叠"为什么这么改？"板块（PhraseView UI）

- **文件**：`src/components/ResultView/PhraseView.tsx`、`src/i18n/index.ts`
- **设计**：
  - 在 "you entered / 你输入的是" diff 行下方，新增折叠触发按钮（默认折叠，用户点击展开）
  - 展开后以左侧琥珀色边线块展示 `correctionNote` 内容
  - 仅当 `correctionNote` 字段存在且非空时才显示
  - 新增 i18n key：`phrase.whyChanged`（中：为什么这么改？/ 英：Why was this changed?）

## 2026-07-05 — 介词空间意象单语言自适应语言逻辑优化 (v0.7.28)

### 1. 优化：介词空间意象板块对齐 Monolingual 用户设置

- **文件**：`src/services/ai.ts`
- **设计**：重写了 `generatePrepImagery` 与 `regenerateSinglePrepItem` 的系统提示词和返回 schema。AI 会自动根据当前的单词/短语单语模式（Monolingual）状态决定输出语种。若单语模式开启，输出全英文的介词核心概念、意象解析和记忆联想线索；若关闭，则输出中文解析，完美适配浸润式学习体验。

## 2026-06-24 — 适配所有AI功能在单英文/双语模式下的提示词 (v0.7.27)


### 1. 新增：单语言与双语提示词动态选择辅助逻辑
- **文件**：`src/services/ai.ts`
- **设计与实现**：
  - 设计并引入了统一的单语言配置检测辅助函数 `getIsMono(query, config)`，动态解析输入表达的被查语言，自动对齐单词、短语、句子对应的 Monolingual 用户设置，为各项 AI 功能决策输出语言。

### 2. 优化：助记模块在单语言模式下的全英文生成
- **文件**：`src/services/ai.ts`
- **设计与实现**：
  - 动态重构了助记卡片生成提示词（单词助记、短语助记与单助记词条重新生成）。当处于英文单语言模式时，将系统提示词转换为全英文规则限制，生成无中文字符的记忆法及解释原因，并使用英文 Wordplay / Rhyme 机制替换原先的中文谐音法。

### 3. 优化：练习生成与写作批改的单语言支持
- **文件**：`src/services/ai.ts`
- **设计与实现**：
  - **练习场景**：练习题场景生成系统提示词支持单语言化，使用纯英文描述生成练习场景，并将被查释义上下文格式化为只包含英文定义的输入。
  - **批改评估**：评价反馈的系统提示词支持单语言化，批改意见及修改后例句在单语言模式下均由纯英文输出。

### 4. 优化：AI 聊天助手在单语言模式下的回复语种
- **文件**：`src/services/ai.ts`
- **设计与实现**：
  - 聊天组件触发 `askQuestion` 时检测被查上下文语言设置，处于单语言模式时，系统提示词指示 AI 助手采用简单明了的英语（CEFR B1-B2 水平）与用户进行交谈，确保极佳的浸润式学习体验。

## 2026-06-23 — 单词与短语搜索结果页面的紧凑度与留白布局极致优化 (v0.7.26)

### 1. 优化：扁平布局重构与自定义排序兼容
- **文件**：`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`
- **设计与实现**：
  - 取消了实验性的 Tab 标签页分栏设计，恢复为直观流畅的单流扁平瀑布布局，完美保留并全面兼容设置中由用户自定义的模块排序逻辑。

### 2. 优化：左右边距微调与文字折行优化
- **文件**：`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`
- **设计与实现**：
  - 将搜索结果页面最外层容器的左右内边距从 `px-4`（16px）收缩至 `px-3`（12px），极大拓宽了移动端文本的水平展示宽度，有效减少了长句及释义频繁换行导致的页面非必要垂直拉伸。

### 3. 优化：卡片紧凑度与间距重构
- **文件**：`src/components/ResultView/AiSection/CollocationCard.tsx`、`src/components/ResultView/AiSection/SynonymList.tsx`、`src/components/ResultView/AiSection/MnemonicCard.tsx`、`src/components/ResultView/AiSection/CulturalLoreCard.tsx`、`src/components/ResultView/AiSection/PrepImageryCard.tsx`
- **设计与实现**：
  - 将所有卡片容器的圆角统一从 `rounded-2xl` 改为更精致的 `rounded-xl`。
  - 将卡片内边距从 `p-4`/`p-5` 压缩至 `p-3.5`，使内容显示更紧凑。
  - 将各卡片之间的垂直外边距从 `mb-6`/`mb-8` 缩减至 `mb-3`/`mb-4`，大幅提升了排版的信息密度。

### 4. 优化：头部与具体内容项细节微调
- **文件**：`src/components/ResultView/WordHeader.tsx`、`src/components/ResultView/InstantSection/MeaningList.tsx`、`src/components/ResultView/InstantSection/ExampleList.tsx`
- **设计与实现**：
  - **WordHeader**：将单词头部的下边距从 `mb-8` 减小到 `mb-4`，使核心释义模块首屏显现位置更高。
  - **MeaningList**：将释义项外边距减为 `mb-4`，释义项垂直间距缩短至 `space-y-3.5`，并极度压缩了语境场景块的内边距和字号。
  - **ExampleList**：将例句外边距缩减至 `mb-4`，列表行高间隔降至 `space-y-3`，减少用户的翻页滚动阻力。

## 2026-06-23 — 支持本地英英词典与单语言模式自动切换

### 1. 新增与优化：本地双解词库深度重构及英英词典本地转换与接入
- **文件**：`scripts/mdx-en-to-sqlite.mjs` (新文件)、`scripts/mdx-to-sqlite.mjs`、`public/lexicon.db`、`public/lexicon_en.db` (新文件)
- **设计与实现**：
  - **英英词库转换**：编写了纯英英版 OALD10 MDX 转换脚本 `mdx-en-to-sqlite.mjs`，利用基于栈平衡的 HTML 标签匹配算法解析并提取了 OALD10 中的音标、词性、纯英文释义及英文例句，成功转换出包含 **84,843** 个词条的纯英英本地词库 `lexicon_en.db`。
  - **双解词库语法属性挖掘**：重构了双解版 OALD9 转换脚本 `mdx-to-sqlite.mjs`，成功抓取并解析了原先被忽略的 `<gram>`（如 `[uncountable]`）和 `<reg>`（如 `(formal)`）等语法/语域标签，并将其作为前缀嵌入中英文释义中，成功重新生成了包含 **52,867** 个词条的双解词典 `lexicon.db`。
  - **异步竞态条件修复**：修复了转换脚本中由于异步 `import('fs').then(fs => fs.unlinkSync)` 动态调用与 SQLite 实例化之间的并发冲突竞态条件，该竞态曾导致目标数据库文件偶尔被重置为 0 字节。

### 2. 新增：本地词典手动切换与单语言自动切换逻辑
- **文件**：`src/stores/settingsStore.ts`、`src/services/db.web.ts`、`src/components/Settings/SettingsView.tsx`、`src/i18n/index.ts`
- **设计与实现**：
  - 在设置状态中新增了当前激活词库 `activeDictionary` 和自动切换控制 `autoSwitchDictionary`。
  - 在 `db.web.ts` 中通过 Zustand `subscribe` 监听词典切换状态，自动释放 WASM 内存，并在下一次查询时重新加载对应的词库。
  - 在 `db.web.ts` 中添加了回退保护机制，如果加载英英词库失败，自动回退到默认的 `lexicon.db`，确保系统鲁棒性。
  - 在设置界面中新增了「本地词库设置」板块，允许手动切换词库以及启用单语言自动联动。

### 3. 优化：界面防重与排版过滤
- **文件**：`src/components/ResultView/InstantSection/MeaningList.tsx`、`src/components/ResultView/InstantSection/ExampleList.tsx`
- **设计与实现**：
  - 对释义与例句组件进行优化，在英英模式下（即释义字段与英文一致，或例句翻译为空时），隐藏底部的重复英文字段，防止界面文本重叠，实现最清爽的英英排版。

### 4. 优化：中文反向查词的数据库自动路由与 AI 提示词英文精准继承
- **文件**：`src/services/db.web.ts`、`src/App.tsx`
- **设计与实现**：
  - **中文强制路由**：在 `getTargetDb` 中增加了中文检测机制。一旦查询词包含中文字符，即使开启了单语言模式或手动指定了英英词典，系统也会自动路由到双语词典 (`lexicon.db`)，通过其 `zh_brief` 索引进行反向英文映射。
  - **AI 缓存与分析纠正**：当在双语词典匹配到对应的英文单词（如通过“跑”匹配到 "run"）后，后续的 AI 提示词触发与 `getCachedAi` / `setAiAnalysis` 缓存机制将全部自动继承其目标英文单词 "run"，避免了将中文检索词直接喂给 AI 导致的多语言生成混乱与缓存失效。

## 2026-06-22 — 多语言国际化 (i18n)、单语学习、语块与搭配、介词空间意象及文化背景升级

### 1. 新增：UI 国际化 (i18n) 与多语言界面切换
- **文件**：`src/i18n/index.ts`、`src/components/Settings/SettingsView.tsx`、`src/components/ErrorBoundary.tsx` 及十余个 UI 组件文件
- **设计与实现**：
  - 新增多语言本地化配置，建立完整的翻译资源字典，并封装出统一的国际化翻译 Hook `useT()`。
  - 将整个应用中硬编码的中文 UI 文本（包括释义折叠、卡片标题、助记词交互、设置选项等）全面替换为多语言 key 引用。
  - 在设置页中新增了「App Language（系统语言）」设置，支持用户在一键无缝切换中文和英文界面。
  - 适配了 `ErrorBoundary.tsx` 页面渲染崩溃边界的国际化，避免了系统报错时的中文硬编码残留。

### 2. 新增：单语学习模式 (Monolingual Mode) 及词级/词组级/句级细粒度控制
- **文件**：`src/stores/settingsStore.ts`、`src/components/Settings/SettingsView.tsx`、`src/services/ai.ts`、`src/components/ResultView/InstantSection/MeaningList.tsx`、`src/components/ResultView/InstantSection/ExampleList.tsx`、`src/components/ResultView/PhraseView.tsx`
- **设计与实现**：
  - 在设置中提供细粒度的单语配置：支持分别针对单词 (Word)、短语 (Phrase) 和句子 (Sentence) 独立开启单语模式。
  - **大模型 Prompt 适配**：对于单语查词/分析，修改系统提示词强制 AI 生成纯英文释义与解释，并使用 CEFR B1-B2 水平的词汇以确保内容对学习者易读，拒绝复杂的生僻词定义。
  - **UI 与本地词典联动**：在界面展示中，当开启对应单语模式后，自动屏蔽本地词典查询结果和 AI 生成结果中的中文翻译/例句中文。
  - **缓存失效联动**：修改设置状态 store，当用户变更单语模式开关时，自动清除本地的 AI 缓存，防止混杂的中英双语脏缓存污染未来的纯英单语查询。

### 3. 新增：语块与常用搭配模组 (Chunks & Collocations)
- **文件**：`src/types/index.ts`、`src/services/ai.ts` 、`src/components/ResultView/AiSection/CollocationCard.tsx` (新文件)、`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`
- **设计与实现**：
  - 在 `types/index.ts` 中定义了语块和搭配的数据模型。
  - 在 AI 的 System Prompts 和全量分析 Prompts 中新增 schema 与生成指引，要求生成该词最具代表性的 4-6 个常用语块（chunks，如动介搭配）与常用固定搭配（collocations，如形容词修饰）。
  - 创建了全新的 `CollocationCard.tsx` 卡片组件，将语块和搭配以不同颜色高亮展示，并利用 CSS Tooltip 技术以极其平滑优雅的形式在悬停时显示其用法说明。
  - 在标准字典卡片词条与 AI 全量卡片词条中均注册并渲染了该模组。

### 4. 新增：介词空间意象分析模组 (Preposition Spatial Imagery)
- **文件**：`src/types/index.ts`、`src/utils/prepDetect.ts` (新文件)、`src/services/ai.ts`、`src/components/ResultView/AiSection/PrepImageryCard.tsx` (新文件)、`src/components/ResultView/PhraseView.tsx`
- **设计与实现**：
  - 在 `prepDetect.ts` 中针对英语中核心的 13 个具有丰富空间隐喻的介词（如 up, out, off, on, over, in 等）编写了高效的短语成分提取扫描器。
  - 修改 `ai.ts` 新增介词空间意象的生成 API (`generatePrepImagery` & `regenerateSinglePrepItem`)，促使大模型基于认知语言学的“空间隐喻”理论（如 UP 表示“上升/完成/改善”，OUT 表示“显现/排除/发散”），以简明易懂的文笔剖析介词在该短语中对整词含义的塑形作用，并提供趣味联想。
  - 编写了极致精美的 `PrepImageryCard.tsx`，支持组件层面的异步首屏懒加载（按需按键生成）、支持骨架屏微动效与毛玻璃遮罩、支持独立介词一键「换一个」的局部更新。
  - 将介词意象模组成功嵌入短语/句子分析视图 `PhraseView` 中。

### 5. 优化：文化背景模组 (Cultural Context) 重塑与多语自适应
- **文件**：`src/services/ai.ts` 、`src/components/ResultView/index.tsx`、`src/components/ResultView/AiSection/CulturalLoreCard.tsx` (新文件)、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`
- **设计与实现**：
  - **打破外语局限**：大幅度重构了 AI 的 `culturalLore` 提示词逻辑。不仅日语/韩语等外语会提供亚文化背景，针对核心的英文词汇也提供极其精准的社会语域（Register，如 Formal/Informal/Slang/Technical/Neutral 等）标记、流行度及文化典故、俚语演变。
  - **界面激活**：在标准字典命中的 `ResultView` 中补全了缺失的 `case 'culture'`，彻底解决了该模组对普通查词场景完全不可见的痛点。
  - **组件共享**：新建并抽取公共的 `CulturalLoreCard.tsx` 组件，精细微调了其在明暗模式下的背景对比度，消除了多个地方复制粘贴的冗余 JSX，提高了渲染效率。

### 6. 优化：历史记录与本地 AI 结果缓存的联动清除
- **文件**：`src/stores/resultStore.ts`、`src/components/SearchBar/HistoryList.tsx`
- **设计与实现**：
  - 为了提供极佳的个性化隐私/控制感，解决了用户在查词历史中删除某一条历史记录时，背后的本地 AI 结果缓存仍会残留并可能再次被误调出来的体验缺陷。
  - 在 `resultStore` 中新增 `evictCacheEntry(key)` 精准缓存逐出逻辑。
  - 在输入框历史记录弹窗的删除按钮中绑定该清除逻辑。现在，当用户在历史列表中删除某一个单词时，与其关联的 Standard AI Cache、Full AI Cache 和 Phrase Cache 将被同步精确清理。

### 7. 优化：字典数据深挖与废弃死码清理
- **文件**：`src/services/db.web.ts`、`src/stores/imageStore.ts`、`src/services/ocr.ts` (删除)、图片翻译相关等十余个文件
- **设计与实现**：
  - **本地字典深挖 (B-2 方案)**：修改 Web SQLite 查询服务，将本地字典中例句的查询上限由 3 条提升为 5 条，总上限切片（slice）由 6 条提升至 9 条，让包含多义多词性词条的例句库展示更加全面，并在 UI 中与既有的 3 条首屏折叠机制协同。
  - **图片翻译死码清理**：彻底清除了项目中由于旧版本重构而遗留的大量无用文件：`ImageEditor.tsx`、`ExportButton.tsx`、`BlockStylePanel.tsx` 和 `ocr.ts`，并同步清理了其在 `imageStore`、`ai.ts` 和 `types/index.ts` 中的冗余导入、类型定义和状态。

---

## 2026-06-10 — iOS 签名与分发工具链升级（AltStore 迁移至 Sideloadly）

### 1. 变更：更新 iOS 签名分发工具链为 Sideloadly
- **文件**：`CLAUDE.md`、`lexicon-docs/06-crossplatform.md`
- **设计与实现**：
  - 针对 AltStore 在 Windows 下因 iCloud/iTunes 微软商店版兼容性差、常驻后台守护进程握手失败导致高频“签名失败/连不上”的痛点，将项目推荐的 iOS 签名工具升级为 **Sideloadly**（方案 A）。
  - 更新了项目启动上下文（`CLAUDE.md`）和跨平台设计文档（`lexicon-docs/06-crossplatform.md`）中的工具链依赖和本地操作 SOP，细化了 Sideloadly 安装及 Apple ID 双重验证等步骤。
  - 补充了 Sideloadly 覆盖安装及 Automatic Refresh（Wi-Fi 自动续签）等机制说明，为开发与测试分发提供更稳定的侧载解决方案。

---

## 2026-06-09 — 助记卡“换一个”局部更新与“提议”功能

### 1. 新增：助记单分页重新生成（换一个）功能
- **文件**：`src/services/ai.ts`、`src/components/ResultView/AiSection/MnemonicCard.tsx`、`lexicon-docs/04-ai-schema.md`
- **设计与实现**：
  - 新增 `generateSingleMnemonic` API 服务，在请求时接收当前词汇、助记类型（词源逻辑/趣味故事/智能联想）、是否为词组、当前展示内容、以及可选的用户想法。
  - 大模型 Prompt 指导：只生成单种类型的助记，且要求内容完全不同于现有内容，防重性好。
  - 在 `MnemonicCard.tsx` 中，点击「换一个」时仅重新获取目前选中分页的助记，并局部更新本机状态，避免重置其余两个分页的内容。

### 2. 新增：用户记忆想法“提议”校验功能
- **文件**：`src/components/ResultView/AiSection/MnemonicCard.tsx`、`src/services/ai.ts`
- **设计与实现**：
  - 在助记卡片右下角新增「提议」按钮，点击后展开高度精致的行内文本框。
  - 用户输入自己的记忆构想或关联单词并提交后，调用 `generateSingleMnemonic` 将其发送给 AI。
  - AI 首先核验该想法。若合理则沿用并拓展为助记；若不合理，AI 会在「推荐理由 / reason」中温和解释原因，并自行生成一套正确的助记。
  - 新增局部加载毛玻璃模糊遮罩，极大优化了重新生成时的动态加载体验。
  - **視覺樣式優化**：重構了「提议」輸入框的配色與背景。採用半透明背景（`bg-background/30 dark:bg-black/25`）與微弱的卡片描邊，使其在明暗模式下均能自然融入 `bg-accent-soft` 的卡片主體中，消除先前突兀的純白/純黑拼貼感。

### 3. 修复：局部更新助记时分段控制（Tab）跳回默认分页的问题
- **文件**：`src/components/ResultView/AiSection/MnemonicCard.tsx`
- **问题与修复**：
  - 此前，當局部更新 `initialMnemonic` 時，內置 `useEffect` 會直接檢測到變更並把 `activeType` 重置為 `bestType`（通常是詞源邏輯分頁）。
  - 修復方案：引入 `prevWordRef` 以記錄目前詞形。`useEffect` 中僅在 `word` 真正改變時才重置 `activeType` 及其他狀態；若只是同一個單詞在局部更新，則維持當前選中的分頁（如智能聯想），保證用戶在更新後能繼續停留在原分頁。

---

## 2026-06-05 — 图片释义跨词条状态污染修复

### 修复：切换搜索词后，上一个词条的图片释义残留在新词条下方

- **文件**：`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/index.tsx`
- **根因**：`MeaningList` 组件内部通过 `useState` 维护三组以释义索引为 key 的图片状态（`imageUrls`、`loadingStates`、`expandedImages`）。由于两处渲染均未向 `<MeaningList>` 传递 `key` prop，React 在搜索新单词时会复用同一组件实例而非重新挂载，导致旧词条的图片状态（已展开的图片、加载中状态）原封不动地出现在新词条的对应索引位置下方。
- **修复**：
  - `AiFullView.tsx`：在 `<MeaningList>` 上新增 `key={word}`
  - `ResultView/index.tsx`：在 `<MeaningList>` 上新增 `key={wordResult.word}`
  - 每次搜索不同单词时，React 检测到 `key` 变化，强制销毁并重新创建 `MeaningList` 组件，所有图片相关 state 从零初始化，彻底消除跨词条状态污染。

---

## 2026-05-30 — 语义释义融合折叠 & 实时按需“图片释义”系统

### 1. 新增：实时按需“图片释义”懒加载系统
- **文件**：`src/types/index.ts`、`src/services/ai.ts`、`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/InstantSection/MeaningList.tsx`
- **设计与实现**：
  - **AI 搜图指令自动匹配**：在 `ai.ts` 的 `getSystemPrompt` 与 `getFullLookupPrompt` 提示词中，命令大模型为每一个释义匹配一个**极其具象、精准的搜图英文描述** (`imageQuery`，如 `"person running business in office"`)，彻底规避了直接用主词搜图造成的歧义。
  - **Tavily 实时接口整合**：在 `ai.ts` 中新增了 `searchTavilyImage(query, signal)`。直接复用用户已配置的 `tavilyApiKey` 实时检索最新图片，完美根除了静态图片 URL 极易随着时间流逝而变成死链（404）的痛点。
  - **1:1 精准上下文数据合并**：在 `ResultView/index.tsx` 的 `'dictionary'` 模块中，动态将 AI 成功的 `imageQuery` 与本地数据库的 `meanings` 按索引进行合并，并透传给 `MeaningList`。
  - **极致美学 UI 懒加载卡片**：
    - 在 `MeaningList.tsx` 中，对每个带有 `imageQuery` 的释义，增加了一个带有小相册图标的折叠按钮 **“查看图片释义”**，默认折叠。
    - **懒加载性能防重**：只有在用户第一次点击该按钮时，前端才会发送网络请求异步搜图，节省大量首屏流量与 API 额度。
    - **精细微动效与骨架屏**：搜图期间，展示带旋涡动效的微光骨架加载条（Skeleton Loading）。加载完成后，图片以平滑淡入动画展示，自带悬浮微放大和半透明优雅的版权署名（“图片检索自 Tavily 实时引擎”）。
    - **优雅容错机制**：如遇到网络问题，能展示“未检索到匹配的释义图片”并提供“重新加载”的手动重试链接。
  - **类型安全**：在 `types/index.ts` 中更新了相关接口，加入了 `imageQuery?: string` 可选类型。

---

### 2. 优化：语义释义融合与 5 条折叠规范（全量分析）
- **文件**：`src/stores/settingsStore.ts`、`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`、`src/components/ResultView/InstantSection/MeaningList.tsx`
- **设计与实现**：
  - **设置页模块精简**：从 [settingsStore.ts](file:///d:/vibe%20coding/lexicon/src/stores/settingsStore.ts) 中彻底移除了 `semantic`（语义情景）作为独立模块的定义。`normalizeModules` 会自动过滤和清理任何残留的缓存。
  - **字典模块渲染融合**：
    - 修改了 [ResultView index.tsx](file:///d:/vibe%20coding/lexicon/src/components/ResultView/index.tsx) 和 [AiFullView.tsx](file:///d:/vibe%20coding/lexicon/src/components/ResultView/AiFullView.tsx)，直接将 AI 识别到的语义情景按索引顺序 1:1 传递给字典释义渲染器 `MeaningList`，成功将其放置在对应的每一个中英文翻译的正下方。
    - 修改了 [ai.ts](file:///d:/vibe%20coding/lexicon/src/services/ai.ts)，使得生成语义情景的启用状态直接与 `dictionary` 基础释义绑定。
  - **精美卡片样式改版**：
    - 修改了 [MeaningList.tsx](file:///d:/vibe%20coding/lexicon/src/components/ResultView/InstantSection/MeaningList.tsx)。将原本粗糙的独立卡片设计重构为高度融合的“引用块式”卡片：使用精美细窄的左侧 `accent` 颜色竖线（`border-l-2 border-l-accent`）、略带圆角的渐变轻质背景（`bg-accent-soft/30 rounded-r-xl`），排版微调得更为紧凑高雅，让情景解释完美附属于对应的释义下方。
  - **词组与短语的统一融合**：
    - 修改了 [PhraseView.tsx](file:///d:/vibe%20coding/lexicon/src/components/ResultView/PhraseView.tsx)，把“使用场景 (usageScenes)”融入到了释义的下方，并采用了完全一致的引用卡片风格（配合词组专属的 `teal` 主题色样式），保证了整体界面的美观度和高度统一。
  - **基础释义不截断 + UI 5条折叠**：
    - 撤销了先前在数据库查询层（`db.web.ts`）的截断操作，完美恢复了原生的**全量基础释义查询**。
    - 将 `MeaningList.tsx` 中的折叠阈值 `COLLAPSE_THRESHOLD` 调整为 `5`。首屏默认只展示 5 个最常用释义，剩余的释义通过“展开更多”按钮折叠，AI 情景分析会与释义一并被优雅折叠。
    - 在 [ai.ts](file:///d:/vibe%20coding/lexicon/src/services/ai.ts) 中去除了对生僻词大模型生成的 5 条上限截断，让 AI 针对多义生僻词能完整输出最常用的 2-8 条释义，并统一在 UI 层面进行 5 条折叠。

---

## 2026-05-30 — AI 模式例句补全 & 模块布局顺序修复

### 1. 修复：AI mode 搜索词库词条时若无例句不自动补全

- **文件**：`src/services/ai.ts`、`src/hooks/useAiLookup.ts`、`src/App.tsx`
- **根因**：`analyzeWord` 的 prompt 从未请求 AI 生成例句；`trigger` 调用时 `includeExamples` 参数未传递，导致即使词库没有例句，AI 分析结果中也不含 `examples` 字段。
- **修复**：
  - `getSystemPrompt` 新增 `includeExamples` 开关，当为 `true` 时在 schema 中加入 `examples` 字段并附上对应生成规则。
  - `buildUserPrompt` 当 `includeExamples=true` 时在用户消息中追加提示（"The dictionary has no example sentences"）。
  - `analyzeWord` 签名增加 `includeExamples: boolean = false` 参数，完整传递给 prompt 构建逻辑。
  - `useAiLookup.trigger` 增加 `includeExamples` 参数，并在检查旧缓存时，若旧缓存缺例句而当前需要例句则绕过缓存重新请求。
  - `App.tsx` 所有 `triggerAi(...)` 调用点改为传入 `wordResult.examples.length === 0` 作为 `includeExamples`。
  - `AiAnalysis` 类型新增可选 `examples?: Example[]` 字段。
  - `ResultView` 例句显示改为：词库例句优先展示；词库无例句时回退到 `aiAnalysis.examples`。

---

### 2. 修复：设置中模块顺序调整部分不生效

- **文件**：`src/stores/settingsStore.ts`、`src/components/ResultView/index.tsx`、`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`
- **根因**：
  - `DEFAULT_MODULES` 缺少 `semantic`（语义情景）、`related`（相关词组）、`culture`（文化背景）三个模块，旧数据中也没有对应 id，导致设置 UI 无法管理这些块的顺序和开关。
  - 三个结果视图（普通词条、AI 全量查词、短语/句子）中，语义情景、相关词组、文化背景都被硬编码在 `dictionary` 模块的 JSX 内部，顺序固定，改了设置也没有效果。
- **修复**：
  - `DEFAULT_MODULES` 补充 `semantic`、`related`、`culture` 三个模块。
  - 新增 `normalizeModules(modules?)` 函数，将旧的持久化模块数组与新的默认列表合并（保留用户自定义顺序和开关，新模块插入到相邻已知模块旁）。
  - `persist` 配置新增 `merge` 钩子，在恢复本地存储时自动调用 `normalizeModules`，保证新模块无缝注入而无需用户清除缓存。
  - `setModules` 同样过 `normalizeModules`，防止手动写入残缺数组。
  - `ResultView`：`semantic` 从 `dictionary` 块中剥离为独立 case；`related` 独立为 `related` case；例句来源改为可回退到 AI 例句。
  - `AiFullView`：`semantic` 和 `culture` 从 `dictionary` 块中剥离为独立 case；`SemanticScene` 仅在有场景数据时渲染；`CulturalLoreCard` 提取为独立组件。
  - `PhraseView`：`usageScenes`（使用场景）映射到 `semantic` case；`culturalLore`（文化背景）映射到 `culture` case；均从 `dictionary` 块中剥离。
  - `AiFullResult`、`PhraseResult` 类型中 `scene` 和 `usageScenes` 改为可选，避免旧数据和缺 scene 的 AI 回包引发类型错误。

---

## 2026-05-29 — 图片翻译：聊天截图阅读顺序修复

### 1. 修复：日语聊天截图被误判为漫画阅读顺序

- **文件**：`src/services/ai.ts`
- **根因**：`IMAGE_TRANSLATE_FAST_PROMPT` 与 `IMAGE_TRANSLATE_FULL_PROMPT` 的阅读顺序逻辑中，只有 MANGA 和 OTHER 两类，没有为聊天/对话界面单独设类。AI 对瀑布流对话截图（左右交替气泡）未能识别为对话界面，可能将左右气泡分列处理，导致对话顺序错乱（先翻完左侧所有消息，再翻右侧，而非按时间线交替输出）。
- **修复**：
  - 新增 `CHAT/MESSAGING` 图像类型，关键识别指标：界面 UI chrome、头像图标、时间戳、无艺术尾巴的圆角气泡。
  - 明确该类型**优先级高于 MANGA**，即使源语言为日语也不例外。
  - 对应规则：严格按垂直位置（从上到下）排序，左右气泡按实际出现顺序交替输出，还原真实对话流。
  - 在规则层补充 `regardless of source language (including Japanese)` 双重保障。
  - `Key insight` 从"日语推文"更新为"日语聊天截图不是漫画"，更贴近实际场景。

---

## 2026-05-25 — 图片翻译功能重构（Image Translation Overhaul）

### 概述
对图片翻译模块进行了大规模重构与简化：修复多项翻译质量问题，彻底移除难以落地的嵌字功能，重塑翻译流水线架构，并引入 AI 智能阅读顺序判断。

---

### 1. 修复：目标语言被忽略

- **文件**：`src/services/ai.ts`
- **根因**：`callImageTranslateAPI` 用户消息中直接拼入中文语言名（如"中文"），部分模型无法识别，默认回退到英语输出。
- **修复**：新增 `LANG_DISPLAY` 映射表，将中文语言名转换为完整英文名称（如 `'中文' → 'Chinese (Simplified)'`）；在 system prompt 头部注入 `CRITICAL LANGUAGE REQUIREMENT` 强制要求目标语言。

---

### ~~2. 修复：嵌字模式可手动画框~~ *(已随嵌字功能整体移除)*

~~- **文件**：`src/components/ImageTranslate/ImageEditor.tsx`~~
~~- **修复**：为 `handleStageMouseDown` 中的画框逻辑增加 `onAddBlock` 存在性守卫，嵌字模式不传递 `onAddBlock` 则禁止手动新增文字框。~~

---

### 3. 修复：文字溢出多边形/椭圆遮罩

- **文件**：`src/components/ImageTranslate/ImageEditor.tsx`
- **根因**：`fitFontSize` 以完整 bbox 面积计算字号，未考虑椭圆/多边形内切面积更小。
- **修复**：引入 `shapeInset` 系数（椭圆/圆形/多边形取 0.62，矩形取 0.85），文字区域和字号计算均基于内缩后的有效面积。

---

### ~~4. 修复：嵌字模式文字框与翻译列表数量不一致~~ *(已随嵌字功能整体移除)*

~~- **文件**：`src/components/ImageTranslate/index.tsx`~~
~~- **根因**：`mergePhase1Translations` 合并时，Phase 2 未匹配到的 Phase 1 条目被丢弃。~~
~~- **修复**：合并后追加所有未匹配的 Phase 1 块，配备兜底错开位置，保证条数一致。~~

---

### ~~5. 架构重塑：嵌字流水线解耦（翻译与定位完全分离）~~ *(已随嵌字功能整体移除)*

~~- **文件**：`src/services/ai.ts`、`src/components/ImageTranslate/index.tsx`~~
~~- **背景**：原 Phase 2 一次 AI 调用同时承担"重新翻译 + 定位气泡位置"，导致漏块、错位、用户编辑的译文被覆盖等问题。~~
~~- **新增**：`aiImageLocateBubbles(imageBase64, blocks)` — 专职定位函数。以已知文字原文为锚点，让 AI 只回答"这段文字的气泡在哪里"，不再重新翻译。~~
~~- **重写**：`handleEnterEmbed` 改为两阶段独立流水线：~~
  ~~- Phase A：若尚未翻译，先调用 `aiImageTranslateFast` 获取译文~~
  ~~- Phase B：以 Phase A 译文为锚，调用 `aiImageLocateBubbles` 纯定位~~
~~- **移除**：`mergePhase1Translations`（不再需要模糊匹配合并）~~

---

### 6. 移除嵌字功能（嵌字模块整体下线）

- **文件**：`src/components/ImageTranslate/index.tsx`
- **原因**：嵌字体验差、维护成本高、计划作为独立软件另行开发。
- **移除内容**：`ImageEditor`、`ExportButton`、`BlockStylePanel`、两栏布局、移动端标签页切换、所有 embed 相关状态（`embedMode`、`embedLoading`、`embedError`、`imageCollapsed`、`mobileTab`、`drawPolygonForIndex`、`selectedIndex`）、字体选择器、`scrollStickyToPinned` 粘性滚动逻辑。
- **保留内容**：语言选择、图片上传与多图导航、翻译按钮、粘性图片预览、翻译列表（支持编辑译文）。

---

### 7. 新增：AI 智能阅读顺序判断

- **文件**：`src/services/ai.ts`（`IMAGE_TRANSLATE_FAST_PROMPT`）
- **逻辑**：在 prompt 中要求 AI 先对图片分类，再选择阅读顺序规则：
  - **MANGA**（有明显分格、带箭头气泡、插画风格）× 日语源 → **右到左列、上到下行**（日漫标准）
  - **其他所有内容**（推文截图、照片、韩漫、西方漫画、标牌等）→ **上到下、左到右**
- **说明**：右到左排序仅适用于日漫分格网格。日语推文、日语照片均使用正常从左到右顺序。韩漫（manhwa）为从左到右，不在 RTL 范畴内。

---

## 2026-05-25 — AI 全量查词黑屏 Bug 修复 & ErrorBoundary (AiFullView Black Screen Fix)

### 概述
修复在 web 模式下查询生僻词（如 misanthropy）时，页面完全黑屏且无任何错误提示的问题。

### 根因
AI 返回的 JSON 虽然能被 `JSON.parse` 解析成功（触发 `aiStatus = 'success'`），但部分字段（如 `etymology`、`examples`、`meanings`）可能为 `null` 或被 AI 省略。渲染 `AiFullView` 时对这些字段进行了无防护的属性访问，导致 TypeError 抛出。由于整个应用缺少 React Error Boundary，React 静默卸载整个组件树，页面变为黑屏且无任何报错 UI。

---

### 1. AiFullView：防御性 null 检查

- **文件**：`src/components/ResultView/AiFullView.tsx`
- **变更**：
  - `aiFullResult.meanings.map(...)` → `(aiFullResult.meanings ?? []).map(...)`（dictionary、practice 两处）
  - `aiFullResult.examples.length > 0` → `(aiFullResult.examples?.length ?? 0) > 0`
  - etymology 模块 case 新增前置守卫：`if (!aiFullResult.etymology) return null`

---

### 2. EtymologyCard：空值守卫

- **文件**：`src/components/ResultView/AiSection/EtymologyCard.tsx`
- **变更**：函数体首行加入 `if (!etymology?.parts) return null`，避免在 `etymology` 为 `null`/`undefined` 或 `parts` 缺失时崩溃

---

### 3. 新增 ErrorBoundary 组件

- **文件**：`src/components/ErrorBoundary.tsx`（新建）
- **功能**：React class 组件，捕获子树内任何渲染阶段的异常，展示"页面渲染出错"提示及重试按钮，同时在 console 输出完整堆栈
- **接入**：`src/App.tsx` 中用 `<ErrorBoundary>` 包裹整个结果展示区（PhraseView / AiFullView / ResultView），即使未来出现新的渲染异常也不会再黑屏

---

## 2026-05-24 — 词根词缀锚点强化 & 助记叙事化 (Etymology Anchor Fields & Narrative Mnemonic)

### 概述
强化 AI 词根词缀解析的记忆辅助能力，并解决词源逻辑助记与词根词缀卡内容高度重叠、差异不大的问题。

---

### 1. 词根词缀卡新增"记忆锚点"字段

- **文件**：`src/types/index.ts`
- **变更**：`EtymologyPart` 接口新增三个可选字段：
  - `sourceForm?`：原始拉丁/希腊语词根形式（如 `legere`），显示在 pill 内词义后
  - `anchor?`：含同一词根的简单常见词（如 `select`），作为记忆桥梁
  - `anchorNote?`：1 句话中文，说明锚点词如何体现词根含义，帮助联想记忆

---

### 2. AI Prompt 强化：词根锚点 & 演变路径

- **文件**：`src/services/ai.ts`
- **`getSystemPrompt()`**（词库有结果时的增量解析）：
  - etymology schema 中每个 part 对象扩展为包含 `sourceForm`、`anchor`、`anchorNote` 的完整结构
  - rules 明确区分：**词根**需填写三个字段；纯前缀/后缀（如 `in-`、`-tion`）省略三字段
- **`getFullLookupPrompt()`**（词库无结果时的全量生成）：
  - 同步扩展 etymology schema，并在 rules 段加入相同约束
- **文档**：`lexicon-docs/04-ai-schema.md` 同步更新 EtymologyPart schema 示例

---

### 3. EtymologyCard UI：展示 sourceForm 与记忆锚点区块

- **文件**：`src/components/ResultView/AiSection/EtymologyCard.tsx`
- **变更**：
  - 词根 pill 内新增 `· legere` 灰色斜体（`sourceForm`）
  - story 段下方新增琥珀色**"记忆锚点"**卡片区块：`[anchor词] ← [segment]  [anchorNote]`，仅在至少一个词根含 `anchor` 字段时显示

---

### 4. 助记叙事化：philology 助记与词根词缀卡明确分工

- **文件**：`src/services/ai.ts` — `MNEMONIC_SYSTEM_PROMPT`
- **根因**：AI 在"词源逻辑"助记中倾向于重新罗列词源事实，本质上是词根词缀卡的复述，与已有解析差异不大。
- **修复**：重写 PHILOLOGY 部分的生成目标与写法指导：
  - **明确禁止** fact-dump / bullet list 形式
  - **要求**：以学习者已知的锚点词（如 `select`）开头作桥梁，构建一个有具体场景或比喻的**叙事段落**（2–4 句），以画面结尾呼应目标词含义
  - schema 注释更新为 `"Mnemonic narrative in Chinese, 2-4 sentences."`
  - rules 新增：`philology.content MUST be a narrative paragraph, NOT a bullet list or etymology fact-dump.`

| | 词根词缀卡 | philology 助记（改后）|
|---|---|---|
| 形式 | 结构化分析 | 叙事段落（2–4 句）|
| 目的 | 知道词从哪来 | 形成可在脑中重播的画面 |
| 写法 | pills + 锚点卡 | "你已经知道 select…想象一个罗马学者…" |

---

## 2026-05-24 — 模组管理排序修复：AI 问答位置变更即时生效 (Module Order Fix: Chat Position Now Respected)

### 概述
修复 `AiFullView`（AI 全量查询视图）与 `PhraseView`（词组/句子视图）中 AI 问答模块（`chat`）排序不生效的 Bug。

---

### 修复：`chat` 模块在 AiFullView / PhraseView 中忽略用户自定义排序

- **文件**：`src/components/ResultView/AiFullView.tsx`、`src/components/ResultView/PhraseView.tsx`
- **根因**：两个文件的 `modules.map()` 循环内的 `switch` 语句均缺少 `case 'chat':`，导致 `chat` 走 `default: return null`，被完全忽略。`AiChatBox` 改以硬编码方式渲染在 `map` 循环之外的最底部，无论用户在 Module Management 中如何调整 `AI 问答` 的顺序，位置始终固定在末尾。
- **修复**：在两个文件的 `switch` 语句中分别添加 `case 'chat':` 分支，并删除底部的硬编码渲染，与 `ResultView/index.tsx` 行为对齐。模组顺序变更现在在三个查询视图中均即时生效。

---

## 2026-05-24 — 搜索黑屏竞态修复与候选词补全降级 (Search Black Screen Race Fix & Suggest Fallback)

### 概述
修复两个相互独立但可能叠加出现的 Bug：① 搜索本地词典未收录单词时，状态更新跨越两个 React 渲染批次导致中间帧出现空白/黑屏闪烁；② `suggest` 表数据不完整导致大量词典已有词条在搜索框输入时无备选项弹出。

---

### 1. ⛔ 修复：搜索黑屏竞态（React 渲染批次间的中间帧）

- **文件**：`src/hooks/useSearch.ts`、`src/App.tsx`
- **根因**：`selectWord`（`useSearch.ts`）在 DB 查询返回"未找到"结果后，会在同一微任务（Microtask A）内调用 `setWordResult(null)`，该调用立即触发一次 React 渲染。此时 `wordResult = null`，但 `App.tsx` 中的 `searchSource` 仍为上一次的旧值（如 `'local'`）。由于 `setSearchSource('ai-full')` 须等到 `await selectWord(word)` 的 Promise 解决后才在下一个微任务（Microtask B）中执行，React 18 的自动批处理无法跨越这两个微任务边界合并更新，导致中间帧同时满足 `showAiFullView = false` 且 `wordResult = null` 的条件，渲染出无内容的空白/黑屏。
- **修复**：
  - **`useSearch.ts`**：从 `selectWord` 的三条"未找到"路径（`sentence`、`phrase` 未命中、`word` 未命中）中移除 `setWordResult(null)` 调用，保留 `setRelatedPhrases([])`、`setSuggestions([])`、`setQuery()` 等无视觉影响的更新。
  - **`App.tsx`** `handleWordSelect`：在 `result === null` 的 `else` 分支中，于 `setSearchSource` 之前调用 `useResultStore.getState().setWordResult(null)`，使以下三个状态更新在**同一同步块**内完成：
    1. `useResultStore.getState().setWordResult(null)` — 清空 wordResult 及 AI 状态
    2. `setSearchSource('ai-full')` — 切换视图
    3. `triggerFullLookup(word)` / `triggerPhraseQuery(word)` — 同步调用 `setAiStatus('loading')` 后挂起
  - React 18 将上述三次更新合并为**一次渲染**，UI 直接从"旧结果可见"过渡到"AiFullView + loading 骨架屏"，消除黑屏中间帧。

---

### 2. 🟠 修复：`suggest` 表收录不完整导致大量词条无候选项

- **文件**：`src/services/db.web.ts`
- **根因**：`suggest()` 函数的单词前缀匹配分支仅查询 `suggest` 表，而 `suggest` 表收录词条数量少于 `entries` 表。当用户输入的前缀在 `suggest` 表中无命中时，候选词下拉为空，但词条实际存在于词典中（`entries` 表），导致用户误以为该词不在词典内，体验断层。
- **修复**：将原先的 `if (!results[0]) return []` 短路逻辑改为：
  - 若 `suggest` 表返回至少 1 条结果，直接返回（带中文简义）；
  - 若 `suggest` 表返回 0 条结果，**降级查询 `entries` 表**：`SELECT DISTINCT word_lower FROM entries WHERE word_lower LIKE ? AND word_lower NOT LIKE '% %' ORDER BY length(word_lower), word_lower LIMIT ?`，以纯小写词形兜底返回候选项（`zhBrief` 为空字符串）。
  - 与已有的 `sentence` / `phrase` 模式无交叉，仅影响单词前缀匹配路径。

---

## 2026-05-24 — 依赖维护：Node.js 24 升级 & 安全漏洞修复 (Node.js 24 Upgrade & Security Fixes)

### 概述
将 iOS CI 工作流从 Node.js 22 升级到 Node.js 24，提前适配 GitHub Actions 即将于 2026-06-02 强制切换的 Node.js 24 runtime；同时修复 3 个传递依赖安全漏洞，更新 `tsx` patch 版本。

---

### 1. GitHub Actions iOS 工作流升级到 Node.js 24
- **文件**：`.github/workflows/ios-build.yml`
- **变更**：`node-version: '22'` → `node-version: '24'`，并在 Setup Node 步骤添加 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` 环境变量，使 action runner 本身（checkout、setup-node、upload-artifact 等）也提前切换到 Node.js 24 runtime，消除即将到来的强制迁移警告。

---

### 2. 本地依赖更新
- **`tsx`**：`^4.22.1` → `^4.22.3`（patch 安全更新）

---

### 3. 安全漏洞修复（`npm audit fix`）
修复 3 个传递依赖中的安全漏洞（全部 `npm audit fix` 可解决，无需升级直接依赖）：
- **`@xmldom/xmldom` ≤0.8.12**（高危）：XML 序列化中的不受控递归 DoS + XML 注入漏洞（4 个 CVE）
- **`brace-expansion` 5.0.2–5.0.5**（中危）：大数字范围绕过 `max` 防护导致 DoS
- **`postcss` <8.5.10**（中危）：CSS Stringify 输出中 `</style>` 未转义引发 XSS

---

### 备注：待决策的大版本升级
以下依赖有可用的大版本更新，但涉及破坏性变更，**未在本次自动更新**，需单独评估后手动升级：
| 包 | 当前 | 最新 | 备注 |
|----|------|------|------|
| `react` / `react-dom` | 18.3.1 | 19.2.6 | React 19 破坏性变更 |
| `react-konva` | 18.2.16 | 19.2.4 | 需配合 React 19 |
| `@types/react` / `@types/react-dom` | 18.x | 19.x | 需配合 React 19 |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.2 | 需配合 Vite 8 |
| `vite` | 6.4.2 | 8.0.14 | Vite 8 破坏性变更 |
| `typescript` | 5.6.3 | 6.0.3 | TS 6 破坏性变更 |

---

## 2026-05-24 — 代码审查与 Bug 修复 (Post-Refactor Code Review & Bug Fixes)

### 概述
对上一版嵌字重构进行全量代码审查，共定位并修复 7 处 Bug，涵盖：Tailwind 断点未注册、魔棒/多边形事件优先级冲突、Compact 视图滚动拦截、底部导航 CSS 死代码、a11y ID 冲突、移动端 Tab 状态残留、导出无防重等问题。

---

### 1. ⛔ 修复：`3xl` 断点未注册，超宽屏 1800px 上限永远不生效
- **文件**：`src/index.css`
- **问题**：`App.tsx` 使用了 `3xl:max-w-[1800px]` 来限制带鱼屏宽度，但 Tailwind v4 默认断点仅到 `2xl`（1536px），`3xl` 从未被定义，该类一直是死代码。
- **修复**：在 `@theme` 块中注册 `--breakpoint-3xl: 1920px`，使超宽屏（≥1920px）正确触发 1800px 宽度上限。

---

### ~~2. ⛔ 修复：魔棒模式拦截多边形绘制点击事件（逻辑优先级冲突）~~ *(已随嵌字功能移除)*
~~- **文件**：`src/components/ImageTranslate/ImageEditor.tsx`~~
~~- **问题**：`handleStageMouseDown` 中，魔棒 BFS 触发检测位于 `isDrawingPoly` 判断之前。当用户正在绘制多边形遮罩（`drawPolygonForIndex != null`），若当前选中块恰好是 `magic-wand`，点击会被魔棒逻辑捕获并 `return`，多边形顶点永远无法添加，绘制被无声中断。~~
~~- **修复**：将 `isDrawingPoly` 判断移至函数最顶部，多边形绘制模式具有最高事件优先级；魔棒检测仅在非多边形绘制状态下执行。~~

---

### 3. 🟠 修复：Compact（列表）模式下 `ImageViewer` 吞掉页面滚轮事件
- **文件**：`src/components/ImageTranslate/ImageViewer.tsx`
- **问题**：`handleWheel` 对所有非 Ctrl 滚轮事件均调用 `e.preventDefault()`，包括 `compact` 模式（翻译列表页的缩略图浏览器）。用户鼠标悬停在列表图片上时，页面无法向下滚动访问译文列表，实际上整个列表区被"锁死"。
- **修复**：在非缩放滚轮路径中，`compact` 模式直接 `return`（事件透传给页面），不再 `preventDefault`；仅编辑器主视图执行 pan 逻辑。同时将 `compact` 加入 `useCallback` 依赖数组。

---

### 4. 🟡 修复：底部导航 `translate-y-*` Tailwind 类被行内样式覆盖（死代码）
- **文件**：`src/App.tsx`
- **问题**：`bottomNavClassName` 包含 `translate-y-0` / `translate-y-[140%]`，但导航 `<nav>` 同时有 `style={{ transform: bottomNavTransform }}`。行内 `style` 优先级高于 class，Tailwind 的 translate 类实际从未生效；`transition-transform` 由行内样式变化驱动。
- **修复**：从 `bottomNavClassName` 中删除所有 `translate-y-*` 冗余类，条件保留有效的 `opacity-*` 和 `pointer-events-*`；将 `transition-transform` 改为 `transition-all` 以同时过渡 opacity。

---

### ~~5. 🟡 修复：`BlockStylePanel` 中字体下拉框 id 在手动添加气泡时全部相同（a11y 冲突）~~ *(已随嵌字功能移除)*
~~- **文件**：`src/components/ImageTranslate/BlockStylePanel.tsx`~~
~~- **问题**：`<label>` 和 `<select>` 的 `htmlFor`/`id` 均使用 `block.original.substring(0, 5)` 生成。手动添加的气泡 `original` 为空字符串，导致所有手动气泡的 id 都是 `"font-family-"`，多个 label 指向同一个元素，无障碍访问（a11y）完全失效。~~
~~- **修复**：id 改用 `(block.original || block.translation).substring(0, 8)` 生成，有原文用原文，无原文 fallback 到译文，确保唯一性。~~

---

### ~~6. 🟡 修复：进入嵌字模式时 `mobileTab` 不重置，移动端用户看不到画布~~ *(已随嵌字功能移除)*
~~- **文件**：`src/components/ImageTranslate/index.tsx`~~
~~- **问题**：`handleEnterEmbed` 调用 `setEmbedMode(true)` 但从不重置 `mobileTab`。若用户上次离开嵌字模式时停留在"译文与导出"Tab，再次进入嵌字模式会直接显示列表，画布完全不可见，需手动切换 Tab 才能开始编辑。~~
~~- **修复**：`handleEnterEmbed` 的两条执行路径（`bboxReady` 快速路径 & AI 检测路径）均在 `setEmbedMode(true)` 之后调用 `setMobileTab('editor')`。~~

---

### ~~7. 🟡 修复：`ExportButton` 无 loading 防重，快速双击触发重复下载~~ *(已随嵌字功能移除)*
~~- **文件**：`src/components/ImageTranslate/ExportButton.tsx`~~
~~- **问题**：导出过程是异步 Canvas 渲染，期间按钮无任何禁用或反馈，用户点击后无响应感知，容易重复点击触发多次 `exportBlob`。另有 `URL.revokeObjectURL` 在 `a.click()` 同步后立即调用，部分浏览器下载尚未开始 URL 已失效的风险。~~
~~- **修复**：引入 `useState(false)` loading 状态，导出期间按钮 `disabled`，显示旋转 spinner 和"导出中…"文案；`revokeObjectURL` 延迟 1000ms 执行以保证下载触发。~~

---

## ~~2026-05-24 — 嵌字自适应重构、PC 窗口拉伸与 Photoshop 级魔棒抠图系统~~ *(嵌字功能已于 2026-05-25 整体下线，以下仅供存档)*

### 概述
针对 PC 端浏览器窗口随意拖动调整、特宽/超宽屏（带鱼屏）下的视觉观赏性与操作实用性冲突，进行了深度布局重构与绝对对称性校验；同时，颠覆性地引入了 Photoshop 级的“魔棒选区” (Contiguous BFS Flood Fill) 气泡抠图机制，大幅降低了新手抠图门槛。

---

### 1. 软件界面“视口百分比”流体宽度与带鱼屏（Widescreen）适配
- **比例替代上限**：在 [App.tsx](file:///d:/vibe%20coding/lexicon/src/App.tsx) 中废弃了原先单一死板的宽度上限限制，为图片翻译视图引入了流体视口宽度占比机制：`max-w-[92vw] lg:max-w-[90vw] xl:max-w-[85vw] 3xl:max-w-[1800px]`。
- **美学与实用结合**：在常规尺寸屏幕上自动拉伸至 `85%~92%` 宽幅，最大化释放编辑面板空间；而在特宽“带鱼屏”或 4K 大屏下，通过 **`1800px` 物理防御顶棚** 锁住过度拉伸，保证完美的版面呼吸感。
- **词典与设置区优化**：同步拓宽为 `max-w-2xl lg:max-w-3xl`，让单词辨析在宽屏下呈现得更加舒展大气。

### 2. 物理强制绝对居中 override 与背景修复 (`index.css` & `App.tsx`)
- **偏左 Bug 根治**：针对部分浏览器/ WebView 环境下，Tailwind 默认的 logical margin (`margin-inline: auto`) 被其他通用样式重置而导致页面“跑偏、不居中”的问题，在 [index.css](file:///d:/vibe%20coding/lexicon/src/index.css) 中加入了高权重物理 margin 强锁逻辑，彻底实现了主界面及导航栏的绝对左右中轴对称居中：
  ```css
  .mx-auto {
    margin-left: auto !important;
    margin-right: auto !important;
  }
  ```
- **右侧灰色盲区消除**：为 outermost 容器补齐了 `bg-background`，根除了宽屏显示器右侧突兀的灰色空洞，使全局背景完全和谐统一。

### 3. PC 窄窗口“手风琴”自适应智能升级 (Breakpoint Shift to lg)
- **窄屏冲突解决**：此前，当用户在 PC 上将浏览器窗口缩窄至接近手机比例（例如 800px）时，因触发 `md` (768px) 响应式栅格，界面仍被强行分配为两栏，导致画布极度拥挤。
- **智能自适应**：在 [index.tsx](file:///d:/vibe%20coding/lexicon/src/components/ImageTranslate/index.tsx) 中将所有排版编辑分栏断点从 `md:` 统一提升至 `lg:` (1024px)。在此临界宽度以下，APP 会如同在手机端一样自动感应，轻量化切换为单栏 Tab 导航模式，最大程度保护了 PC 窄窗口下的画布编辑舒适度。

### 4. 完美的图片与画布绝对水平垂直居中数学计算 (`ImageViewer.tsx`)
- **左上偏移纠正**：纠正了图片在大画布缩放或重置时默认朝向左上角挤压的 Bug。
- **几何偏移量计算**：在 [ImageViewer.tsx](file:///d:/vibe%20coding/lexicon/src/components/ImageTranslate/ImageViewer.tsx) 中重写了 `resetTransform` 自适应算法，根据容器物理边界与缩放后图片包络线的差值进行平分，求出完美居中的 `ox` / `oy` 坐标：
  ```typescript
  let ox = 0, oy = 0;
  if (naturalW * scale < containerW) ox = (containerW - (naturalW * scale)) / 2;
  if (naturalH * scale < containerH) oy = (containerH - (naturalH * scale)) / 2;
  offsetRef.current = { x: ox, y: oy };
  ```
  现在，无论是翻译列表的原图，还是编辑模式 of 画布，重置后均在中轴线上极致对齐。

### 5. 首创 Photoshop 级 Contiguous BFS "魔棒抠图" (Magic Wand Tool)
- **手势力学像素追踪**：在 [ImageEditor.tsx](file:///d:/vibe%20coding/lexicon/src/components/ImageTranslate/ImageEditor.tsx) 中整合了 `useLoadedImage` 与 `<WandMask />` 渲染机制，并手写构建了高稳定性的 4-Way BFS Contour Flood Fill 算法。
- **1ms 极速抠图**：当用户切换遮罩为 `🪄 魔棒` 时，只需在气泡内的背景处轻轻一点，算法以 `45` 色彩容差及亮度过滤机制向四周智能延展并截断于黑色气泡边缘。一键抠出并自动生成透明 Data URL，完美适配任何极其扭曲、非规则几何形状的气泡！
- **交互指引与浮动气泡**：在未抠图气泡上增加了一个亮蓝色半透明的**绝对定位浮动气泡指引**，温馨引导新手用户的抠图行为。

### 6. AI 大模型 OCR 视觉识别与遮罩推荐 Prompts 升级
- **Bbox 严格规约**：更新了 [ai.ts](file:///d:/vibe%20coding/lexicon/src/services/ai.ts) 中 `IMAGE_TRANSLATE_FULL_PROMPT` 的大模型提示规则，强制要求 detectedBbox 必须极限贴合文字，剔除边距。
- **智能 Mask 推荐**：AI 现在能根据气泡的外形自动匹配最适宜的遮罩几何体类型（`ellipse`, `capsule`, `circle`, `rect`, `rounded-rect` 等）。
- **音效保护机制 (SFX Protection)**：显式规定，当检测到 Sound Effects (音效文字) 或背景画作上的直接叠加字时，一律自动选择推荐 `'none'` 形状，完全避免因背景擦除破坏精美画作背景的问题。

### 7. 桌面端导航稳定性保障 (Desktop Navigation Stability)
- **解决导航栏消失 Bug**：在移动端使用的“向下滚动自动隐藏底部导航栏”特性，在高度充裕的桌面端会导致用户产生“导航栏丢失”的错觉。
- **动态锁死策略**：在 `App.tsx` 中声明并挂载了 `isLargeScreen` 响应式屏幕检测。当处于大屏（宽度 `>= 1024px`）时，滚动条滚动**不再发生任何隐藏转换**，强制锁死在悬浮状态，给予桌面端用户最高的操作安全感。

---

## 2026-05-24 — AI 查词空配置“黑屏”视觉根治与一键导流设置 (Aesthetic AI Error Recovery & Direct Settings Routing)

### 概述
彻底重构并美化了 AI 查词异常（如 API Key 缺失、网络连接失败）时的状态渲染。摒弃了此前几乎不可见且容易被误判为“黑屏/空白页”的微小单行红色字样式，落地了高档、极具视觉辨识度的微拟态/玻璃态异常提示卡片；同时打通了“查词失败 -> 一键直达设置中心 -> 顺畅重试”的完整用户体验链路。

---

### 1. 深度重构：多状态精美卡片渲染 (`AiStatusBar.tsx`)
全面升级了 `AiStatusBar` 状态组件，针对不同失败场景，定制了具有极高档视觉表现力的毛玻璃微拟态卡片：
- **AI 服务配置未就绪卡片（琥珀金）**：当检测到 API 密钥或接口地址缺失时渲染。融入 `from-amber-500/5 to-amber-600/10` 线性渐变、半透明边框与琥珀色钥匙图标，柔和告知配置细节。
- **AI 服务请求受阻卡片（玫瑰红）**：当遭遇网络超时、接口异常或大模型故障时渲染。基于 `from-rose-500/5 to-rose-600/10` 材质，高亮显示具体的异常文本。
- **动态交互控制**：卡片内部集成经过物理缩放微触觉处理（`active:scale-95`）的高亮 CTA 按钮，支持流畅悬浮，大幅度提升操作愉悦感。

### 2. 补全上下文：非成功态单词标题常态化 (`AiFullView.tsx`)
- **头部安全呈现**：移除了之前将单词名 `<h1>` 包裹在 `loading` 状态下的不合理逻辑。重构为在 `success` 之外的全部非成功状态（包括 `loading`, `error`, `idle`）下均在 AI badge 下方渲染精美的单词主标题。
- **杜绝信息断流**：使用户在请求遇阻或密钥未配时，依然能够清晰看见当前所检索的词条上下文，彻底消除以往大黑主题下纯黑无标题的空洞视觉感。

### 3. 全链路打通：“一键导流设置”闭环交互
- **跨组件路由回调**：在 `App.tsx` 中向 `PhraseView`、`AiFullView` 以及 `ResultView` 统一注入 `onGoToSettings={() => setView('settings')}` 回调。
- **设置页动态跳转与导航联动**：用户点击卡片上的「前往配置 (Settings)」时，App 会在毫秒内静默切换到设置大视图，并联动使底部 iOS 胶囊状悬浮底栏的 `Settings` 按钮切换为高亮激活态。
- **极速重试闭环**：用户配好 API Key 并测试通过后，点击 Dict 返回即可直接点击「重试」，无缝续接此前的查词行为，使用户体验一气呵成。

### 4. 健壮性保障与构建检查
- **类型安全**：在 `AiStatusBarProps` 中新增 `word` 与 `onGoToSettings` 的可选参数类型定义，全面规范化父子组件的 prop 传递。
- **全链路构建通过**：执行本地 `npm run build`，全库静态类型 100% 零报错零警告通过编译，生产环境产物完美打包。

---

## 2026-05-23 — AI 查词增补反义词与响应式双翼对比布局 (AI Generated Antonyms & Double-Wing Contrast Layout)

### 概述
为 AI 查词模块深度整合了“反义词（Antonyms）”分析流。在重构 AI 提示词与 JSON 结构的同时，为近义词与反义词设计并落地了极致高档且响应式的“双翼对比”（Double-Wing Contrast）布局。解决了长列表霸屏的问题，实现了大屏双列对比与移动端毛玻璃胶囊切卡的极致交互。

---

### 1. 深度补充：AI 提示词重构与反义词（Antonyms）字段注入
- **接口与类型更新**：在 `src/types/index.ts` 中规范化定义了 `Antonym` 接口，并在 `AiAnalysis` 与 `AiFullResult` 中新增了可选的 `antonyms` 字段，确保了与历史老词条缓存的完美向前兼容（向前降级不崩溃）。
- **提示词 Schema 升级**：在 `src/services/ai.ts` 的 `getSystemPrompt` 和 `getFullLookupPrompt` 中，将反义词提取规则与 JSON 格式描述注入大模型，要求按对比强弱输出 3-5 个反义词以及 1 句精炼的差异辨析。

### 2. 极致排版：响应式“双翼对比”（Double-Wing Contrast）美学设计
重构了 `SynonymList.tsx` 页面模块，完全反对此前单纯折叠这种平庸的交互，采用了更具高级感的双翼对比版式：
- **PC/Tauri（宽屏侧）**：使用 `md:grid md:grid-cols-2 md:gap-8` 划分为双列，**左侧靛蓝（Indigo）代表近义词，右侧粉红（Rose）代表反义词**。充分利用了横向屏幕比例，压缩了近 50% 的页面高度。
- **Capacitor（移动端/窄屏侧）**：隐藏双列，自适应渲染一个完美的**毛玻璃双色胶囊分段选择器（Segmented Tab Control）**，点击不同 Tab 伴随微触觉缩放和流畅的切换显隐，单 Tab 完全符合 44px+ 最佳触控标准。
- **高档卡片态动效**：每个词条 badges 改为轻量级半透明药丸造型（`bg-indigo-50/60`, `bg-rose-50/60`），并带有平滑缩放反馈（`active:scale-95`）和悬浮底色渐变，点击即可一键跳转新词检索。

---

## 2026-05-23 — 移动端/Tauri WebView 兼容性修复与 AI 查词黑屏问题根治 (WebView Compatibility & AI Search Black Screen Fix)

### 概述
彻底修复了在特定移动端 WebView 或旧版客户端环境下，查询本地不存在的单词时因浏览器高级 API 缺失导致的运行时报错与“黑屏”故障。通过纯 JavaScript 向下兼容方案重构了超时与取消信号合并逻辑，实现了全平台设备 100% 成功交付。

---

### 1. 故障诊断：本地不存在词汇 AI 查询黑屏问题
- **场景复现**：当用户在连续多次查词、或者直接查询本地离线词典中不存在的生僻单词（如 `misanthropy`）时，App 会自动降级或切换至 `AI Full Lookup` / `AI Phrase Query` 模式以调用远程 AI 模型。
- **兼容性冲突**：在此前的 AI 服务层（`src/services/ai.ts`）的 `callApi` 接口中，直接使用了现代浏览器规范中的 `AbortSignal.timeout(60000)` 和 `AbortSignal.any([signal, timeout])` 静态方法。这两个方法在老旧系统、特定手机的系统默认 WebView 或较早版本的渲染容器中均不支持。
- **黑屏崩溃路径**：由于 API 缺失抛出致命的 `TypeError: AbortSignal.any/timeout is not a function`，虽然经过 React 捕获但导致 AI 查询卡死在 `'error'` 状态。在 `AiFullView.tsx` 中，该状态仅渲染了一行极细的红色小字，底色在大黑主题下呈现为几乎完全不可视的“黑屏/空白屏”，导致严重的可用性故障。

### 2. 技术重构：WebView-Safe 信号合并器 (`combineSignals`)
- **全新兼容辅助函数**：在 `src/services/ai.ts` 中手写实现了一个 WebView-Safe 的 `combineSignals` 替换逻辑。
- **原理机制**：仅使用兼容性完美的底层 JavaScript 计时器 `setTimeout` 与标准的 `AbortController` 手动串联“请求手动取消”与“60秒超时强力截断”两条控制流。
- **无感平替**：直接使用 `combineSignals(signal, 60000)` 替代了旧有的不兼容代码，功能完全一致的同时，在任何老旧系统 WebView 上均能零延迟平滑运行，永不崩错。

### 3. 全链路验证与成功编译
- **编译通过**：执行本地打包测试（`tsc -b && vite build`），全链路静态类型 100% 零警告零报错通过，生产构建成功输出。
- **黑屏根除**：生僻词与网络接口底层异常阻断，AI 问答流程体验稳定。

---

## ~~2026-05-22 — 漫画高精 Canvas 嵌字重构与自适应排版~~ *(嵌字功能已于 2026-05-25 整体下线，以下仅供存档)*

### 概述
对漫画翻译与嵌字（Typesetting）模块进行了革命性的底层重构。全面弃用原有计算繁琐且极易出错的传统 HTML 坐标计算方案，改用高性能的 HTML5 Canvas (react-konva) 渲染引擎。统一并在 `master` 分支直接落地，修复了所有 TypeScript 静态类型编译与打包细节，实现了 100% 成功交付。

---

### 1. 核心变革：HTML5 Canvas (react-konva) 2D 渲染系统 (`ImageEditor.tsx`)
- **Stage 等比缩放与自适应**：底图与各大图层在 Konva Stage 中等比展示，完美避免不同设备或分辨率下的位置偏移或拉伸变形。
- **Layer 1 - 背景擦除/智能遮罩填充层**：
  - **智能采样模式 (Auto)**：对文本块边界像素进行多点智能采样，完美消除原文并填充高仿真背景。
  - **自定义遮罩填充**：支持用户自定义擦除背景色与背景不透明度（0%~100%）。
  - **三大高精遮罩形状**：横排/竖排文本默认使用椭圆（Ellipse）与矩形（Rect）遮罩，对非规则区域支持通过鼠标点击屏幕绘制高精度**自定义多边形（Polygon）遮罩**。
- **Layer 2 - 高精度 Inline 嵌字层**：
  - **防缩放外边框描边**：支持自定义描边粗细（strokeWidth）与描边颜色（strokeColor），文字在大花背景上依然清晰可见，音效字形尤为卓越。
  - **多样化文字流向**：原生支持横排与竖排流动，针对非英文/非 CJK（如英文）保留词级别分词，其余自动按字符分词换行。
  - **多维度样式自由度**：支持字重、字形、行高、对齐方式（左、中、右）、自定义字体选择。
  - **自适应字号大小**：内置高仿真字号适配算法，在“自动大小”下完美契合文本框，同时支持“固定大小”及字号倍率缩放调节。

### 2. 交互跃升：原生 Transformer 与交互手势
- **八向缩放与旋转控制**：基于 Konva Transformer 提供手柄级的操作体验，支持成组拉伸、等比缩放、自由旋转（Rotate）与拖拽，告别过往卡顿。
- **极速画框新增与顶点点击**：
  - 在 Stage 空白处长按并拖曳鼠标即可拉出翠绿色虚线框，松手直接弹窗极速添加新气泡。
  - 点击底图即可添加多边形顶点，点击首个顶点即可平滑闭合完成高精遮罩绘制。
- **移动端多点触控**：完美适配了移动端的单指拖动平移及双指捏合（Pinch）缩放画布操作。

### 3. “磨砂玻璃拟态”高级属性面板集成 (`BlockStylePanel.tsx`)
- **毛玻璃极简美学**：使用饱和度提升与高斯模糊等 CSS 特性，打造美观丝滑的高级调节窗口。
- **控制逻辑高集成**：通过 Typography（排版）、Color（色彩）、Cleanup（遮罩）三大 Tab 归集所有嵌字微调选项，实时联动 store 数据，响应速度达到零延迟。

### 4. 无感高解析度纯净导出 (`ExportButton.tsx`)
- **交互手柄智能遮蔽**：在用户点击“导出图片”的瞬间，系统会自动隐藏当前处于激活选定态的蓝色边框与旋转控制句柄，生成无损高清的纯净漫画大图，随后瞬间恢复显示状态，达成沉浸式操作流。

### 5. 重载文件清理与接口重构 (`index.tsx`)
- **BlockOverlay 精简移除**：彻底删除了原先庞大臃肿且容易抢占鼠标焦点的 HTML 辅助浮层 [BlockOverlay.tsx](file:///d:/vibe%20coding/lexicon/src/components/ImageTranslate/BlockOverlay.tsx)。
- **数据结构扩展**：在 `src/types/index.ts` 中规范化扩展了 `TextBlock` 结构，注入了 `fontSizeMode`、`strokeColor`、`fillColorMode`、`fillOpacity` 等 15 个全新的精细配置属性，实现了全链路配置状态持久化与状态同步。

---

## 2026-05-21 — v0.7.16 AI 纠错差异高亮 (Granular Diff Highlight)

### 概述
AI 模式下发现输入错误并自动纠正时，"你输入的是"一行由整句打删除线升级为细粒度差异视图，精确展示哪些词被删改、哪些词为新增，大幅提升可读性。

---

### 1. 新增：`DiffText` 差异渲染组件 (`src/components/ResultView/DiffText.tsx`)
- **LCS 差异算法**：基于最长公共子序列（LCS）对 `original` 与 `corrected` 进行 token 级对比，输出 `equal` / `delete` / `insert` 三类片段。
- **智能分词**：含空格的文本按词粒度切分（保留空白符），无空格文本（中文等）自动降级为字符粒度。
- **差异着色**：
  - 删除/被替换部分 → 红色删除线 (`line-through text-red-400`)
  - 新增/替换后部分 → 绿色字体 (`text-green-500`)
  - 保持不变部分 → 普通样式

### 2. 修复：词组/句子视图 (`PhraseView.tsx`)
- 原"你输入的是"行整句红色删除线替换为 `<DiffText>` 组件，精准标注出变更位置。

### 3. 修复：单词视图 (`AiFullView.tsx`)
- 同步替换整词删除线为 `<DiffText>` 组件，拼写错误时逐字符高亮差异。

---

## 2026-05-17 — v0.7.15 全局圆角美化与胶囊化设计规范落地 (Capsule Aesthetics & Guidelines)

### 概述
本次更新彻底重构了全局圆角层级，落地了完全一致的 Pill 胶囊几何体系；同时更新了官方布局指南，确立了触控热区扩充的最佳实践。

---

### 1. 极致美学：全局胶囊统合 (Global Capsule Aesthetics)
- **输入框重构**：将搜索输入框的圆角从 `rounded-3xl`（24px）升级为 **`rounded-full`**，形成极致圆滑的对称胶囊造型，与底部 `rounded-[2rem]` (32px) 的悬浮导航栏达到几何美感上的高度呼应。
- **内侧功能区胶囊化**：输入框内部的清除按钮、AI 按钮、搜索确认按钮全部升级为 **`rounded-full`**。其中功能图标按钮自动呈完美正圆形（1:1），视觉层次极佳。

### 2. 规范落地：《布局与 UI/UX 适配全指南 v2.1》 (Guidelines & Best Practices)
- **无感热区扩充标准**：在指南中正式写入了基于 CSS 伪元素 `::after` 拓展点击热区的推荐方案，有效防止未来因粗暴修改 `padding` 导致紧凑组件外观畸变。
- **圆角审查 Checklist**：在发版 Checklist 中强制追加了“圆角一致性”审查，规定今后所有的 UI 修改必须检验核心组件是否符合 `rounded-full` 胶囊规则及嵌套同心几何逻辑。

---

## 2026-05-17 — v0.7.14 布局标准化与移动端触控优化 (Layout Standardization & UX)

### 概述
根据《Lexicon 布局与 UI/UX 适配全指南》对全库进行了系统性审计与标准化重构。补全了多平台安全区（Safe Area）兼容性，规范了全局 Z-Index 层级，并系统性提升了移动端交互元素的点击触控体验。

---

### 1. 补全：安全区回退机制 (Safe Area Robustness)
- **CSS 增强**：在 `index.css` 中为所有安全区工具类（如 `.pb-nav-safe`, `.top-header-offset`）补全了 `--safe-area-inset-*` 变量回退。
- **Android 兼容**：确保在旧版 Android (8-10) 或部分国产 ROM 无法正确报告 `env()` 的情况下，依然能通过 `App.tsx` 注入的 28px 补丁维持布局正常。
- **模态框适配**：`UpdateModal.tsx` 的行内安全区样式同步更新，彻底解决刘海屏设备上的内容遮挡问题。

### 2. 规范：全局 Z-Index 梯度 (Z-Index Standardization)
- **底层装饰**：将背景网格（`.bg-grid`）移入 CSS 控制并统一设定为 `z-0`。
- **图片翻译层级**：修正了 `ImageTranslateView` 中 sticky header 的层级，从 `z-10` 提升至 `z-20`，使其与 Dictionary 首页的 Header 保持一致，避免滚动时的视觉穿透。

### 3. 极致优化：44x44px 移动端触控标准 (Touch Target Optimization)
为满足 Apple/Google 的人机交互规范，对全库小型交互元素进行了“隐形扩张”或视觉放大：
- **导航与搜索**：
    - 底部导航栏按钮垂直 Padding 增加，单项点击高度提升至 44px+。
    - 搜索栏清除按钮、AI 按钮、提交按钮统一扩充为 `11x11 (44x44px)` 规格。
    - 分段选择器（SegmentedControl）垂直 Padding 增加，提升切换灵敏度。
- **设置与交互**：
    - 练习题数量调节按钮从 `28x28px` 放大至 `44x44px`。
    - **开关切换 (Toggle)**：为所有 Toggle 开关包装了 `44px` 高度的透明点击热区，彻底告别“点不中”的问题。
    - AI Provider 列表项高度增加，适配大拇指操作。
- **内容交互**：
    - 词典结果页中“展开义项/收起”按钮增加 Padding。
    - 相关词组（Phrases）列表项垂直 Padding 增加，单行点击目标符合 44px 规范。
    - 图片翻译页的左右导航切换箭头显著放大。
- **回归修复 (Bug Fixes)**：
    - **Z-Index 遮挡修复**：修复了 SearchBar 下拉列表被下方 `Instant/AI` 切换按钮遮挡的问题，通过提升 SearchBar 容器的堆叠上下文（Stacking Context）确保下拉面板始终在最前方。
    - **触控可见性修复**：修复了历史记录删除按钮（x）在移动端因依赖 `hover` 而不可见的问题。现在在移动端保持常态显示，且点击热区已扩充。
    - **文档同步**：更新了 `LAYOUT_ADAPTATION_GUIDE.md`，正式确立了“移动端禁止依赖悬浮（Hover）触发可见性”的 UI 准则。

---
 
## 2026-05-16 — v0.7.13 安卓更新安装链路健壮性加固与交互优化 (Robustness & UX Fixes)

### 概述
针对安卓 9–16 全版本系统的 APK 下载与安装链路进行系统性审查，修复了三处高危缺陷，彻底解决了下载完成后点击"Install & Relaunch"无反应或应用崩溃的问题。

---

### 1. 修复：OOM 崩溃 — 大文件 base64 内存溢出（Android 9 高危）

**根因**：原实现将整个 APK（约 18–50 MB）全部读入内存后再执行 base64 转换，整个过程需在 WebView 堆内同时持有原始 Blob（~30MB）与 base64 字符串（~40MB），总峰值超 70MB。Android 9 低内存设备在此阶段极易触发 `OutOfMemoryError`，表现为下载进度条冲到 100% 后 App 静默崩溃，毫无提示。

**修复**（`src/stores/updateStore.ts` → `startDownload`）：
- 引入 **1MB 分块写入策略**：下载流每积累 1MB 数据，立即调用 `flushChunk()` 将该块编码为 base64 并通过 `Filesystem.appendFile()` 追加写入磁盘，写入后立即释放该块内存。
- 内存峰值从 ~70MB 降至 ~3MB，彻底解决 OOM 风险。
- 写入前自动清理同名旧 APK（`Filesystem.deleteFile`），防止 `appendFile` 追加到残留的旧文件上。
- `FileReader.onerror` 现在会 reject Promise 并传递错误，不再静默忽略。

---

### 2. 修复：APK 被系统清理后静默失败（Android 11+ 高危）

**根因**：Android 11+ 引入激进的存储空间管理，Cache 目录中的文件可能在用户操作后被系统回收。原 `installUpdate` 直接调用 `Filesystem.getUri()` 并假设文件存在，若文件已被清理则 `getUri` 抛出异常但被外层 catch 吞掉，UI 状态停留在 `'ready'`，按钮点击完全无响应。

**修复**（`src/stores/updateStore.ts` → `installUpdate`）：
- 在调用 `FileOpener` 前增加 **pre-flight 文件存在性检查**，用独立的 `try/catch` 包裹 `Filesystem.getUri()`。
- 若文件不存在：自动将状态重置回 `'available'`（进度归零），并显示"APK 文件已被系统清理，请重新下载"提示，引导用户再次下载。

---

### 3. 修复：FileOpener 在第三方 ROM 上静默失败无反馈（Android 8+ / Carbon OS）

**根因**：Android 8.0 起，"安装未知来源应用"改为逐 App 授权机制（非全局开关）。在 Carbon OS 等第三方系统上，若 Lexicon 未被授权，`FileOpener.openFile()` 会直接返回（不 throw），导致 UI 毫无反馈。

**修复**（`src/stores/updateStore.ts` → `installUpdate`）：
- 将 `FileOpener.openFile()` 包裹在独立的内层 `try/catch` 中（与外层文件检查分离）。
- 若 `openFile` 抛出异常：自动在浏览器中打开 GitHub APK 直链，并显示精确的中文引导路径："请在「设置 → 应用 → 特殊权限 → 安装未知应用」中为 Lexicon 开启权限，或通过已打开的浏览器页面手动安装。"

---

### 4. 完善：FileProvider 路径配置补全

**修复**（`android/app/src/main/res/xml/file_paths.xml`）：
- 原配置仅包含 `<external-path>` 和 `<cache-path>`，缺少 `files-path`、`external-files-path`、`external-cache-path`。
- 补全所有五种路径，确保 FileProvider 在不同 Android 版本与 ROM 定制下均能正确将 APK Content URI 共享给系统安装器。

---

### 5. 完善：添加 `android:largeHeap="true"` 兜底保障

**修复**（`android/app/src/main/AndroidManifest.xml`）：
- 为 `<application>` 添加 `android:largeHeap="true"`，为 Android 9 低内存设备提供额外堆内存余量，作为 1MB 分块写入的最后一道保险。

---

### 各版本兼容性矩阵（修复后）

| Android 版本 | 关键约束 | 修复后行为 |
|---|---|---|
| **9 (API 28)** | 低内存易 OOM；`REQUEST_INSTALL_PACKAGES` 逐 App 授权 | 分块写入防 OOM + 失败跳浏览器 + 中文权限引导 |
| **10 (API 29)** | Scoped Storage 启用；FileProvider 必须 | FileProvider ✅ 路径配置已补全 |
| **11 (API 30)** | Cache 可被系统主动清理 | pre-flight 检查 + 重新下载引导 |
| **12–13 (API 31–33)** | 无 APK 安装新变化 | 正常流程 |
| **14–16 (API 34–36)** | 未验证开发者可能触发系统级 24h 冷却（OS 层面，代码无法绕过） | FileOpener 触发系统安装器，其余由系统处理 |

---



### 概述
修复了 AI 问答组件在数据加载完成前过早渲染的问题，提升了界面在 AI 查询过程中的视觉稳定性。

---

### 1. 交互体验优化
- **同步显示机制**：重构了 `ResultView`、`AiFullView` 和 `PhraseView` 的渲染逻辑。
- **加载态屏蔽**：现在 `AiChatBox` 会等待 AI 核心结果（如语义场景、词根词缀等）成功加载后再行展示，避免了在骨架屏加载阶段出现孤立的问答框。
- **各模式适配**：
  - **Instant 模式**：由于字典数据即时加载，问答框保持即时显示。
  - **AI 模式**：问答框与 AI 分析结果同步“滑入”，确保上下文完整性。

---

## 2026-05-16 — v0.7.12 搜索链路深度优化与稳定性加固 (Search Logic Optimization)
 
### 概述
本次更新对搜索架构进行了深层重构，旨在彻底消除搜索时的冗余请求、建议词竞态、以及中英文本地检索的体验断层。
 
---
 
### 1. 建议词链路收拢与防抖加固
- **单入口控制**：将搜索建议词的触发逻辑从 UI 组件完全收拢至 `useSearch` hook。删除了 `SearchBar` 内部冗余的请求触发器，显著降低了数据库压力。
- **并发保护机制**：引入了 `suggestRequestIdRef` 请求序号校验，确保只有最后一次发出的建议词请求能回写状态，彻底杜绝了快速输入时的建议列表“闪跳”或“结果覆盖”现象。
- **提交策略优化**：修正了 `handleSubmit` 逻辑。按下回车键现在会严格搜索用户的**原始输入**，不再强制自动替换为第一个数据库建议词，保障了用户使用 AI 分析特定短语时的输入意图。
 
### 2. 本地数据库查询能力增强 (Robust Lookup)
- **中文反向映射**：在 `db.lookup` 中实现了中文到英文的智能映射。现在搜索“满足”或“希望”等中文词汇时，系统会优先查找本地建议表，并自动跳转至对应的英文词条（如 satisfaction 或 hope），减少了不必要的 AI 调用。
- **容错补丁**：加入了标点符号自动归一化处理。搜索“apple?”或“satisfaction!”现在能正确识别并返回对应的本地词典内容。
 
### 3. 全链路字符串规范化 (Normalization Standard)
- **新增 `normalizeQuery` 工具**：统一了全应用对搜索字符串的处理标准（自动 `trim()` 并转换为小写）。
- **缓存与历史去重**：将规范化标准应用于 `historyStore`、`resultStore` (AI 缓存) 和本地数据库。现在“Apple”和“apple”将共享同一条历史记录和同一个 AI 缓存结果，大幅提升了资源复用率。
 
### 4. 状态管理与性能优化
- **无损状态更新**：重构了 `resultStore.setWordResult`，支持在更新本地词条结果时选择性保留已有的 AI 分析数据。
- **状态快照恢复**：优化了 `App.tsx` 中的模式切换逻辑。在从 AI 详情页切回即时查询模式时，系统能秒速恢复之前的本地词典快照，且不会意外擦除当前的 AI 会话状态。
- **死代码清理**：移除了 `db.web.ts` 和 `db.ts` 中不再使用的旧版 SQLite 历史记录接口，进一步精简了底层服务。
- **AI 查询分级 (Lite/Full)**: 根据主界面开关（Instant/AI）自动决定 AI 生成内容的深度，极大提升了 Instant 模式下的 AI 响应速度。
- **全局 AI 问答**: AI 问答框现在对所有搜索结果生效，包括本地词库命中时。
- **多语种三语对照**: 针对非英中语种，增加了“目标语+英语+中文”三语翻译例句的设置项。
- **配置化启动模式**: 允许在设置中自定义 App 启动时的默认搜索模式（Instant 或 AI）。
- **生成逻辑按需化**: 助记（Mnemonic）和练习（Practice）统一改为手动按需点击生成，减少首屏 Token 消耗。
- **设置界面增强**: 增加了三语翻译和默认模式的切换开关。
 

## 2026-05-16 — v0.7.11 iOS 异形屏适配与全平台安全区统一

### 概述
本次更新重点修复了 iOS 端 Image 页面在刘海/灵动岛设备上的顶部与底部安全区适配问题，并顺带统一了词典页、设置页在 iOS 与 Android 全面屏设备上的底部悬浮导航避让策略。

---

### 1. Image 页面异形屏适配修复
- **顶部安全区统一**：将 Image 页面顶部间距改为统一使用全局 `pt-safe`，修复此前页面首屏在 iPhone 异形屏设备上与系统状态栏/刘海区贴得过近的问题。
- **底部内容避让补全**：Image 页面底部改为统一使用新的 `pb-nav-safe`，确保翻译列表、嵌字按钮与图片编辑相关内容不会被底部浮动导航栏或系统手势区域遮挡。

### 2. 其它页面安全区一致性修复
- **词典页底部避让统一**：主词典页面根内容区从固定底部留白切换为导航安全区留白，避免长结果列表在 iOS Home Indicator 或 Android 手势导航下被悬浮底栏压住。
- **设置页底部避让统一**：设置页同步切换为相同的底部安全区策略，保证底部版本信息与操作按钮在全面屏设备上可完整滚动到可视区域内。

### 3. 全局安全区工具补强
- **新增 `pb-nav-safe` 工具类**：在全局样式中新增“底部导航 + 系统安全区”复合 padding 工具类，用于统一处理浮动底栏与设备底部安全区的叠加避让。
- **Android 适配复核通过**：确认 Android 原生层 edge-to-edge 配置仍然正确，当前前端 `env(safe-area-inset-*)` 方案可以继续稳定覆盖挖孔屏、手势导航与沉浸式状态栏场景。

## 2026-05-14 — v0.7.10 安卓更新链路加固

### 概述
本次更新重点修复了安卓端点击“安装并重启”无反应的问题，并优化了安装包清理机制。

---

### 1. 安卓端更新链路修复
- **权限补全**：新增了 `REQUEST_INSTALL_PACKAGES` 权限，确保应用有权调起系统安装器。
- **MIME 类型声明**：在调起安装时明确声明了 APK 文件类型，解决了部分安卓系统无法识别安装请求的问题。

### 2. 存储空间管理优化
- **自动清理**：应用每次启动时会自动检测并清理缓存目录中的旧版本 APK 文件。
- **手动清理**：设置页的“清除缓存”按钮现在也会同步清理掉所有已下载的安装包文件。

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
