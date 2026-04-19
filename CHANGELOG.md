# CHANGELOG

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

## 2026-04-14 — 图片翻译 sticky 图片异形屏适配 v0.4.2（补丁）

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
- `lexicon-docs/06-crossplatform.md`：记录 iOS 无 Mac 构建方案
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

## 2026-04-09 — Phase 2 & 5：跨平台打包（Tauri PC + Capacitor Android）

### 新增

- **Tauri 桌面打包**（Phase 2）
  - `src-tauri/` 目录：`Cargo.toml`、`tauri.conf.json`、`lib.rs`、`main.rs`、`build.rs`
  - 应用窗口 420×720，可调整大小，最小 360×600
  - `capabilities/default.json`：Tauri v2 权限配置
  - 生成占位图标（蓝色方块，后续可替换）
  - 输出：`Lexicon_0.1.0_x64-setup.exe`（NSIS）+ `Lexicon_0.1.0_x64_en-US.msi`

- **Capacitor Android 打包**（Phase 5）
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

## 2026-04-08 — Phase 3：图片嵌字（Canvas 去原文 + 贴译文）

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

## 2026-04-08 — Phase 1：图片上传 + AI 翻译

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

- **WordHeader 词性 badge 暗黑适配**：读取 `settingsStore.darkMode`，动态切换 `badgeBg`/`badgeText`，修复 CLAUDE.md 中记录的 known issue

- **ModeToggle 暗黑适配**：非激活按钮补充 `dark:` 系列 Tailwind 类

- **AI mode 切换自动触发**（App.tsx）：从 Instant 切换到 AI mode 时，若当前有词结果且 `aiStatus === 'idle'`，自动触发 `triggerAi`；用 `prevModeRef` 防止初始渲染误触发

---

## 2026-04-07 — 项目初始化完成（Step 1-11）

### 完成内容

- **Step 1-2**：手动创建 Vite React-TS 项目结构（create-vite 不支持非交互式运行，直接写文件）
  - 安装：react 18、react-dom、zustand、sql.js、tailwindcss、@tailwindcss/vite、@types/sql.js
  - 注意：安装的是 Tailwind **v4**（非 v3），配置方式为 CSS `@import "tailwindcss"` + `@theme` block

- **Step 3**：配置 vite.config.ts（含 COOP/COEP headers for sql.js WASM）
  - 复制 sql-wasm.wasm 到 public/sql-wasm/

- **Step 4**：Tailwind v4 配置
  - 颜色 token（ai-bg/ai-text/ai-dot）通过 src/index.css `@theme` 定义

- **Step 5**：创建目录结构
  - src/components/{SearchBar,SuggestList,ResultView/{InstantSection,AiSection},Settings}
  - src/{services,stores,hooks,types}，scripts/

- **Step 6**：src/types/index.ts — 全部全局类型（Mode, SuggestItem, Meaning, Scene, Etymology, Synonym, Example, WordResult, AiAnalysis）

- **Step 7**：Zustand stores
  - searchStore（query, suggestions, mode）
  - resultStore（wordResult, aiAnalysis, aiStatus, aiCache）
  - settingsStore（aiEndpoint, aiModel, aiApiKey, historyEnabled，persist 到 localStorage）

- **Step 8**：服务层
  - db.ts — DBService 接口 + 平台选择入口
  - db.web.ts — sql.js 实现，词库未就绪时自动 fallback 到 mock 数据
  - ai.ts — 完整 system prompt + OpenAI-compatible API 调用 + AbortSignal 支持

- **Step 9**：Hooks
  - useSearch.ts — 300ms debounce 补全 + selectWord
  - useAiLookup.ts — AbortController 取消 + session cache

- **Step 10**：全部组件
  - WordHeader, MeaningList, ExampleList
  - SemanticScene, EtymologyCard, SynonymList, AiStatusBar/SkeletonBlock
  - InstantSection, AiSection, ResultView
  - SuggestList, ModeToggle, SearchBar
  - SettingsDrawer, App

