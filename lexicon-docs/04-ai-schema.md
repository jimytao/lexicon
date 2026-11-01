# 04 — AI 调用与 Prompt Schema

## 2026-10-29 核验后契约

- `askQuestion` 分别携带原始提交（OUT=`learner_original`，IN=`external_material`）与 AI 订正版 / 分析（`ai_generated`）。`learner_question` 标注追问，其引述不能证明自主写作能力。富语境开关不改变来源。
- `profileInsight` 是 **可选学习联系**，可省略，无数量要求。原始返回对象 `{ kind: 'repeat'|'improved'|'related'|'extension', text, referenceId?, learnerSpan? }`：repeat/improved 需真实弱点 ID、OUT 英文原文和通过订正比对的片段；related 允许不同结构的有用类比，需同线同语言的真实弱点 / 探索 ID；extension 是无历史评价的简短扩展。AI 自选是否输出，自然语言解释保留。
- 结果类型中 `profileInsight` 仍是经门禁后的字符串；`profileInsightDirection` 与 `profileInsightVersion=4` 由代码写入。旧缓存只隐藏未经新版校验的提示，保留分析。
- 诊断本轮所有方向必须各自完整返回三个数组（weaknessPatterns / recentExplorationFocus / recommendations），结构或方向缺失即整批拒绝。提高置信度需 `improvementQuote` + `improvementEventId`，只接受对应 OUT sentence/production 中未被 AI 改动的片段；Chat 引文不算。mastered 还需代码累计两条不同原文，单句写对只支持进步。
- 程序核验来源、方向、记录与引用；语法自然性及学习价值仍由 AI 判断。完整基线 / 限制 / 验收见 `12-learner-evidence-audit.md`。

## 设计原则

- 词库有结果时，AI 只负责**增量解析**：语义情景、词根词缀 + 派生词、近义词辨析、课后练习
- 词库无结果时，AI 负责**全量生成**：音标、词性、释义+场景、词源、近义词、例句（`aiFullLookup`）
- 词组/句子查询由 AI 全量生成：释义、使用场景、例句、练习（`aiPhraseQuery`）
- 所有 AI 查询都返回 `correctForm` 字段用于拼写纠正；词组/句子查询额外返回 `correctionNote` 字段解释改动原因
- 释义和例句在词库有结果时始终来自本地词库（L1），AI 不替换它们
- 输出格式固定为 JSON，system prompt 严格约束，前端直接 parse
- 所有主动 AI 查词入口共用**条件式文化表达识别闸门**：先判断输入是否有足够证据属于俚语、网络梗、文字游戏、谐音/故意错写或地域用法；仅命中时恢复源语言社群含义并给自然目标语对应，否则普通词义/翻译流程完全不变。此规则只改变输入解释，不得覆盖 JSON schema、字段职责或原有模块内容。
- 模型选择：从服务商实时模型列表选适合查词的轻量模型，避免将历史模型 ID 当作当前可用保证。
- 练习按需生成（用户点击"生成练习"触发），评分每题独立调用

## API 调用配置

支持任何 OpenAI-compatible endpoint，包括：

2026-11-01：`aiRequest.ts` 统一所有生成入口（含 `profile.ts` 画像诊断）的请求体。OpenAI、Groq、Kimi 用 `max_completion_tokens`；其他 Chat 兼容服务保留 `max_tokens`，Perplexity Agent 使用 `max_output_tokens`。未知自定义服务按模型名给初始字段，明确的参数拒绝可触发一次兼容重试；本地别名不套 GPT 名称推断。连接测试上限 2048（含推理），画像诊断仍为 8192；普通分析通常不设上限；Anthropic 原生 Messages 按必填要求缺省 16000，Perplexity 的 Anthropic 后端缺省 8192。所有入口省略 `temperature` / `top_p` / `top_k`；思考 / 推理参数只由下文「速度优先」梯子发送，不发送 Gemini `thinking_budget`。现有 Gemini OpenAI 兼容路径继续使用，不迁移 Interactions。

