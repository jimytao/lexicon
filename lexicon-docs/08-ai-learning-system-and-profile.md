# lexicon-docs/08-ai-learning-system-and-profile.md

# Lexicon 智能学习系统、轻量 User Profile 与第二大脑 (Lexicon Memory) 架构规范

> **状态**：Phase 5 后端已落地；弱项看板 UI（Memory Tab / Digest）已雪藏  
> **更新日期**：2026-09-25
> **适用版本**：v0.9.25+

---

## 1. 概述与核心哲学

本文档为 Lexicon 第二大脑 (Lexicon Memory) 与轻量 AI 归纳学习系统的官方技术规范。

### 核心设计哲学：
1. **拒绝繁重系统**：不搭建复杂繁重的遗忘曲线算法、打卡机制或传统刷卡片 (Flashcards) 平台。
2. **以小博大 (高性价比诊断)**：通过 **“高价值行为提取 + 动态 Profile 蒸馏”** 诊断用户的理解缺口与语言表达薄弱点。
3. **第二大脑沉淀 (Lexicon Memory)**：将用户的搜索疑问、自定义 Notes、专属 AI 追问与 Core 解释进行本地持久化关联，形成不可替代的个人语言知识资产。
4. **证据归属优先**：教材、文章等外部英语只证明用户正在吸收什么（IN），不能证明用户会写冗长句；只有用户自己的英文表达与订正才可形成 OUT 语法 / 搭配弱点。

---

## 2. 黄金 Token 预算与三维数据摄取规范 (Tri-Source Data Capture)

为兼顾诊断的个性化深度与 API 成本控制，设定 **2,000 ~ 3,000 Tokens 黄金预算**。

### 2.1 诊断 AI 输入的三维数据源 (Diagnostic Inputs)

每次触发 Profile 增量更新时，打包发送给 AI 的数据包含：

1. **旧 Profile 状态 (`~1,000 Tokens`)**：仅发送本轮 `learningDirection` 对应的 `weaknessPatterns`、`explorationFocus` 与推荐；无方向旧数据不发送。
2. **高价值行为增量 (`~1,500 Tokens`)**，包含三类信息：
   - **[源 A: 单词搜索]**：查过的词汇及对应的 Core 意象/空间延伸标签。
   - **[源 B: 句子/表达订正]**：用户的原始输入 + AI 剖析的 **`unnaturalMindModel` (思维违和感)**（例: 传入 *My eyesight is deep* 及 *“英文不用 depth 抽象视力”* 的剖析）。
   - **[源 C: 最高价值——用户 AI 对话]**：用户在搜索过程中向 AI 发起的**追问记录 (Q&A History)**。*（因为提问处即是知识薄弱与最具兴趣之处）*

---

## 3. 轻量 User Profile 数据结构

在本地存储中维护一个精干且动态演化的 JSON：`user_profile.json`。

### 3.1 Profile JSON Schema

```typescript
export interface UserLanguageProfile {
  lastUpdated: string; // ISO 日期
  totalDiagnosticsRun: number;
  
  // 弱项与思维盲区看板 (最多保留 5~8 条 Active 弱项，借鉴 gaps.md)
  weaknessPatterns: Array<{
    id: string;
    description: string;       // 弱项描述 (例: "习惯用中文'深度'概念表达视力度数")
    sourceTrigger: string;     // 来源 (例: "句子订正: My eyesight is deep / AI 追问记录")
    track: 'vocabulary' | 'phrase_metaphor' | 'syntax_thought';
    status: 'learning' | 'mastered';
    occurrenceCount: number;  // 出现/暴露频次
    contrastExample?: string; // 错例 -> 正例
    // Direction G (2026-09-07) — 本地「热度」引擎输入：
    confidence?: number;      // 0~1，AI 估计「用户是否已改过来」。复犯降、用对升。缺省 0.2
    lastExposedAt?: string;   // ISO，最近一次触碰该弱点的事件时间。缺省 profile.lastUpdated
    learningDirection?: 'in' | 'out'; // 必填于新数据；缺省代表旧数据，隔离不注入 AI
    learnerLanguage?: 'en' | 'zh' | 'vi'; // 当前有效词典拥有的学习者身份
  }>;
  
  // 近期探索偏好与思维倾向
  recentExplorationFocus: Array<{
    category: string;          // 类别 (例: "phrasal_verbs_with_out", "emotions_in_melbourne")
    searchedItems: string[];   // 关联词汇或短语
    learningDirection?: 'in' | 'out';
    learnerLanguage?: 'en' | 'zh' | 'vi';
  }>;
  
  // AI 归纳的个性化推荐学习节点
  recommendations: Array<{
    conceptOrWord: string;     // 推荐词或概念 (例: "beyond", "across")
    reason: string;            // 推荐理由 (例: "你近期频繁追问 out 的空间延伸，推荐拓展对比 beyond")
    learningDirection?: 'in' | 'out';
    learnerLanguage?: 'en' | 'zh' | 'vi';
  }>;
}
```

