# 11 — 英越词典 MVP 技术实现路线

> **状态：规划已确定，尚未开始实现。**
>
> 原则：只做跑通第一个英越版本必需的改动，优先 Happy Path。暂不建设完整的多语言词典平台。
>
> 第一目标：**越南语母语者学习英语**。用户选择越南语后，Lexicon 使用英越词典，AI 用越南语解释。
>
> 本文是本次实现使用的临时执行计划。功能完成、正式架构文档同步后可以删除，不作为长期重复维护的规范。

---

## 0. 本期范围

本期只完成三件事：

1. 把当前“非单语时一律中文”的硬编码改成从主词典推导解释语言。
2. 接入一本可以合法再分发的 English–Vietnamese SQLite 词典。
3. 用户选择英越作为主词典后，本地查词和 AI 都以越南语作为默认解释语言。

本期明确不做：

- 不支持其他目标语言，也不支持英语母语者学习越南语。
- 不重写整个数据库 schema。
- 不建设词典市场、插件系统或多词典合并。
- 不实现越南语反查英语；首版只查英文。
- 不拆分新的用户数据库，不全面迁移 Profile 和历史缓存。
- 不要求首版覆盖所有平台的远程按需下载。
- 不做断点续传、镜像源、并发下载等复杂能力。

---

## 1. 最小产品行为与优先级

设置页不必新增独立“母语”状态。把现有 Active Dictionary 改成用户始终可选的 Main Dictionary：

```text
English–Chinese / English–Vietnamese / English–English
```

| 主词典 | 非单语言本地词典 | 非单语言 AI 输出 |
|---|---|---|
| English–Chinese | 现有英汉词典 | 中文 |
| English–Vietnamese | 新增英越词典 | 越南语 |
| English–English | 现有英英词典 | 英语 |

首版学习语言固定为英语。现有 `appLanguage` 保持独立，越南语 UI 翻译不作为首版阻塞项。主词典的非英语侧就是默认解释语言，不再额外保存一份容易冲突的“母语”设置。

现有单词、短语、句子三个 monolingual 开关继续独立工作，并且优先于主词典：

```text
该查询类型开启单语言模式
  → effectiveDictionary = en-en
  → explanationLanguage = en

该查询类型未开启单语言模式
  → effectiveDictionary = mainDictionary
  → explanationLanguage = 主词典的非英语侧（zh 或 vi）
```

主词典选择器始终可用。它表示“未被当前查询类型的 Monolingual 覆盖时使用哪本词典”，而不是当前瞬间实际加载的词典。

非单语言模式下的 AI 翻译方向：

| 输入 | 主词典为英汉 | 主词典为英越 |
|---|---|---|
| 英语 | 中文解释 | 越南语解释 |
| 主词典另一侧语言 | 翻译/表达为英语 | 翻译/表达为英语 |
| 其他语言 | 翻译并用中文解释 | 翻译并用越南语解释 |

单语言模式下，无论输入是什么语言，现有 English-only 逻辑优先，所有解释使用英语。

---

## 2. 最小代码改动

### 2.1 把 Active Dictionary 改为 Main Dictionary

在 `settingsStore` 将业务含义改为：

```ts
type MainDictionary = 'en-zh' | 'en-vi' | 'en-en'

mainDictionary: MainDictionary
setMainDictionary(dictionary: MainDictionary): void
```

默认值为 `en-zh`。旧 `activeDictionary: lexicon.db` 迁移为 `en-zh`，旧 `lexicon_en.db` 迁移为 `en-en`，不改变现有用户的手动选择。

不新增独立 `explanationLanguage`。通过一个纯函数派生当前上下文：

```ts
resolveLanguageContext(queryType, settings) => {
  mainDictionary,
  effectiveDictionary,
  explanationLanguage,
  monolingual,
}
```

DB 路由和 AI Prompt 必须读取同一个结果，防止“加载英越库但 AI 仍输出中文”。暂不增加 `learningLanguage`，因为首版只学英语。

### 2.2 区分主词典与有效词典

```ts
type DictionaryId = 'en-zh' | 'en-en' | 'en-vi'
```

路由依据当前 query type 对应的单语言开关：

```ts
monolingual = true  → en-en
monolingual = false → mainDictionary
```

`autoSwitchDictionary` 不再提供独立语义，MVP 已移除其 UI 与运行时状态。三个 Monolingual 开关本身就是覆盖条件；旧持久化字段在 merge 时被忽略。

英越 MVP 不做本地越南语反查。越南语或其他非英文输入允许本地未命中并落入现有 AI 路径，由 AI 按上表完成翻译。

### 2.3 保持现有 DBService 和结果类型

以下接口不改：

```ts
suggest(prefix, limit?)
lookup(word)
getRelatedPhrases(word, limit?)
```

