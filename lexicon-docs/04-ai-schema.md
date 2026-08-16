# 04 — AI 调用与 Prompt Schema

## 设计原则

- 词库有结果时，AI 只负责**增量解析**：语义情景、词根词缀 + 派生词、近义词辨析、课后练习
- 词库无结果时，AI 负责**全量生成**：音标、词性、释义+场景、词源、近义词、例句（`aiFullLookup`）
- 词组/句子查询由 AI 全量生成：释义、使用场景、例句、练习（`aiPhraseQuery`）
- 所有 AI 查询都返回 `correctForm` 字段用于拼写纠正；词组/句子查询额外返回 `correctionNote` 字段解释改动原因
- 释义和例句在词库有结果时始终来自本地词库（L1），AI 不替换它们
- 输出格式固定为 JSON，system prompt 严格约束，前端直接 parse
- 模型推荐：Gemini 2.0 Flash（快、便宜、质量足够）
- 练习按需生成（用户点击"生成练习"触发），评分每题独立调用

## API 调用配置

支持任何 OpenAI-compatible endpoint，包括：

| 提供商 | endpoint | 推荐模型 |
|--------|----------|----------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-4-5-20251001` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5:7b` |

## System Prompt

```
You are a professional English vocabulary analyst for Chinese native speakers.

Given an English word and its basic Chinese translation, analyze the word deeply.

Return ONLY a valid JSON object. No markdown code fences. No explanation. No preamble.

The JSON must follow this exact schema:
{
  "meanings": [
    {
      "zh": "（情景前缀）中文释义",
      "scene": {
        "label": "2-4字的情景标签",
        "description": "1-3句话，用口语化中文解释这种含义在什么情境下发生、是什么感觉、和其他含义有何区别"
      }
    }
  ],
  "etymology": {
    "parts": [
      {
        "segment": "词根或词缀（对应原词中的实际字母片段）",
        "meaning": "中文含义（来源语言）",
        "sourceForm": "（仅词根）原始拉丁/希腊语形式，e.g. legere",
        "anchor": "（仅词根）含此词根的简单常见词，e.g. select",
        "anchorNote": "（仅词根）1句话中文：此锚点词如何体现词根含义，帮助联想记忆"
      }
    ],
    "story": "1-2句话，说明字面意义如何演变成现在的含义",
    "derivedWords": [
      { "word": "派生词", "pos": "n./v./adj./adv.", "meaning": "中文含义" }
    ]
  },
  "synonyms": [
    {
      "word": "近义词",
      "distinction": "1句话，说明与主词的情感色彩、使用场景或强度差异"
    }
  ]
}

Rules:
- meanings array length must match the number of meanings provided in the user message
- scene.description must be conversational Chinese, NOT dictionary-style
- etymology.parts must cover ALL meaningful morphemes (prefix + root + suffix)
- synonyms: provide 3-5 words, ordered from closest to most distant in meaning
- If the word has only one meaning, meanings array has one item
- Never output anything outside the JSON object
```

## User Prompt 模板

```ts
function buildUserPrompt(word: string, meanings: Array<{zh: string, en: string}>): string {
  const meaningsText = meanings
    .map((m, i) => `${i + 1}. ZH: ${m.zh} | EN: ${m.en}`)
    .join('\n')

  return `Word: ${word}

Meanings from dictionary:
${meaningsText}

Analyze this word and return the JSON.`
}
```

## 期望 JSON 输出示例

```json
{
  "meanings": [
    {
      "zh": "（期望达成后的）满足感",
      "scene": {
        "label": "完成感驱动",
        "description": "你终于把一件事做完或做对了——不是别人夸你，而是自己内心的「到位了」。写完代码跑通测试，或者终于想通一个问题，那种感觉就是 satisfaction。主语通常是自己对自己的，不需要外部确认。"
      }
    },
    {
      "zh": "（需求或要求被回应后的）满意",
      "scene": {
        "label": "期望被满足",
        "description": "对方的行为或结果达到了你的预期。顾客投诉后商家处理到位，你说「I'm satisfied」——这里是你对他人行为的满意，方向是外部的。和义项1不同，这里有一个「被满足」的动作在里面。"
      }
    }
  ],
  "etymology": {
    "parts": [
      { "segment": "satis-", "meaning": "足够（拉丁语）" },
      { "segment": "-fac-", "meaning": "做、造成（拉丁语 facere）" },
      { "segment": "-tion", "meaning": "名词后缀" }
    ],
    "story": "字面义：「把某件事做到足够」。演变为「达成某种满足状态的结果」。",
    "derivedWords": [
      { "word": "satisfy", "pos": "v.", "meaning": "使满意；满足" },
      { "word": "satisfactory", "pos": "adj.", "meaning": "令人满意的" },
      { "word": "satisfying", "pos": "adj.", "meaning": "令人满足的" },
      { "word": "dissatisfaction", "pos": "n.", "meaning": "不满；不满意" }
    ]
  },
  "synonyms": [
    { "word": "contentment", "distinction": "持续平静的满足，不需要特定事件触发，更像一种背景状态而非峰值体验" },
    { "word": "fulfillment", "distinction": "更强调人生意义层面的完整感，常用于职业成就或长期目标达成" },
    { "word": "gratification", "distinction": "偏即时的感官或欲望满足，语感更强烈，有时带有「及时行乐」的色彩" },
    { "word": "pleasure", "distinction": "最宽泛的愉悦感，可以是任何令人开心的事，无需努力或等待" }
  ]
}
```