---

## 4. 智能事件触发与蒸馏剪枝算法 (Event-Driven & Pruning Engine)

### 4.0 IN / OUT / Irrelevant 路由（Evidence Ownership）

`src/utils/learningDirection.ts` 的 `resolveLearningRoute(query, selectedDirection, dictionaryRoutingSettings)` 与 `src/services/dictionaryContext.ts` 的 `resolveLearnerLanguagePolicy(query, settings)` 共同构成唯一基础规则。二者都必须读取当前查询类型的 Monolingual 覆盖，不能只看 Main Dictionary：

| 有效词典 | Profile 学习者语言 | 可进入画像的查询语言 | 路由含义 |
|---|---|---|---|
| 英汉 `en-zh` | `zh` | English + 中文 | 英文与中文都服从搜索栏提交瞬间的 IN / OUT；中文 OUT 只代表表达需求 |
| 英越 `en-vi` | `vi` | English + 越南语 | 英文与越南语都服从搜索栏提交瞬间的 IN / OUT；越南语 OUT 只代表表达需求 |
| 英英 `en-en` | `en` | English only | 英文服从搜索栏 IN / OUT；不存在中文或越南语辅助语言 |
| 与有效词典无关的其他语言 / 非语言 | — | — | `irrelevant`：查询照常工作，但不入队、不诊断、不注入或显示 Profile 洞察 |

搜索栏只显示一个可切换状态，不要求用户每次先选用途。`settingsStore.defaultLearningDirection` 决定冷启动默认值，`searchStore.learningDirection` 保存下一次提交使用的会话选择。方向钮始终可点：输入中、结果已返回、辅助语言或 irrelevant 查询都不会把它锁死。提交处理器必须在第一个异步等待前冻结 `directionSnapshot` 并解析成该条查询的 `LearningRoute`；之后切换按钮只影响下一次提交，不得反改在途 Prompt、订正事件或 lookup 证据。越南语无重音文本只有在出现足够的常用功能词证据时才认定为越南语，避免法语等拉丁字母语言误入英越画像。

Profile 仍是一份 `UserLanguageProfile`，不是多本互不相识的账；每条新证据同时用 `learningDirection` 与 `learnerLanguage` 分区。这样可共享总诊断次数、更新时刻和管理入口，同时禁止 IN 材料污染 OUT 写作画像，也禁止英汉、英越、英英之间交叉注入。旧记录缺 `learnerLanguage` 时只兼容归入 `zh`，不得泄漏到 `vi` / `en`。

### 4.1 多路触发、会话聚合与崩溃恢复 (Flush Engine)

为控制 Token 成本并保证关 App 后不丢账，**入队与触发解耦**：事件先写入 `localStorage`（`lexicon-pending-profile-events`），再由统一入口 `flushPendingProfileDiagnostics` 蒸馏。

* **路径 A1（AI 追问 — 延迟聚合）**：
  - `recordAiChatEvent` **只入队**，并重置 **90s idle timer**（`CHAT_IDLE_MS`）；连续追问会不断推迟，整段会话通常只蒸馏一次。
  - **硬边界立刻 flush**（取消 idle）：换词搜索、Lookup ↔ Pure Core 切换、离开 Dictionary Tab、`pagehide` / `visibility hidden`、Settings 手动刷新。