`aiProviders.ts` 管理设置页 provider 与模型发现；Anthropic 原生模型列表需版本头和密钥头、按游标完整分页；生成（含画像诊断）全部走原生 Messages（`aiAnthropic.ts`），因官方兼容层忽略 `reasoning_effort`、不支持 prompt 缓存。支持查询的服务商实时请求模型，失败明确展示错误；不支持发现的服务商显示带官方来源的目录。`aiTransport.ts` 为查询、模型发现和后台诊断共用传输，扩展走 SW 代理，其余平台保持现有 fetch。各 provider 的模型和 key 独立保存；切换到尚未配置的 provider 时须选择模型，禁止继承上一家的模型或构建环境密钥。

参数依据：[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[Claude OpenAI compatibility](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk)、[Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)、[Gemini 参数弃用说明](https://ai.google.dev/gemini-api/docs/troubleshooting)。

| 提供商 | endpoint | 推荐模型 |
|--------|----------|----------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | 当前可用 Flash / Flash Lite |
| Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-4-5-20251001` |
| OpenAI | `https://api.openai.com/v1` | `gpt-6-luna`（以账号列表为准） |
| 本地 Ollama | `http://localhost:11434/v1` | 本机已安装模型（自定义 Key 可留空） |

### 2026-11-01 全 Provider 复核

模型列表的「完整」以服务商公布的接口及账号返回为边界；本轮核对官方 API 契约并用模拟请求回归，未用用户密钥逐一做付费推理。列表不是配额、权限或图片能力的保证。

| Provider | 模型发现 / 调用结论 | 官方依据 |
|---|---|---|
| OpenAI | `/models` 全列表；过滤明确非对话用途家族；Chat 的限长字段为 `max_completion_tokens` | [Models](https://developers.openai.com/api/reference/resources/models/methods/list) |
| Gemini | 原生 `/v1beta/models` 全分页，保留 `generateContent`；生成沿用兼容接口、使用模型默认思考 | [Models](https://ai.google.dev/api/models) |
| Anthropic | 原生 `/models`、`has_more` + `after_id` 全分页；生成使用原生 Messages | [Models](https://platform.claude.com/docs/en/api/models/list) |
| DeepSeek | 标准 `/models`，无已公布分页；Chat 保留 `max_tokens` | [Models](https://api-docs.deepseek.com/api/list-models/) |
| Mistral | `/models` 同时接受数组与 `data` 包装；排除 archived / 不支持 completion_chat 的条目 | [Models](https://docs.mistral.ai/api/endpoint/models) |
| Groq | 标准 `/models`，排除 inactive / Whisper / TTS；限长改为 `max_completion_tokens` | [API](https://console.groq.com/docs/api-reference) |
| Together | 官方默认基地址改为 `https://api.together.ai/v1`；接受数组与包装列表 | [Compatibility](https://docs.together.ai/docs/inference/openai-compatibility) |
| OpenRouter | 默认完整 `/models`；按输出模态 / endpoints 排除非对话与 batch-only，保留未知模型 | [Models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) |
| xAI | 官方 `/language-models`、`models[]`，包含文本模型与别名；兼容 Chat 仍受支持但已是 legacy | [Models](https://docs.x.ai/developers/rest-api-reference/inference/models) |
| Moonshot / Kimi | 标准 `/models`；限长改为 `max_completion_tokens`；新模型多轮需真实 reasoning 历史 | [Models](https://platform.kimi.com/docs/api/list-models)、[Thinking](https://platform.kimi.ai/docs/guide/use-thinking-models) |
| SiliconFlow | `/models?sub_type=chat`；保留 `max_tokens`，不猜测图片 / thinking 能力 | [Models](https://api-docs.siliconflow.cn/docs/api/models-get) |
| 智谱 GLM | 未找到官方 Models 列表契约；使用 26 项官方文本 / 视觉 Chat 目录，带来源与核对日期，允许手填 | [Chat](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)、[Model overview](https://docs.bigmodel.cn/cn/guide/start/model-overview) |
| 零一万物 Yi | 官方平台公告 2026-09-03 停止公众 API；禁用内置入口与官方端点调用，旧配置仍保留 | [停服公告](https://platform.lingyiwanwu.com/) |
| Perplexity | 旧 Sonar 已 legacy；改用 `/v1/models` 实时 Agent 目录与 `/v1/agent` 调用；旧 ID 需重新选择 | [Compatibility](https://docs.perplexity.ai/docs/agent-api/openai-compatibility)、[Schema](https://docs.perplexity.ai/openapi.json) |
| Custom | OpenAI 兼容 `/models`；支持数组 / data / models、同源 next 链接或游标；本地服务可无 Key；无接口时明确手填 | [Ollama](https://docs.ollama.com/api/openai-compatibility)、[LM Studio](https://lmstudio.ai/docs/developer/openai-compat/models) |

`aiConnection.ts` 规范化基础地址并按已知官方 host 识别协议；未知自定义 ID 不套内置模型名称过滤。通用发现不能保证所有私有协议；分页错误或后续页失败拒绝整份结果，不把首页当完整列表。自定义限长字段仅在明确 HTTP 400 且同时提到两种字段时重试一次，不重试鉴权 / 配额 / 网络失败。

`aiPerplexity.ts` 把现行 Agent 请求（必填 `type: message`，图片 `input_image`）及 typed output 归一化到既有消费者的 `choices` 结构。`anthropic/*` 未传输出上限时用 8192；显式上限优先。工具为空且 `tool_choice: none`，不额外引入 provider 端搜索 / 工具，仍由 App 的联网设置控制外部检索。拒绝、失败、空文本不伪装成功，截断保留 length 信号。旧 Sonar ID 明确报需刷新模型，不自动映射到不同费用的模型。

Kimi：`ChatMessage` 可选保存 `reasoningContent / aiProvider / aiModel`，仅同 Moonshot provider + model 回传 `reasoning_content` 原文；不在页面显示或进入 learner evidence。K3 / K2.7-code 历史缺少匹配 reasoning 时，将不兼容前缀作为标明来源的 quoted transcript 传入，不伪造思考。`askQuestion` 仍返回字符串，新增可选 metadata 回调给 UI 持久化。

### 前台速度优先策略与等待点（2026-11-01）

官方默认值并不相等：GPT-6 Luna 默认 medium reasoning，Gemini 3.1 Flash-Lite 默认 minimal，Haiku 4.5 默认不启用扩展思考，而 Haiku 5.5 默认 adaptive thinking + medium effort。这是参数事实，不能代替同一查询的真实测速。[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Gemini](https://ai.google.dev/gemini-api/docs/gemini-3)、[Haiku](https://platform.claude.com/docs/en/models/haiku-5-5/overview)。

**速度优先梯子（`aiSpeed.ts`）**：设置 `aiSpeedFirst`（默认开）时，所有前台请求（查词、翻译、追问、测试连接）按 provider + 型号取一组「最低思考档位」补丁依次尝试；`purpose: 'diagnostic'`（Profile 归纳）或开关关闭时不发送任何覆盖。服务端以 400 / 422 且错误正文点名该补丁字段时退一档，成功或退档结果按 `host|model` 记入 `localStorage`（`lexicon.aiSpeedStep.v1`），下次直接从可用档位开始；梯子走完即不发覆盖。无关的 400（如图片错误）、鉴权、配额、5xx 不退档。设置页用同一 `describeSpeedPolicy()` 显示：已降档 / 默认不思考 / 无已核实参数。

各家档位（2026-11-01 由子代理逐家核对官方文档；文档未写明处以退档兜底）：

| Provider | 补丁（依次） | 依据要点 |
|---|---|---|
| OpenAI | `reasoning_effort` none → minimal → low；gpt-6-astra / gpt-6.1-sol 直接 low；gpt-3/4、chatgpt-* 不发 | 不支持的值返回 400 |
| Gemini（兼容层） | 2.5 Flash 系 `none`；Pro / 3.8 Flash / Gemini 4 `low`；其余（3 / 3.6 Flash、Flash-Lite）`minimal` | 兼容层**静默忽略**不支持的值，无法靠退档，只能按型号直给 |
| Anthropic（原生） | Haiku 5.5 / Opus 5 / Sonnet 5 / 未知新族：`thinking: disabled` + `effort: low`；Sonnet 5.5：`thinking: between_tools` + low（`disabled` 会 400）；Opus 5.5 / Fable / Mythos：仅 `effort: low`（不可关思考）；Claude 3 / 4.x：默认不思考，不发 | 兼容层忽略 `reasoning_effort` |
| OpenRouter | `reasoning.effort` none → minimal → low | 强制推理模型拒绝 none |
| Groq | `reasoning_effort` none → low | qwen3 支持 none，gpt-oss 最低 low；越界 400 |
| xAI | `reasoning_effort` none → low | grok-4.3 可 none；4.5+ 不可关（默认 high） |
| DeepSeek | `thinking: disabled` → `reasoning_effort: low` | 默认思考开、high |
| Kimi | K3 / K3.1：`reasoning_effort: low`（不可关，默认 max）；k2.7-code：不发；其余 `thinking: disabled` | K3 仍思考，追问 reasoning 回放逻辑不变 |
| 智谱 GLM | GLM-5.3：`reasoning_effort: low`；glm-4-flash*：不发；其余 `thinking: disabled` → low | |
| SiliconFlow | `enable_thinking: false` | |
| Together | `reasoning: {enabled: false}` → `reasoning_effort: low` | |
| Mistral | `reasoning_effort` none → minimal → low | 各型号支持子集不同 |
| Perplexity Agent | `reasoning.effort` minimal → low | |
| Custom | 本机端点 `reasoning_effort: none`（Ollama 文档：不支持时静默回落）；远程中转按型号名族（gpt-5+/o 系、gemini、qwen3、kimi、glm、deepseek、gpt-oss）套上表 | |

**Anthropic 原生与缓存**：`api.anthropic.com` 上所有型号（含诊断）走 `requestAnthropicMessages`，响应归一化回 `choices`，不展示思考块，`stop_reason: max_tokens` 映射 length。system 第一块打 `cache_control: ephemeral`（最低可缓存前缀 Haiku 5.5 / Sonnet 5.5 等 512 token，Haiku 4.5 为 4096，不足时静默不缓存）。

**Prompt 前缀稳定**：`getFullLookupPrompt` 与 `buildPhrasePromptParts` 返回 `{ stable, volatile }`：网页检索结果与 RESOLVED TARGET 锚点放在 `volatile`（system 末尾），固定 schema / 规则 / 画像段落在前。`callApi` 经 `systemMessage()` 组成两段 text；兼容服务端拼回字符串（OpenAI 自动前缀缓存 ≥1024 token 受益），Anthropic 只缓存 stable 段。`buildPhrasePrompt` 仍返回拼接字符串供测试与旧调用。

**其他 provider 的缓存**（2026-11-01 子代理核对官方文档；查词 stable 前缀实测约 1.9K–2.9K token）：
- `api.openai.com` 与 `openrouter.ai`：附 `prompt_cache_key = lexicon-<stable 段 FNV-1a 8 位 hex>`，同一模板（含设置 / 画像变体）共用一个 key，把同前缀请求路由到同一缓存；只发给这两个官方 host，中转可能拒绝未知字段。官方建议每 key 约 15 RPM 以内，单用户不会超。OpenAI 自动缓存门槛 1,024 token。
- OpenRouter 上的 `anthropic/*`：system 首段加 `cache_control: ephemeral`，per-query 尾段留在其后；`google/*`：OpenRouter 文档要求动态内容不在被标记的消息里，故尾段移到下一条 user 消息开头。其他 OpenRouter 模型照常拼字符串（OpenAI / DeepSeek / Grok / Moonshot 等自动缓存）。
- 自动缓存、无需改动：DeepSeek（默认开启）、Kimi（自动，无管理接口）、Groq 仅 gpt-oss 系列、Gemini 2.5 隐式（门槛 2,048）。
- 不做：Gemini 3.x / 4 隐式门槛 4,096，前缀不够；显式 `cachedContents` 需原生接口建缓存、按小时计存储、设置一变前缀就变，Gemini 4 不支持。xAI 的 `x-grok-conv-id` 头文档未说明浏览器 CORS，未经实测不发。缓存对 2–3K 前缀主要是省输入费用，延迟收益远小于降思考档。

**追问流式**：`askQuestion` 经 `streamChatCompletion` 以 SSE 读取（`aiStream.ts`：OpenAI 兼容 `delta.content` / Kimi `reasoning_content`，Anthropic `content_block_delta`），`AiChatBox` 逐段渲染，完成后仍以完整回复入库。扩展的 SW 代理与 Perplexity Agent 不支持流，自动退回一次性回复；中转忽略 `stream` 返回普通 JSON 时也兼容。

本轮性能排查确认：普通 combined 路径早已将 Lookup / Core 拆为两半并行，每半独立提交，旧 `aiCombinedLookup` mega-JSON 已弃用。缓存外英文单词 / 词组 / 句子另有非阻塞短预览；中文 word 反查的意义锚点仍串行以统一候选。启用的网页检索仍在两半生成之前等待。查词两半仍须完整 JSON 返回后才提交（只有追问是流式）；输出量会影响完成时间，不能把连接测试的一词 OK 当作真实查词 benchmark。Profile 归纳网络调用不在前台 await 链上；Harness 是本地来源与结构验收，不应作为删减目标。

预览展示修复：App 继续把 pending 半结果标记为 loading，三个结果视图通过 `shouldShowAiPreview` 只读展示已规范化的词义 / 译文；后台 pending、缓存、完整模块与交互、来源门禁均按原协议。旧 generation / 旧词 / Instant 不得提交预览。此改动缩短首次可读内容的等待，不改变完整响应的模型生成耗时，也不等于实现流式输出。

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

## 学习者母语（Native Language）契约

**一处决定，处处读取。** 所有面向学习者的 Prompt 的解释语言只由一条链路决定，任何 Prompt 构造函数都不得自行判断「是中文还是越南语」：

1. `resolveDictionaryContext(query, settings)`（`src/services/dictionaryContext.ts`）：当前查询类型的 Monolingual 开关 **优先于** Main Dictionary → 得到 `explanationLanguage: 'zh' | 'vi' | 'en'`（单语言已折叠为 `'en'`，因此不再单独传 `isMono`）。
2. `getNativeLanguage(code)` / `resolveNativeLanguage(query, settings)`（`src/services/nativeLanguage.ts`）：从注册表 `NATIVE_LANGUAGES` 取 `NativeLanguageSpec`（`name`、`audience`、`transferLabel`、`supportLanguage`、`dictionaryTarget`、`soundAlikeHint` 等）。
3. 每个 Prompt 的字段说明都是**语言中立的英文模板**，用 `${spec.name}` 插入语言名（如 `1-3 sentences in ${L}`）；不再有 `isMono ? 英文 : 中文` 的双份描述。
4. 每个 Prompt **末尾**统一追加 `buildNativeLanguageContract(spec)`：所有解释性文字必须用 `spec.name`；只有英文词条/表达本身、被引用的英文片段（如 `原文 -> 改正` 两侧）、英文例句、schema 枚举值保留英文；旧字段名 `zh` 填 `spec.name`。英英模式则为 English only + CEFR B1–B2。
5. 输入方向（母语输入 / 英文输入 / 第三语言输入）统一由 `buildInputDirectionRule(spec, lang)` 生成。

**新增一种语言**：在 `NATIVE_LANGUAGES` 加一条，并在 `dictionaryContext.ts` 的 `MAIN_DICTIONARY_LANGUAGE` 映射对应主词典即可，Prompt 代码无需改动。`nativeLanguage.test.ts` 锁定：所有构造函数以同一份契约结尾、vi/en Prompt 不含任何汉字、zh Prompt 不出现 Vietnamese、Prompt 源码中不得再出现 `isMono` / `explanationLanguage === 'vi'` 之类的语言分支。

> 例外：图片翻译（`aiImageTranslate*`）的目标语言由用户在嵌字页单独选择，不走此契约。

## AI 服务函数

`src/services/ai.ts` 导出以下函数：

### `analyzeWord(word, meanings, signal?)`
主词汇解析。返回 `AiAnalysis`（语义情景 + 词源 + 近义词）。

- `signal`：AbortSignal，切换词时取消上一个请求
- JSON 解析有两层 fallback：去 markdown 包裹 → regex 提取 `{...}`

### `generateExercises(word, meanings, count, signal?)`
按需生成练习场景。返回 `Exercise[]`。

- 每条 `Exercise` 只有 `scenario`（用学习者母语 `spec.name` 写的场景描述；英英模式为简单英文）
- `count` 由 `settingsStore.maxExercises` 控制（默认 5，范围 1–10）
- JSON 解析同样有 regex array fallback

### `evaluateAnswer(word, scenario, userAnswer, signal?)`
评分单道练习。返回 `EvaluationResult`。

- `correct: boolean`
- `feedback`：用学习者母语写的错误说明（正确时为空）
- `correction`：纠正后的句子（正确时为空）
- 语法错误（时态、介词、句型）必须标为 incorrect；轻微拼写错误可忽略

### Stage-1 意义锚点与文化表达识别

`resolveQuerySkeleton(query, queryType, explanationLanguage, signal?)` 是 Lookup / Core 双半请求共享的快速消歧入口。中文单词输入会等待该锚点后再并行生成两半，其他输入可把骨架作为非阻塞预览。

- `buildCultureAwareInputRule()` 同时注入 Stage-1、单词全量与词组/句子 Prompt，避免第一阶段把谐音梗或故意错写按字面锁错、后续两半又被错误锚点约束。
- 识别必须有上下文或语言证据；普通输入明确继续原有 lexical / translation analysis，不得默认按 slang 处理。
- 中文文化表达的 `correctForm` 可为最自然的英文单词或短表达；`senses` 保留候选义与差异。普通词仍返回普通英文 headword。
- 闸门只负责确定“输入实际指什么”；`meaning`、`usageIntro` / `usageScenes`、`culturalLore`、`feelAnchor` / `emotionalTone` 继续遵守各自字段职责。

### `aiFullLookup(word, isFull?, signal?, cognitive?)`
词库缺失（或 Mode 3 全量）单词的 AI 生成。返回 `AiFullResult`。`cognitive: 'lookup' | 'core'` 决定 prompt 与缓存分轨。

- AI 与本地 DB 共用 `resolveDictionaryContext(query, settings)`：当前查询类型的 Monolingual 开关优先，输出与词典均为英语；否则英汉→中文、英越→越南语、英英→英语。`resolveLearnerLanguagePolicy(query, settings)` 在同一份有效词典结果上进一步确定学习者身份：英汉=`zh`，英越=`vi`，英英=`en` 且没有第二辅助语言。AI 直接读取已 hydration 的实时 settings store，避免刚切换后继续使用旧持久化配置。
- `aiFullLookup` / `aiPhraseQuery` 的内部 options 可携带提交瞬间的 `learningRoute`。UI 在发起搜索前冻结它，后续切换 IN / OUT 不得让在途请求重新读取可变方向；未显式传入时才兼容回退到当前 store。

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
- **`profileInsight?` / `profileInsightDirection?` / `profileInsightVersion?`（可选）**：AI 可选择回顾、结构联系或一句延伸，无合适内容就省略。`getFullLookupPrompt` 使用 `buildProfilePromptContext('compact', learningRoute, learnerLanguage)`，最多注入同方向同语言 3 条热弱点与 2 条近期探索方向；这些信息只能作为可选补充，不能替代或缩短标准分析。历史联系须有真实 referenceId，普通 extension 无需历史；历史搜索字符串本身不能证明词义。解析后由代码写实际方向与版本 4；缓存保留旧分析，但隐藏无 v4 标记的气泡。

### `aiPhraseQuery(phrase, isFull?, signal?, cognitive?)`
词组/句子 AI 查询。返回 `PhraseResult`。`cognitive: 'lookup' | 'core'`（默认 `lookup`）决定 prompt 重心与缓存分轨。  
Prompt 实现：`src/services/aiPhrasePrompt.ts` → `buildPhrasePrompt`（按 `detectQueryType` 的 `phrase` / `sentence` 分轨）。

- 共用字段：`correctForm`、`correctionNote`、`unnaturalMindModel?`、`meaning`、`usageIntro?`、`usageScenes`、`examples` 等
- **Lookup**：词典式释义 / 订正 / 场景；`unnaturalMindModel` 仅在不地道时填写
- **Pure Core**：母语者心智教练；**必填** `feelAnchor` / `emotionalTone`；`wordChoice` 开时填 `wordChoiceContrast`；优先交际意图与违和感对比（旧 nativeMindModel 不再要求）
- `correctForm` 遵守严格的完整性约束：只做最小化纠错，绝不删减或截断原文内容；无错时与原文完全相同
- Profile 只把 OUT 英文原文与 `correctForm` 的**实质差异**视为订正证据：原样返回、纯大小写 / 空白 / 装饰性标点变化不形成弱点；撇号、连字符等可能改变语法或词形的差异保留。
- `unnaturalMindModel.chineseThought` 是为兼容旧缓存保留的字段名，实际职责是“源语言迁移思维”：英汉可分析中文迁移，英越可分析越南语迁移，英英不得臆造中文或越南语迁移。
- **字段职责 FIELD OWNERSHIP（关键）**
  - **短词组 (`queryType=phrase`)**：`meaning` = 1–2 句短释义；**禁止**把来源/语域/俚语地域/情景/何时用/母语者心智长文写进 `meaning`
  - **长句/段落 (`queryType=sentence`)**：`meaning` = **忠实全文翻译，不是概括**。逐句对应、句数与顺序同原文，保留每个从句/修饰语/语气词/人名/数字；禁止概括、压缩、合并、加解读；禁止自造编号或小标题（原文自带的 `1/2` 等标记原样保留）；译文长度应与原文相当。
    （旧版允许的首行【主题概括】已移除——它正是模型退化成"给个总结"的入口；同时 `Keep everything concise` 对 sentence 的 `meaning` 显式豁免）
  - 情景 / 语域提示 / 母语选用意图 → `usageIntro`（Usage Contexts 开场白）+ `usageScenes`（具体场景卡）
  - Core 感觉/情绪 → `feelAnchor` / `emotionalTone`（短句，勿写成 usageIntro）
  - 语域/文化条目 → `culturalLore`（与 usageScenes 区分）
- `correctionNote`：多处改动必须逐条 `• <英文原片段> -> <英文改正片段>：<用母语写的原因>`，只有两侧引用片段保留英文。模型内部按「能理解但不地道 / 能理解但更通畅 / 语法或搭配有误 / 无实质错误微调」判断改动类型，但**不输出**这些英文分类标签
- 大小写/标点等只在影响意义时才提及；无改动时省略 `correctionNote`
- 输入有语法/介词错误时，AI 分析正确形式并在 usageIntro / usageScenes 中说明差异
- Core 单词全量：`coreConcept.explanation` 停留在意象→用法分支层；**具体** when/where 交际场景写入 `usageScenes`，勿把场景长文塞进 explanation
- **`profileInsight?` / `profileInsightDirection?` / `profileInsightVersion?`（可选）**：同 `aiFullLookup`。`buildPhrasePrompt` 对 `queryType='phrase'` 注入同方向、同学习者语言的 `'compact'`，对 `'sentence'` 注入 `'full'`；full 最多包含 6 条 active 弱点与 3 条探索方向，mastered 一律排除；`learningRoute='irrelevant'` 时完全不注入 Profile。
- **来源标签（Harness）**：`learningRoute !== 'irrelevant'` 时，User Prompt 中的输入由代码包成 `<learner_original>`（OUT）或 `<external_material>`（IN），System Prompt 末尾追加 `PROVENANCE_LEGEND`。AI 返回的 `profileInsight` 为 `{ kind: 'repeat' | 'improved' | 'related' | 'extension', learnerSpan?, referenceId?, text }`；只有 OUT 且输入为英文时 schema 才提供 `repeat` / `improved`。解析后由 `gateProfileInsight` 核对原文、`correctForm`、实际学习记录与常见类别冲突，不通过即丢弃（规则见 `08` §4.2.2）。

### `askQuestion(context, history, signal?, richContext?, routeQuery?, learningRoute?, correctionContext?)`
AI 问答，以当前单词/词组为上下文。返回 `string`（AI 回复）。`routeQuery` 必须传当前结果对应的**原始查询**，不能用 AI 修正后的 `context` 重新猜语言；`learningRoute` 传该结果提交时冻结的路线，避免用户为下一条搜索切换按钮后反改当前问答。system prompt 据此拼入同方向同语言的 compact Profile；第三语言或无相关证据时静默。

- `context`：当前查询的单词或词组
- `history`：`ChatMessage[]`，支持多轮对话
- `routeQuery`：当前卡片的原始搜索文本；缺省时为兼容旧调用回退到 `context`
- `learningRoute`：当前结果的提交时 IN / OUT / irrelevant 快照；缺省时才兼容回退到当前 store
- `correctionContext`：页面已展示的订正信息（最小改正「原文 → 改正」、为什么这么改、地道表达、选词理由、思维违和感剖析），由 `buildChatCorrectionContext()`（`src/utils/chatCorrectionContext.ts`）生成；**与富语境开关无关，始终发送**，保证用户能追问 AI 自己的改动且回答与页面一致。目前由 `PhraseView` 传入；单词页的改正只有 `correctForm`，已由 study context 覆盖
- `irrelevant` 路线不打标签，但 `context` 与 `routeQuery` 不同时仍附上用户原始输入
- 来源标签：路线非 `irrelevant` 时，「正在学习」的文本按方向标为 `<learner_original>` / `<external_material>`，`correctionContext` 与 `richContext`（页面上已展示的 AI 分析）标为 `<ai_generated>`，并追加 `PROVENANCE_LEGEND`
- 回答语言由有效词典决定（见「学习者母语契约」）：用 `spec.name` 回答并穿插英文例句；英英仅用清晰英语且不假设任何迁移。

### `testConnection(signal?)`
验证当前 Settings 配置是否可用。返回 `string`（模型回复）。

### `aiImageTranslateFast(imageBase64, sourceLang, targetLang, signal?)`
Phase 1 图片翻译（仅 OCR + 翻译，无 bbox）。返回 `TextBlock[]`。用于翻译列表视图。

### `generateMnemonic(word, signal?)`
为单词生成三种方式的记忆助记（词源逻辑、趣味故事、智能联想）。返回 `Mnemonic`。内容与原因均用学习者母语；趣味故事的谐音来源取 `spec.soundAlikeHint`（中文谐音 / 越南语近音 / 英文 wordplay）。

### `generatePhraseMnemonic(phrase, signal?)`
为词组/短语生成三种方式的记忆助记。返回 `Mnemonic`。内容与原因均用学习者母语。

### `generateSingleMnemonic(word, type, isPhrase, currentMnemonicContent?, userIdea?, signal?)`
生成或重新生成单个指定类型的助记（支持用户想法提议与校验）。返回 `MnemonicItem`。内容、原因与对用户提议的校验回复均用学习者母语。

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
    "aiApiKeys": { "gemini": "AIza..." },
    "defaultLearningDirection": "in"
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