## AI 服务函数

`src/services/ai.ts` 导出以下函数：

### `analyzeWord(word, meanings, signal?)`
主词汇解析。返回 `AiAnalysis`（语义情景 + 词源 + 近义词）。

- `signal`：AbortSignal，切换词时取消上一个请求
- JSON 解析有两层 fallback：去 markdown 包裹 → regex 提取 `{...}`

### `generateExercises(word, meanings, count, signal?)`
按需生成练习场景。返回 `Exercise[]`。

- 每条 `Exercise` 只有 `scenario`（中文场景描述，在单语言模式下为简单英文场景描述）
- `count` 由 `settingsStore.maxExercises` 控制（默认 5，范围 1–10）
- JSON 解析同样有 regex array fallback

### `evaluateAnswer(word, scenario, userAnswer, signal?)`
评分单道练习。返回 `EvaluationResult`。

- `correct: boolean`
- `feedback`：中文错误说明（正确时为空，在单语言模式下为英文错误说明）
- `correction`：纠正后的句子（正确时为空）
- 语法错误（时态、介词、句型）必须标为 incorrect；轻微拼写错误可忽略

### `aiFullLookup(word, isFull?, signal?, cognitive?)`
词库缺失（或 Mode 3 全量）单词的 AI 生成。返回 `AiFullResult`。`cognitive: 'lookup' | 'core'` 决定 prompt 与缓存分轨。

- 共用：`correctForm`、`phonetic`、`pos`、`coreConcept`、`meanings`（含 scene）、`etymology`、`synonyms`、`examples` 等
- **Lookup**：理解与记忆向；**不要** `nativeMindModel` / `conceptGraph` / `wordChoiceContrast`
- **Pure Core**：必填加厚 `coreConcept`（含 `feelAnchor` / `emotionalTone`）+ `conceptGraph`；`wordChoice` 开时必填 `wordChoiceContrast`；优先级 coreConcept > 图谱 > 搭配 > 近义 > 选用对照
- **collocations 数据对象**（两模组共用 schema 父字段，设置里拆成两个可排序 id）：
  - `chunks`：**常用介词词组** only；note 必填释义并点明介词角色；可带 `spatialExtension`
  - `collocations`：**其他常用词组**（adj+N、V+N 等）；**禁止**往这里塞介词语组；note 同样必填
  - 禁止 `N/A` /「常用」空话；UI 始终可见展示
- **Lookup vs Core prompt 模组源**：`cognitive=lookup` → `settings.modules`；`cognitive=core` → `settings.coreModules`
- **Core 单词**：不拉 meanings 释义墙；优先加厚 coreConcept（feelAnchor/emotionalTone）/ conceptGraph / chunks / collocations / synonyms / wordChoiceContrast / usageScenes；旧 `nativeMindModel` 仅缓存兼容
- **搭配规则 C**：discourse particle / tag-question / 句末尾缀 / 感叹词（如 innit）若搭配只会重复 conceptGraph 句架 → `chunks`/`collocations` 返回空数组；普通实词仍正常填搭配
- **练习**：Lookup `evaluateMeaningCheck`（释义核对）；Core 既有场景造句 `evaluateAnswer`
- **conceptGraph.examples**（Core）：对象 `{ phrase, meaning, mindHint }`——短语 + 释义 + 母语心智延伸；禁止只返回裸字符串
- 适用于缩写（RAG、OOC）、非正式词汇、拼写错误等词库未收录的情况，以及 Mode 3 对词库词的全量认知视图

### `aiPhraseQuery(phrase, isFull?, signal?, cognitive?)`
词组/句子 AI 查询。返回 `PhraseResult`。`cognitive: 'lookup' | 'core'`（默认 `lookup`）决定 prompt 重心与缓存分轨。  
Prompt 实现：`src/services/aiPhrasePrompt.ts` → `buildPhrasePrompt`（按 `detectQueryType` 的 `phrase` / `sentence` 分轨）。