* **路径 A2（OUT 英文句子订正 — 仍即时）**：
  - 只有 `learningDirection='out'`、原文为英文、且原文与 `correctForm` 存在实质差异时，`recordSentenceCorrectionEvent` 才写入高权重 sentence 事件并立即 flush。
  - 原样返回及纯大小写、空白、装饰性标点变化不构成错误；撇号 / 连字符等可能改变语法或词形的差异仍保留。
  - IN 英文材料与支持语言 OUT 查询降级为普通 lookup 证据，绝不由 `correctForm` 反推出用户语法弱点。
* **路径 B（查词累计，阈值 12）**：
  - 普通查词 `unprocessed_count +1`，达到 **12** 时 flush；若队列里已有未冲刷的 chat，一并带上。
* **成功才改账**：
  - 发起诊断时固定本轮事件快照；仅 AI 诊断成功后，按事件 `id` 删除该快照（`removeEventsByIds`），并把 `unprocessed_count` 重算为队列中仍存在的 lookup 数，而不是无条件归零。
  - 失败 / 杀进程：**不删 pending、不重置 count**。
* **冷启动续跑**：
  - App mount 后约 2s 调用 `resumePendingProfileDiagnostics`：pending 含 `chat` / `sentence` 则立刻 flush；**仅 lookup** 则继续等路径 B。
* **飞行中入队**：
  - 诊断进行中新事件保留在 pending；旧请求返回不能删除或清零它们。若剩余队列含高价值事件或再次达到 12 个 lookup，结束后自动 **queued re-flush**。
* **语言批次隔离**：
  - 每次快照只蒸馏同一 `learnerLanguage` 的事件；另一个词典身份的事件继续留在 pending，满足自身触发条件后再处理。
* **总开关**：`enableProfileDiagnostic === false` 时停止 enqueue / flush / resume（不清空已有 Profile）。

### 4.2 AI 诊断权重控制 (Diagnostic Weighting in Prompt)
在发送给 AI 的诊断 Prompt 规则中显式定义权重层级：
* **🔥 高权重 (High Priority)**：AI 追问记录与句子订正（代表用户最显性的思维误区与未解困惑）。
* **💡 常规权重 (Normal Priority)**：常规查词列表与查看过的 Core 意象（代表潜意识里的知识边界拓展）。

### 4.2.1 本地「热度」引擎（Direction G，2026-09-07）

纯本地、零 token。`src/utils/profileHeat.ts`：

- `recencyWeight(lastExposedAt)` → 0~1：≤3 天平台期为 1.0，之后 `exp(-(days-3)/8)` 衰减（~21 天 ≈ 0.1）。缺时间戳 → 0。
- `weaknessHeat(w)` = `(1 - clamp01(confidence ?? 0.2)) × recencyWeight(...)`。
- `weaknessTier(heat)`：`hot ≥ 0.55` / `warm ≥ 0.25` / `cool`。
- `sortActiveByHeat(profile)`：排除 `mastered`，按 heat 降序（等值稳定）。
- `hotWeaknesses(profile, now?, limit=3)`：tier === 'hot' 的前 N 条。

用途：① `ProfileModal` 按 heat 排序 + 三段分层（近期重复出现 / 仍需关注 / 近期未再出现）+ confidence 小条；② Direction A 决定往 prompt 里塞哪几条弱点、结果页 chip 何时可能出现。时间只降低提醒优先级，**没有出现绝不等于已经掌握**；`getProfile()` 读时对旧 profile 回填 `confidence`/`lastExposedAt`。

### 4.2.2 Profile 上下文注入所有 AI 出口（Direction A，2026-09-07）

`buildProfilePromptContext(variant, learningRoute, learnerLanguage)`（`src/services/profile.ts`）：