- **Step 11**：TypeScript 零报错，vite build 成功（207KB JS + 15KB CSS）

---

## 2026-04-07 — Step 12：词库导入完成

### 完成内容

- **白屏修复**：`db.web.ts` 改用动态 `import('sql.js')` 避免 CJS 静态导入兼容问题
- **Step 12**：编写并执行 `scripts/mdx-to-sqlite.mjs`
  - 来源：牛津高阶英汉双解词典（第9版）OALD9.mdx（52MB）
  - 修复 js-mdict 读取该 MDX 时的 surrogate 编码问题（fixSurrogates 函数）
  - 解析 OALD9 自定义 HTML 标签（sn-g, def, chn, x-g-blk）
  - 输出：`public/lexicon.db`（31MB）
    - 52,861 词条，99,359 释义，67,683 例句，51,899 suggest 条目
  - 用时：32.7 秒，0 错误

### 注意

- `cigen_en_new.eudic`（词根词缀词典）为 Eudic 私有格式，无法解析，跳过；词源信息由 AI mode 在线生成
- 柯林斯 COBUILD MDX 暂未导入（当前词库质量已满足需求）
- `scripts/mdx-to-sqlite.mjs` 为一次性脚本，生成的 `public/lexicon.db` 提交到 git

---

## 2026-04-07 — sql.js 加载修复 + UI 功能迭代

### Bug 修复

- **sql.js 无法加载（词库实际未工作）**：
  - 根因：`optimizeDeps: { exclude: ['sql.js'] }` 阻止 Vite 做 CJS→ESM 转换，浏览器无法 import CJS 模块，所有查词 fallback 到 mock 数据
  - 修复：移除 `optimizeDeps.exclude`，让 Vite 预打包 sql.js（sql-wasm-browser.js 不内嵌 WASM，esbuild 可处理）
  - 同步：补充复制 `sql-wasm-browser.wasm` 到 `public/sql-wasm/`（浏览器 variant 需要）
  - `db.web.ts` 恢复静态 `import initSqlJs from 'sql.js'`

### 新增功能

- **Enter 键直接查词**（SearchBar）：优先取第一条补全结果，否则查输入的原词

- **Suggest 列表优化**：
  - SQL 过滤掉含空格的短语条目（`word NOT LIKE '% %'`），只显示单词
  - 排序改为 `length(word), word`（短词优先）
  - 最多返回 20 条，列表可滚动（`max-h-72 overflow-y-auto`）

- **相关词组板块**（词条结果页）：
  - `DBService` 新增 `getRelatedPhrases(word)` 方法
  - 查询以该词开头的短语条目（如 make → "make a point of sth" 等）
  - `resultStore` 新增 `relatedPhrases` 字段
  - `useSearch.selectWord` 用 `Promise.all` 并行查词条 + 短语
  - 新增 `PhrasesSection` 组件，展示在例句之前；超过 6 条折叠

- **义项/例句折叠**：
  - `MeaningList`：超过 4 条义项折叠，底部"展开更多 (N)"
  - `ExampleList`：超过 3 条例句折叠

- **深色模式**：
  - Tailwind v4 改为 class-based dark mode（`@variant dark (&:where(.dark, .dark *))`）
  - `settingsStore` 新增 `darkMode: boolean`（persist 到 localStorage）
  - App.tsx 用 `useEffect` 同步 `darkMode` → `document.documentElement.classList`
  - SettingsDrawer 新增"深色模式"开关
  - 所有组件添加 `dark:` Tailwind 类

### Store 接口变更

- `ResultStore`：新增 `relatedPhrases: SuggestItem[]`、`setRelatedPhrases`
- `SettingsStore`：新增 `darkMode: boolean`、`setDarkMode`
- `DBService`：新增 `getRelatedPhrases(word, limit?): Promise<SuggestItem[]>`

### 新增组件

- `src/components/ResultView/InstantSection/PhrasesSection.tsx`
