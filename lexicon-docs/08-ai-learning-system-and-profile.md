# lexicon-docs/08-ai-learning-system-and-profile.md

# Lexicon 智能学习系统、轻量 User Profile 与第二大脑 (Lexicon Memory) 架构规范

> **状态**：Phase 5 后端已落地；弱项看板 UI（Memory Tab / Digest）已雪藏  
> **更新日期**：2026-07-25  
> **适用版本**：v0.8.x+

---

## 1. 概述与核心哲学

本文档为 Lexicon 第二大脑 (Lexicon Memory) 与轻量 AI 归纳学习系统的官方技术规范。

### 核心设计哲学：
1. **拒绝繁重系统**：不搭建复杂繁重的遗忘曲线算法、打卡机制或传统刷卡片 (Flashcards) 平台。
2. **以小博大 (高性价比诊断)**：通过 **“高价值行为提取 + 动态 Profile 蒸馏”** 诊断用户的语言表达薄弱点与探索偏好。
3. **第二大脑沉淀 (Lexicon Memory)**：将用户的搜索疑问、自定义 Notes、专属 AI 追问与 Core 解释进行本地持久化关联，形成不可替代的个人语言知识资产。

---

## 2. 黄金 Token 预算与三维数据摄取规范 (Tri-Source Data Capture)

为兼顾诊断的个性化深度与 API 成本控制，设定 **2,000 ~ 3,000 Tokens 黄金预算**。

### 2.1 诊断 AI 输入的三维数据源 (Diagnostic Inputs)

每次触发 Profile 增量更新时，打包发送给 AI 的数据包含：

1. **旧 Profile 状态 (`~1,000 Tokens`)**：当前记录的 `weaknessPatterns` 与 `explorationFocus`。
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
  }>;
  
  // 近期探索偏好与思维倾向
  recentExplorationFocus: Array<{
    category: string;          // 类别 (例: "phrasal_verbs_with_out", "emotions_in_melbourne")
    searchedItems: string[];   // 关联词汇或短语
  }>;
  
  // AI 归纳的个性化推荐学习节点
  recommendations: Array<{
    conceptOrWord: string;     // 推荐词或概念 (例: "beyond", "across")
    reason: string;            // 推荐理由 (例: "你近期频繁追问 out 的空间延伸，推荐拓展对比 beyond")
  }>;
}
```

---

## 4. 智能事件触发与蒸馏剪枝算法 (Event-Driven & Pruning Engine)

### 4.1 双路触发与计数器重置机制 (Dual-Path Trigger with Shared Reset)

为了保证“连续追问”与“长期不追问”两种场景下 Profile 都能精准更新，设立 **共享计数器重置机制 (`unprocessed_count`)**：

* **路径 A（高价值事件即时触发）**：
  - 当用户完成了一次 **AI 追问对话** 或 **句子/表达订正** 时，判定为高价值显性困惑，**立即在后台发起 Profile 诊断更新**。
  - 触发完成后，**立即将 `unprocessed_count` 重置为 0**（重新开始计数），避免重复触发。
* **路径 B（保底累计触发，设定阈值为 12 次）**：
  - 如果用户一直进行普通查词且未发起追问，每搜索一次 `unprocessed_count +1`。
  - 当累积达到 **12 次**（在 10~15 次间平衡体验与 Token 成本）时，自动触发 Profile 诊断更新。
  - 触发完成后，同样**将 `unprocessed_count` 重置为 0**。

### 4.2 AI 诊断权重控制 (Diagnostic Weighting in Prompt)
在发送给 AI 的诊断 Prompt 规则中显式定义权重层级：
* **🔥 高权重 (High Priority)**：AI 追问记录与句子订正（代表用户最显性的思维误区与未解困惑）。
* **💡 常规权重 (Normal Priority)**：常规查词列表与查看过的 Core 意象（代表潜意识里的知识边界拓展）。

### 4.3 动态剪枝与进化机制 (Pruning & Evolution)
* **自动淘汰 (Mastered Pruning)**：当某个弱项在过去 30 天内未再暴露，且用户多次正确使用时，AI 在生成新 Profile 时将其标记为 `mastered` 或从 Active 列表中移除。
* **信息蒸馏**：旧的具体搜索词汇被抽象为 `weaknessPatterns` 描述后自动从队列清除， Profile 体积永远保持在 ~1,000 Tokens，绝不无限膨胀。

### 4.4 设置开关与个人数据隐私管理 (Settings Control & Privacy Management)

为了保证用户拥有对数据的绝对控制权与知情权，在设置页面中增加控制面板：

1. **统一功能总开关 (`enableProfileDiagnostic`: boolean)**：
   - **功能**：控制 AI 是否继续在后台收集查词/追问行为并发送诊断 Task。
   - **逻辑解耦**：关闭开关**仅停止自动增量总结**，绝不删除、不重置已积累的 `user_profile.json`，也不影响 SQLite `user_word_memory` 中的笔记与收藏卡片。
2. **个人 Profile 管理区 (Data Management Section)**：
   - **查看当前画像 (`View Profile`)**：弹窗展示当前 Profile 的可视化卡片（展示 AI 归纳的弱项看板与探索倾向），让用户对 AI 掌握的个人情况一目了然。
   - **重置 Profile 数据 (`Reset AI Profile`)**：危险按钮。点击后仅清空 `user_profile.json`，让 AI 重新从零开始评估你的学习状态（不影响 SQLite 词汇笔记）。
   - **清空流动搜索日志 (`Clear Search Logs`)**：危险按钮。仅清空 100 条滚动搜索历史。

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