| variant | 内容 | 注入点 |
|--|--|--|
| `'full'` | 当前方向 + 当前语言按 heat 排序的 active 弱项（≤6）+ 近期探索（≤3）+ 「mentor tip」指令 | `aiPhrasePrompt.ts` 的 `queryType === 'sentence'` 分支 |
| `'compact'` | 当前方向 + 当前语言 `hotWeaknesses(≤3)` + 近期探索（≤2）+ opt-in 指令；两者均空 → `''` | `ai.ts` `getFullLookupPrompt`（单词 Lookup/Core）、`aiPhrasePrompt.ts` `buildPhrasePrompt`（词组）、`ai.ts` `askQuestion`（追问 system prompt） |

两种 variant 都排除 `mastered`，而且 Profile 只能补充标准分析，绝不能替代、缩短或删除原有 schema 字段职责。`learningRoute='irrelevant'` 直接返回空字符串。方向缺失的 legacy 弱点、探索与推荐不进入任何 prompt，等待未来有明确证据后由诊断 AI 重新建立带方向记录。

> 注入点是 **live 路径**；`aiCombinedPrompt.ts`（`buildCombinedWordPrompt` 等）自 v0.9.15 起 `@deprecated`，不在注入范围。

**`profileInsight`（结果字段）**：`AiFullResult` / `PhraseResult` 可选 `profileInsight?: string`，客户端同时保存 `profileInsightDirection?: 'in' | 'out'`。单词/词组 prompt 强指令「除非本词明确关联当前方向已列出的反复混淆，否则省略」。旧缓存没有方向元数据时不显示。

**`ProfileInsightChip`**（`src/components/ResultView/ProfileInsightChip.tsx`）：仅当结果含 `profileInsight`、方向与当前结果的提交时 `learningRoute` 快照一致、且未被 `sessionStorage` dismiss 时渲染；不能跟随之后为下一条搜索切换的按钮。兼容回退必须使用原始 `routeQuery`，不能用 AI 的 `correctForm`。`AiChatBox` 同样必须把原始 `routeQuery` 和冻结的 `learningRoute` 传给 `askQuestion` 与 `recordAiChatEvent`。

### 4.3 动态剪枝与进化机制 (Pruning & Evolution)
* **自动淘汰 (Mastered Pruning)**：只有出现多次正确使用、纠错后稳定改对等正向证据时，AI 才可把弱点标记为 `mastered` 或从 Active 列表移除；“过去一段时间未再暴露”本身不构成掌握证据。
* **信息蒸馏**：旧的具体搜索词汇被抽象为 `weaknessPatterns` 描述后自动从队列清除， Profile 体积永远保持在 ~1,000 Tokens，绝不无限膨胀。

### 4.4 设置开关与个人数据隐私管理 (Settings Control & Privacy Management)

为了保证用户拥有对数据的绝对控制权与知情权，在设置页面中增加控制面板：

1. **统一功能总开关 (`enableProfileDiagnostic`: boolean)**：
   - **功能**：控制 AI 是否继续在后台收集查词/追问行为并发送诊断 Task。
   - **逻辑解耦**：关闭开关**仅停止自动增量总结**，绝不删除、不重置已积累的 `user_profile.json`，也不影响 SQLite `user_word_memory` 中的笔记与收藏卡片。
2. **个人 Profile 管理区 (Data Management Section)**：
   - **查看当前画像 (`View Profile`)**：弹窗展示当前 Profile 的可视化卡片（展示 AI 归纳的弱项看板与探索倾向），让用户对 AI 掌握的个人情况一目了然。
   - **归纳待处理记录**：按钮显示当前 pending 数；为 0 时显示“Profile 已是最新”并禁用。手动操作只处理已有证据，不会凭空要求 AI 重写画像。
   - **重置 Profile 数据 (`Reset AI Profile`)**：危险按钮。点击后仅清空 `user_profile.json`，让 AI 重新从零开始评估你的学习状态（不影响 SQLite 词汇笔记）。
   - **清空流动搜索日志 (`Clear Search Logs`)**：危险按钮。仅清空 100 条滚动搜索历史。
3. **默认学习方向 (`defaultLearningDirection`)**：
   - 位于 Local Data / Profile 设置组，使用 IN / OUT 两选项 `ChoiceRow`，与三种 `defaultSearchMode` 完全独立。
   - 改动默认值时同步当前搜索栏方向，但每次查询前仍可在搜索栏单击覆盖。