`WordResult`、`Meaning.zh/en`、`SuggestItem.zhBrief` 首版也不全面改名：

- 英汉库的 `zh` 保存中文。
- 英越库的 `zh` 暂时保存越南语。
- 英越库的 `zhBrief` 暂时保存越南语简释。

字段名不够通用，但这是最小兼容方案，可以避免重写全部结果组件。等未来确实接入第四本或第二种非中文词典时，再迁移成 `translation/brief`。

### 2.4 增加第三本数据库

```text
en-zh → lexicon.db
en-en → lexicon_en.db
en-vi → lexicon_vi.db
```

在现有 `db.web.ts` / `db.native.ts` 模式上增加第三份缓存与加载分支，复用已有 warmup、invalidate、epoch/gate，以及扩展的 OPFS 下载和 SHA-256 校验。不新建一套下载框架。

---

## 3. 英越词典数据

### 3.1 数据源最低要求

只评估一至两个候选，最终选一本：

- 明确允许修改和再分发。
- 能说明主要上游来源。
- 至少有英文词头和越南语释义。
- SQLite 或容易转换成 SQLite。
- 抽查约 100 个常用词、多义词和短语，质量可接受。

许可证或来源不清就不发布，不用来源不明的数据库临时顶上。

### 3.2 沿用现有 SQLite 表

首版继续使用：

```text
entries / meanings / examples / suggest
```

字段映射：

```text
英文词头        → entries.word / word_lower
音标、词性      → entries.phonetic / pos
越南语释义      → meanings.zh
英文定义（如有）→ meanings.en
英文例句        → examples.en
越南语例句翻译  → examples.zh
越南语简释      → suggest.zh_brief
```

本期不增加新 schema、反向索引或 capabilities 表。

### 3.3 必要清洗和报告

- 文本统一 Unicode NFC，保留越南语变音符号。
- 去除明显 HTML 和空白噪音。
- 统一常见词性。
- 排除空词头、空释义和异常记录。
- 建立现有查询需要的索引。

构建后只输出简单报告：词条/义项/例句数、空释义数、数据库大小、SHA-256、来源和许可证。

---

## 4. AI 最小改造

AI 不直接读取文件名，也不各自判断 monolingual。所有入口读取与 DB 相同的 `resolveLanguageContext()`，再用一个辅助函数生成语言规则：

```ts
getExplanationLanguageInstruction(context)
```

它分别要求 AI 使用自然中文、自然越南语或学习者友好的英语。把关键 Prompt 中写死的 `Chinese native speakers`、`Answer in Chinese`、`中文含义` 改为读取这一指令。

该指令还必须描述翻译方向：

- 英语输入：解释/翻译为当前 `explanationLanguage`。
- 输入正好是主词典的另一侧语言（中文或越南语）：给出自然英语表达，再用该语言解释差异。
- 输入其他外语：保留原词/原句，翻译到当前 `explanationLanguage` 并用它解释文化和用法。
- 单语言模式：覆盖以上规则，全部用英语解释。

现有 `detectLanguage()` 会把所有含拉丁字母的输入判为英语，因此越南语会被误判。MVP 必须做一个很小的修正：在英语判断之前检测越南语特有字母/变音符号并返回 `vi`，同时扩展 `Language` 类型。无变音符号的越南语与英语天然可能歧义，Prompt 仍需要求模型自行判断真实输入语言；本期不引入语言识别库。

本期必须覆盖 Dictionary Tab 中所有会生成用户可见文字的路径，而不只是两个主按钮：

- 普通单词 AI Lookup。
- Pure Core 单词。
- 短语/句子分析。
- AI Chat。
- 练习反馈。
- 查询 skeleton / 拼写纠正。
- 释义补全、搭配补全和概念树补全。
- 助记重新生成。

图片翻译明确排除，继续使用 `imageStore.sourceLang/targetLang`，不得跟随 Main Dictionary。

不全面重构 AI JSON schema；带 `zh` 的字段首版可暂存越南语文本。`chineseThought` 也先只调整 Prompt 语义，不立即迁移持久化字段。

切换主词典时必须：取消或作废在途 AI 请求、使当前词典内存实例失效、清空当前结果与 AI 缓存，并对非空查询重新执行一次搜索（或回到明确空态）。只调用 `clearCacheOnly()` 不够，因为它不会清掉屏幕上正在显示的旧语言结果。不建设完整的多语言结果缓存并存系统。

Chat 需要最小语言分轨。当前只按 `query + Lookup/Core` 保存，直接切到英越会重新展示中文旧对话。Chat key / conversation bucket 至少加入 `explanationLanguage`；旧记录按 `zh` 读取。用户笔记、历史词条和 Memory 统计本身不按语言拆分。

