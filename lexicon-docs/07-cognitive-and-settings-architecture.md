# lexicon-docs/07-cognitive-and-settings-architecture.md

# Lexicon 深度认知体系、模式 3 (Core Mode) 与设置页面重构架构规范

> **状态**：阶段 1 ~ 阶段 4 已全部实施并完成集成检验  
> **更新日期**：2026-07-25  
> **适用版本**：v0.8.0+

---

## 1. 概述与核心目标

本文档为 Lexicon 深度认知升级与设置 UI 重构的官方技术规范与实施指南。

### 核心目标：
1. **句子/表达订正升级**：从单一的语法修正，升级为**“母语者思维违和感剖析 (Why it sounds unnatural)”**，解答为什么母语者不这么表达。
2. **搜索模式 2 (Standard AI Lookup) 深度化**：
   - 释义前置展示 Core 核心意象，统领后续各个具体分项意思。
   - Chunks (短语/搭配) 模组增加**空间/逻辑意象延伸 (Spatial Metaphors)** 与解析。
   - Synonyms (近义词) 模组增加**情感色彩/褒贬 (Positive/Negative/Neutral)** 与**使用心智 (When & Why to use)**。
3. **建立搜索模式 3 (Pure Core Cognitive Mode)**：
   - 以“表达输出与使用”为导向的纯血认知模式。
   - 提供 Core 核心意象、衍生场景、词汇概念树状/网络图谱 (Word Relationship Graph)，并嵌入 AI 追问面板。
4. **设置页面 (Settings UI) 重构**：
   - 从长瀑布流重构为 **Tab 分页导航**（基础与模型 / 模组管理 / 界面与显示）。
   - 模组管理支持模式 2 与模式 3 独立 Tab 分开配置。
   - 高级设置采用手风琴面板 (Accordion) 折叠收纳，极大提升空间利用率。

---

## 2. 深度认知 AI Schema & Prompt 演进规范

对应扩展 `lexicon-docs/04-ai-schema.md` 中的 AI 输出 Schema。

### 2.1 句子/表达订正 AI Schema (Phrase/Sentence Correction)

在句子订正分析中增加 `unnatural_mind_model`：

```typescript
export interface PhraseAnalysisResult {
  isCorrect: boolean;
  correctForm?: string;
  explanation: string; // 原有基础解释
  
  // 新增：母语者底层思维剖析
  unnaturalMindModel?: {
    chineseThought: string;     // 中文思维映射 (例: "近视度数深" 习惯用空间深度抽象视力)
    nativeConcept: string;      // 英文心智映射 (例: 英语用 quality/prescription strength，不使用 depth)
    reusablePrinciple: string;  // 可复用的表达原则
  };
  
  chunks?: Array<{
    phrase: string;
    meaning: string;
  }>;
}
```

### 2.2 词汇 AI Lookup / Core Mode AI Schema (Word Analysis)

在单词分析 JSON Schema 中支持 `core_concept`、`native_nuances` 与 `spatial_extensions`：

```typescript
export interface WordAIResult {
  word: string;
  phonetic?: string;
  
  // 新增：核心意象 (Core Image)
  coreConcept?: {
    image: string;              // 核心意象描述 (例: "bring something into your control")
    explanation: string;        // 意象拆解与背景
  };
  
  // 基础释义与扩展
  meanings: Array<{
    pos: string;
    meaning: string;
    derivedFromCore?: string;   // 该意思如何从 Core 演变而来
  }>;
  
  // 升级：短语与搭配 (Chunks & Spatial Extensions)
  chunks?: Array<{
    phrase: string;
    meaning: string;
    spatialExtension?: string;  // 空间/逻辑意象延伸 (例: take off -> 掌控 + 脱离 = 飞离/突然成功)
    example?: string;
  }>;
  
  // 升级：近义词与母语者心智 (Native Nuances)
  synonyms?: Array<{
    word: string;
    meaning: string;
    tone: 'positive' | 'negative' | 'neutral' | 'informal'; // 情感色彩
    whenToUse: string;          // 母语者何时使用 (例: "slim -> 表示夸奖优雅的瘦")
  }>;
  
  // 新增：词汇概念树状图谱 (仅 Mode 3 或扩展使用)
  conceptGraph?: {
    rootCore: string;
    branches: Array<{
      category: string;         // 延伸类别 (例: "物理运动", "企业管理")
      examples: string[];       // 典型短语/例句
    }>;
  };
}
```

---

## 3. 搜索模式与组件架构设计

### 3.1 搜索模式三足鼎立