### 4.5 诊断 Prompt 的不可越界规则

- IN 原文是外部材料：可推断词汇 / 理解缺口，不得推断用户偏爱长句、某种文风或会犯该句中的语法问题。
- 只有 OUT 英文 sentence correction 能新增 syntax / collocation 弱点；支持语言 OUT 只能形成表达需求或概念缺口。
- AI Chat 的证据主体是用户提出的问题，不是被查词条或作为上下文附带的教材段落。
- AI 返回的新 `weaknessPatterns`、`recentExplorationFocus`、`recommendations` 必须携带 `learningDirection` 与 `learnerLanguage`；混合批次中无法可靠归属的项目进入 legacy 隔离，不得猜测。

---

## 5. Lexicon Memory (个人知识库) SQLite 架构

### 5.1 明确隔离：“100 条流动日志” vs “SQLite 个人知识表”

* **100 条 Search Logs (流动日志)**：保存在 `localStorage`，满 100 条自动循环覆盖，仅用于给 Profile 引擎提供短期行为分析。
* **SQLite `user_word_memory` (永久知识表)**：只有用户**手动记录了 Notes、发起了 AI 追问对话、或主动加收藏**的词汇/句子，才会写入本表，成为永久资产。

```sql
CREATE TABLE IF NOT EXISTS user_word_memory (
    word TEXT PRIMARY KEY,
    first_searched_at TIMESTAMP,
    last_viewed_at TIMESTAMP,
    search_count INTEGER DEFAULT 1,
    user_notes TEXT,                  -- 用户个人笔记
    ai_conversations_json TEXT,       -- Lookup/Core 分桶 Q&A：`{"lookup":ChatMessage[],"core":ChatMessage[]}`；旧版纯数组视为 lookup
    saved_core_concept TEXT           -- 沉淀的核心 AI Core 解释
);
```

---

## 6. UI/UX 落地：Digest 看板（已雪藏）与词汇记忆视图

### 6.1 `AILearningDigestCard` / `MemoryView` — **SHELVED (2026-07-25)**
弱项看板 UI **暂不出现在 App 中**：
* 源码保留：`src/components/AILearningDigestCard.tsx`、`src/components/MemoryView.tsx`（文件头有 SHELVED 注释）。
* **禁止**挂到首页空态或底部第四 Tab，直至产品明确解冻。
* Profile 后台蒸馏、Settings 内 Profile 查看/重置 **继续可用**（与看板展示解耦）。

### 6.2 词汇/句子详情页：`LexiconMemoryBadge` & `UserNoteEditor`
- `LexiconMemoryBadge`：结果页顶部只读展示已有笔记 / Core 意象徽章（**不再**展示「N AI follow-ups」计数徽章；追问仍由底部 `AiChatBox` 提供，历史仍写入 `aiConversationsJson`）。
- `UserNoteEditor`：**SHELVED (2026-07-25)** — 源码保留，结果页不挂载；`user_notes` / 对话归档 / `saved_core_concept` 的 DB API **不动**（与 md 词库无关）。
- **AI 追问分轨**：UI `chatStore` 与结果缓存一致，用 `cognitiveCacheKey`（`q` / `q::core`）。Memory 表仍以 `word` 为锚，`ai_conversations_json` 内按 `lookup` / `core` 分桶，避免跨模式覆盖；Profile `chat` 事件可带 `cognitive` 归因。

---

## 7. 实施 Roadmap (Phase 5)

7.1 ✅ 创建 `src/services/profile.ts` (Profile 读写、三维数据打包与蒸馏逻辑)。  
7.2 ✅ 创建 SQLite `user_word_memory` 存储层与接口。  
7.3 ❄️ `AILearningDigestCard` / Memory Tab — **已实现后雪藏**，不进当前 App 导航。  
7.4 ❄️ `UserNoteEditor` — **已实现后雪藏**；`LexiconMemoryBadge` 仍挂载（只读）。