- 共用字段：`correctForm`、`correctionNote`、`unnaturalMindModel?`、`meaning`、`usageIntro?`、`usageScenes`、`examples` 等
- **Lookup**：词典式释义 / 订正 / 场景；`unnaturalMindModel` 仅在不地道时填写
- **Pure Core**：母语者心智教练；**必填** `feelAnchor` / `emotionalTone`；`wordChoice` 开时填 `wordChoiceContrast`；优先交际意图与违和感对比（旧 nativeMindModel 不再要求）
- `correctForm` 遵守严格的完整性约束：只做最小化纠错，绝不删减或截断原文内容；无错时与原文完全相同
- **字段职责 FIELD OWNERSHIP（关键）**
  - **短词组 (`queryType=phrase`)**：`meaning` = 1–2 句短释义；**禁止**把来源/语域/俚语地域/情景/何时用/母语者心智长文写进 `meaning`
  - **长句/段落 (`queryType=sentence`)**：`meaning` = **忠实全文翻译，不是概括**。逐句对应、句数与顺序同原文，保留每个从句/修饰语/语气词/人名/数字；禁止概括、压缩、合并、加解读；禁止自造编号或小标题（原文自带的 `1/2` 等标记原样保留）；译文长度应与原文相当。
    （旧版允许的首行【主题概括】已移除——它正是模型退化成"给个总结"的入口；同时 `Keep everything concise` 对 sentence 的 `meaning` 显式豁免）
  - 情景 / 语域提示 / 母语选用意图 → `usageIntro`（Usage Contexts 开场白）+ `usageScenes`（具体场景卡）
  - Core 感觉/情绪 → `feelAnchor` / `emotionalTone`（短句，勿写成 usageIntro）
  - 语域/文化条目 → `culturalLore`（与 usageScenes 区分）
- `correctionNote` 分类标注改动类型：能理解但不地道 / 能理解但更通畅 / 语法或搭配有误 / 无实质错误微调
- 大小写/标点等只在影响意义时才提及；无改动时省略 `correctionNote`
- 输入有语法/介词错误时，AI 分析正确形式并在 usageIntro / usageScenes 中说明差异
- Core 单词全量：`coreConcept.explanation` 停留在意象→用法分支层；**具体** when/where 交际场景写入 `usageScenes`，勿把场景长文塞进 explanation

### `askQuestion(context, history, signal?)`
AI 问答，以当前单词/词组为上下文。返回 `string`（AI 回复）。

- `context`：当前查询的单词或词组
- `history`：`ChatMessage[]`，支持多轮对话
- 回答用中文，适当穿插英文例句（单语言模式开启且查询词为英文时，自动改用简单英文进行回复）

### `testConnection(signal?)`
验证当前 Settings 配置是否可用。返回 `string`（模型回复）。

### `aiImageTranslateFast(imageBase64, sourceLang, targetLang, signal?)`
Phase 1 图片翻译（仅 OCR + 翻译，无 bbox）。返回 `TextBlock[]`。用于翻译列表视图。

### `generateMnemonic(word, signal?)`
为单词生成三种方式的记忆助记（词源逻辑、趣味故事、智能联想）。返回 `Mnemonic`。单语言模式下生成英文内容与原因，且故事使用英文 wordplay/rhyme 替代中文谐音。

### `generatePhraseMnemonic(phrase, signal?)`
为词组/短语生成三种方式的记忆助记。返回 `Mnemonic`。单语言模式下生成英文内容与原因。

### `generateSingleMnemonic(word, type, isPhrase, currentMnemonicContent?, userIdea?, signal?)`
生成或重新生成单个指定类型的助记（支持用户想法提议与校验）。返回 `MnemonicItem`。单语言模式下生成英文内容与原因，提议校验与回复同样切换为英文。

### `aiImageTranslateFull(imageBase64, sourceLang, targetLang, signal?)`（已废弃 v0.6.0）
~~Phase 2 图片翻译（OCR + 翻译 + bbox/polygon）。~~

**已废弃**：bbox 检测现由 Tesseract.js 负责。Phase 2 不再调用此函数。见 `src/services/ocr.ts`。

- 发送极短请求（`max_tokens: 10`），仅验证连通性
- 401 → "API Key 无效"，404 → "模型不存在或 Endpoint 有误"，429 → "请求过于频繁"

### `getConfig()` (内部)
从 `localStorage['lexicon-settings']`（Zustand persist 格式）读取配置，fallback 到 `.env`。
读取路径：`state.aiProvider` → `state.aiApiKeys[providerId]`。

## 配置读取说明

Settings 页面通过 `settingsStore` 持久化到 `localStorage['lexicon-settings']`，格式为：
```json
{
  "state": {
    "aiProvider": "gemini",
    "aiEndpoint": "https://...",
    "aiModel": "gemini-2.0-flash",
    "aiApiKeys": { "gemini": "AIza..." }
  }
}
```
AI 服务直接解析此格式，不再依赖独立的 `localStorage.getItem('ai_endpoint')` 等 key。

## 错误处理策略

| 错误类型 | 处理方式 |
|----------|----------|
| API key 未配置 | 显示 "请先在设置中填写 API key" 提示，跳转 Settings |
| 网络超时（>10s） | 显示 "AI 解析超时，请检查网络" |
| JSON 解析失败 | 显示 "AI 返回格式异常，请重试" + console.error 原始内容 |
| API 返回 4xx | 显示具体错误码（401 = key 无效，429 = 超频） |
| API 返回 5xx | 显示 "AI 服务暂时不可用，请稍后重试" |

所有错误都不影响 Instant（L1）内容的展示。

## 性能注意

- AI 调用是异步的，**不阻塞** L1 内容渲染
- 切换单词时取消上一个未完成的 AI 请求（用 AbortController）
- 同一个词的 AI 结果在 session 内缓存（Map，key 为 word），避免重复调用
- 推荐 max_tokens=1200，Gemini Flash 通常在 1-2 秒内返回