| 模式 | 名称 | 定位 | 存储/服务支持 | 核心组件 |
|---|---|---|---|---|
| **Mode 1** | Instant Mode | 本地速查，毫秒级响应，离线可用 | 本地 SQLite | `LocalDictView` |
| **Mode 2** | Standard AI Mode | 传统词典 + AI 充实解析，偏向“理解与记忆” | SQLite + AI API | `StandardAIView` + 前置 `CoreConceptCard` + 扩展 `ChunksCard` / `NuanceCard` |
| **Mode 3** | Pure Core Mode | 纯血认知搜索，偏向“如何输出使用” | AI API | `CoreCognitiveView` + `WordGraphCard` + 嵌入式 `AIChatCard` |

### 3.2 UI 组件分层规范 (src/components/ResultView/)

* **`CoreConceptCard.tsx`** [NEW]: 渲染词汇的核心意象。
* **`NuanceMindModelCard.tsx`** [NEW/MODIFY]: 渲染近义词辨析，带 `Tone Badge`（褒/贬/中性）与 `WhenToUse` 心理图景。
* **`SpatialExtensionCard.tsx`** [NEW/MODIFY]: 渲染 Chunks 的空间延伸比喻。
* **`WordGraphCard.tsx`** [NEW]: 渲染 Mode 3 专用的概念分支树/网络图。
* **`UnnaturalMindModelCard.tsx`** [NEW]: 渲染句子订正中的“母语者思维违和感”。

---

## 4. 设置页面 (Settings UI) 重构规范

### 4.1 页面导航架构

重构 `src/components/Settings/SettingsModal.tsx`（或设置视图）：

```
SettingsModal
 ├── Header (标题 + 关按钮)
 ├── TabNav (顶部导航栏)
 │    ├── Tab: 🎛️ 基础与模型 (API Key, Provider, Router)
 │    ├── Tab: 🧩 模组管理 (Module Ordering & Toggles)
 │    └── Tab: 🎨 界面与外观 (Theme, Font Size, Lang Mode)
 └── TabContent (根据当前 Tab 渲染)
```

### 4.2 模组管理 Tab 内部设计 (Module Management)

在“🧩 模组管理” Tab 内设置二级 Segment / Sub-Tabs：
- **Sub-Tab 1：模式 2 (Standard AI) 模组配置**
  - 控制 `CoreConceptCard`, `Meanings`, `ChunksCard`, `NuanceCard`, `EtymologyCard` 的顺序与显隐。
- **Sub-Tab 2：模式 3 (Pure Core) 模组配置**
  - 控制 `CoreConceptCard`, `DerivedMeanings`, `WordGraphCard`, `NativeNuances`, `AIChat` 的顺序与显隐。

### 4.3 空间利用率优化规则
- 所有高级 API 调试参数、数据库路径等低频配置项，包裹在 `<Accordion title="高级参数" defaultOpen={false}>` 中。
- 页面最大高度固定，内部可平滑滚动，消除过长瀑布流带来的视觉疲劳。

---

## 5. 分步实施计划与任务拆解 (Implementation Roadmap)

### 阶段 1：模式 2 充实与句子订正思维剖析 (Standard AI & Sentence Mind Model)
1.1 更新 `src/types/` 定义 (`PhraseAnalysisResult` & `WordAIResult`)。  
1.2 更新 `src/services/ai.ts` 的 Prompt，支持 `unnaturalMindModel`、`coreConcept`、`spatialExtension` 与 `tone`。  
1.3 升级句子纠错组件 `PhraseView.tsx`，加入“母语者思维违和感”折叠解析。  
1.4 在 `ResultView.tsx` 中在 Meanings 顶部前置 `CoreConceptCard`；为 Chunks 与 Synonyms 补充意象与褒贬 Badge。

### 阶段 2：模式 3 (Pure Core Cognitive Mode) 开发
2.1 在 `SearchStore` 中添加 `SearchMode = 'instant' | 'ai' | 'core'` 支持。  
2.2 更新搜索栏 `SearchBar.tsx` 模式切换 UI，加入第 3 种 Core 模式按钮。  
2.3 开发 `CoreCognitiveView.tsx` 及其配套 `WordGraphCard.tsx`。  
2.4 集成嵌入式 AI Chat 对话框于 Mode 3 底部。

### 阶段 3：设置页面 (Settings UI) 重构
3.1 重构 `SettingsModal.tsx` 为 3 大主 Tab 结构。  
3.2 在模组管理中实现模式 2 与模式 3 的子 Tab 分页拖拽/开关控制。  
3.3 引入 `Accordion` 折叠收纳高级选项。

### 阶段 4：系统集成与第一次全面检验 (First System Validation)
4.1 进行 TypeScript strict 类型检查与 `vite build` 验证。  
4.2 进行全流程搜词、查句、模式切换与设置修改体验验证。

*(注：Phase 5 智能 User Profile 增量总结系统将在完成本次检验后独立实施)*