Profile 首版不做越南语深度特化；只要不阻塞核心查词路径即可。

---

## 5. Settings 与分发

把现有设置项改名并保持始终可选：

```text
Main dictionary
[ English–Chinese | English–Vietnamese | English–English ]
```

选择后执行：

1. 更新 `mainDictionary`。
2. 若当前查询类型不是单语言模式，激活对应词典。
3. 清理当前结果和 AI 缓存。
4. 预热当前 `effectiveDictionary`。

单语言模式只是临时让 `effectiveDictionary = en-en`；关闭单语言模式后自动回到选定的 Main Dictionary。

不新增词典商店页面、复杂推荐卡或多本同语言词典选择。

现有 manifest 只增加一个 `envi` 条目，不升级成大型 catalog：

```json
{
  "enzh": { "...": "现有内容" },
  "enen": { "...": "现有内容" },
  "envi": {
    "version": "...",
    "url": ".../lexicon_vi.db",
    "sha256": "...",
    "bytes": 0
  }
}
```

同时让 manifest generator、扩展下载器和 OPFS 文件匹配接受 `envi`。

GitHub Release 提供数据库、来源说明、许可证/attribution、转换说明和哈希。未获再分发权的商业词典不得上传。

---

## 6. 执行前冲突审计

以下是根据当前代码路径确认的冲突点和必须采用的最小防护。

| 现有功能 | 潜在冲突 | MVP 处理 | 不做的扩展 |
|---|---|---|---|
| 单词/短语/句子单语言开关 | DB 当前只用“是否含空格”区分，句子与短语可能读错开关 | DB 与 AI 共用 `detectQueryType()` 和 `resolveLanguageContext()` | 不合并三个开关 |
| 单语言覆盖 | 旧 Auto Switch 与 Active Dictionary 产生双重状态 | 当前查询类型的 Monolingual 直接覆盖 Main Dictionary 为英英 | 删除冗余开关，旧持久化字段仅迁移 |
| 本地正向查词 | 中文检测会强制路由英汉库，破坏英越主词典 | 本期只对英文执行本地词典查询；非英文直接走 AI | 不做中/越本地反查 |
| 越南语输入识别 | 当前所有拉丁文字都被判为英语 | 先检测越南语特有字符；Prompt 再自行判断无音调越南语/其他拉丁语言 | 不引入语言识别依赖 |
| AI Lookup / Pure Core 双并发 | 切词典时旧请求可能晚到并覆盖新语言结果 | 请求开始记录 language-context key，提交前校验；设置切换时取消/作废旧 generation | 不重写并发架构 |
| AI 缓存与历史回放 | cache key 没有语言，可能回放中文结果 | 切换主词典时清空所有 AI 结果缓存；历史词条保留，回放时重新生成 | 不做多语言结果缓存并存 |
| 当前显示结果 | `clearCacheOnly()` 不清屏幕结果 | 使用完整结果 reset/clear，并按当前 query 重查或显示空态 | 不改变搜索模式状态机 |
| AI Chat | 对话只按 query + Lookup/Core 分轨，会混入中文旧对话 | Chat/conversation bucket 最小增加解释语言维度；旧数据视为 `zh` | 不拆用户数据库 |
| Profile / Memory | `chineseThought` 和 Profile 文案可能进入 Prompt | 主查询 Prompt 不再假定中文；Profile 深度诊断首版不做越南语特化，必要时不注入中文 profile 文本 | 不迁移全部 Profile schema |
| UI 结果组件 | 组件读取 `zh/zhBrief`，大改类型会牵连很多视图 | 英越库暂借这些字段存越南语，沿用现有显示组件 | 不做字段全面重命名 |
| 发音 | 当前单词发音按英语处理 | 英文正查保持现状；非英文 AI 翻译路径不调用本地英文词条发音 | 不新增越南语 TTS 策略 |
| 强制 AI / OOD | 会绕过本地词典，容易遗漏主词典语言 | 与普通 Lookup 使用同一 language context，不根据是否命中词典决定语言 | 不改变 bypass 语义 |
| 浏览器扩展 | manifest、OPFS 正则和 fallback 写死两本库 | 只增加 `envi` 分支、下载状态和删除/失效覆盖 | 不建设 catalog/市场 |
| Capacitor 原生 DB | connection、asset version、fallback 写死两本库 | 增加第三个 connection/asset 检查；失败安全回落，不把英越错误回落成中文结果 | 不做原生远程下载 |
| 图片翻译 | 它有独立 source/target language | 完全隔离，不读取 Main Dictionary | 不改图片翻译行为 |

### 必须保持不变的行为

- Instant、AI Lookup、Pure Core 的触发和双半并发模型不变。
- 强制 AI、OOD、历史双轨和 Lookup/Core 缓存分轨语义不变。
- 切回 Instant 的取消逻辑、空态和结果渲染路径不变。
- `appLanguage` 仍只控制 UI，不决定词典或 AI 内容语言。
- 图片翻译语言选择保持独立。
- 现有英汉用户默认行为保持不变。

---

## 7. 实施顺序

### Phase 1 — 数据源确认

- 选定一本英越开放词典。
- 核对许可证和来源。
- 抽查约 100 个样本。
- 确认能映射到现有表。

完成标准：可以合法发布，基础质量可接受。

### Phase 2 — 主词典和单语言优先级

- 把 `activeDictionary` 迁移为始终可选的 `mainDictionary`。
- 增加共享的 `resolveLanguageContext()`。
- 为 `detectLanguage()` 增加最小越南语识别，并让 DB 路由使用完整 query type。
- 增加 `en-vi` 与第三本 DB 加载分支。
- 保持 word/phrase/sentence 三个单语言开关分别覆盖为 `en-en`。
- 修改设置联动且不再禁用主词典选择器。

完成标准：使用小型测试 DB 时，选择越南语能查到越南语释义。

### Phase 3 — 构建真实英越数据库

- 编写一个来源转换脚本。
- 输出 `lexicon_vi.db`、简单质量报告和 SHA-256。
- 用约 100 个黄金样本验证。

完成标准：Instant 查词、联想和短语可用。

### Phase 4 — AI 越南语输出

- 增加读取共享 language context 的统一语言指令。
- 修改 Dictionary Tab 全部用户可见 AI 路径，不触碰图片翻译。
- 覆盖英语、主词典另一侧语言、其他外语和单语言四种方向。
- 为 Chat 增加最小语言分轨。
- 切换主词典时取消旧请求、清当前结果和缓存，并安全重查。

完成标准：核心 AI 路径输出可读越南语，不泄漏中文指令。

### Phase 5 — 分发与验收

- manifest 增加 `envi`，上传 GitHub Release。
- 先完整验证扩展/Web；其他平台确认第三本预置库不破坏构建即可，统一远程下载可后置。
- 邀请越南语母语者检查核心样本。

完成标准：真实用户能完成选择越南语、加载/下载词典、查词和 AI 学习的完整 Happy Path。

---

## 8. 必要测试

只覆盖高风险联动：

- `en-zh / en-vi / en-en` 主词典在非单语言下选择正确词典。
- word/phrase/sentence 任一单语言开关只覆盖对应查询类型为 `en-en`。
- Main Dictionary 始终可选择，不再显示 Auto Switch。
- 关闭单语言模式后恢复用户选定的 Main Dictionary。
- 旧 `activeDictionary` 设置能无损迁移，默认主词典为英汉。
- 切换主词典会清理当前结果缓存。
- 英越库可执行 suggest、lookup、related phrases。
- 英越库不存在时应用不崩溃。
- 英越主词典下：英语输入→越南语；越南语输入→英语表达；其他外语→越南语。
- 单语言模式下所有输入→英语解释。
- 越南语 Prompt 不包含中文输出要求。
- 切换主词典时旧在途请求不能提交，当前画面不会残留旧语言结果。
- Chat 的中文、越南语、英语对话不会串轨，旧对话仍可按中文轨读取。
- 强制 AI、OOD 和历史回放与普通查询遵循同一语言上下文。
- 图片翻译 target language 不因 Main Dictionary 改变。
- 现有英汉、英英测试继续通过。

手工验证约 100 个英文词和短语，并分别走一次 Instant、AI Lookup、Pure Core、Chat 和练习。检查越南语变音符号和已加载词典的离线查询。

不建设完整 E2E 矩阵或大规模语言质量平台。

---

## 9. MVP Definition of Done

- [x] Main Dictionary 始终可选英汉、英越或英英，不再存在 Auto Switch。
- [ ] 非单语言时英越主词典会使用 `lexicon_vi.db`。
- [ ] 单语言模式按单词/短语/句子分别优先使用英英词典，关闭后恢复主词典。
- [ ] 英文查词能显示越南语释义和已有例句。
- [ ] 联想和相关短语正常。
- [ ] 英越主词典下，五条核心 AI 路径按输入方向使用越南语或英语。
- [ ] 其他外语输入在英越主词典下改用越南语解释，不再输出中文。
- [ ] 现有英汉和英英模式无明显回归。
- [ ] 英越数据库有可追溯来源、许可证和转换说明。
- [ ] GitHub Release 文件通过 SHA-256 校验。
- [ ] 越南语母语者完成一轮核心样本检查。

达到以上条件即结束 MVP。通用 schema、词典市场、反向查询、多语言缓存、高级下载和完整平台化，只有真实需求出现后再做。
