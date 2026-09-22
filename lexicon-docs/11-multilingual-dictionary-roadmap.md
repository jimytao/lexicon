# 11 — 英越词典 MVP 技术实现路线

> **状态：规划已确定，尚未开始实现。**
>
> 原则：只做跑通第一个英越版本必需的改动，优先 Happy Path。暂不建设完整的多语言词典平台。
>
> 第一目标：**越南语母语者学习英语**。用户选择越南语后，Lexicon 使用英越词典，AI 用越南语解释。

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

主词典选择器始终可用，不能再因为 Auto Switch 开启而 disabled。它表示“退出单语言模式后回到哪本双语词典”，而不是当前瞬间实际加载的词典。

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

现有 `autoSwitchDictionary` 可以在 MVP 中保留兼容，但默认开启时执行上述逻辑；无论它是否开启，Main Dictionary 选择器都保持可选。后续确认它不再提供独立价值时再删除，本期不做额外设置清理。

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

现有 `detectLanguage()` 暂不需要为越南语新增可靠检测器；越南语当前会进入 `other`，Prompt 已知道目标解释语言为 `vi`，足以完成 Happy Path。只有当“越南语输入必须定向翻成英语”出现识别不稳定时，再增加轻量越南语检测，不提前引入语言识别库。

本期必须覆盖：

- 普通单词 AI Lookup。
- Pure Core 单词。
- 短语/句子分析。
- AI Chat。
- 练习反馈。

不全面重构 AI JSON schema；带 `zh` 的字段首版可暂存越南语文本。`chineseThought` 也先只调整 Prompt 语义，不立即迁移持久化字段。

切换主词典时直接清空当前 AI 结果缓存，避免跨语言回放。不建设多语言缓存并存系统。

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

Auto Switch 开启时不再禁用这个选择器。单语言模式只是临时让 `effectiveDictionary = en-en`；关闭单语言模式后自动回到选定的 Main Dictionary。

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

## 6. 实施顺序

### Phase 1 — 数据源确认

- 选定一本英越开放词典。
- 核对许可证和来源。
- 抽查约 100 个样本。
- 确认能映射到现有表。

完成标准：可以合法发布，基础质量可接受。

### Phase 2 — 主词典和单语言优先级

- 把 `activeDictionary` 迁移为始终可选的 `mainDictionary`。
- 增加共享的 `resolveLanguageContext()`。
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
- 修改五条核心 AI 路径。
- 覆盖英语、主词典另一侧语言、其他外语和单语言四种方向。
- 切换主词典时清缓存。

完成标准：核心 AI 路径输出可读越南语，不泄漏中文指令。

### Phase 5 — 分发与验收

- manifest 增加 `envi`，上传 GitHub Release。
- 先完整验证扩展/Web；其他平台确认第三本预置库不破坏构建即可，统一远程下载可后置。
- 邀请越南语母语者检查核心样本。

完成标准：真实用户能完成选择越南语、加载/下载词典、查词和 AI 学习的完整 Happy Path。

---

## 7. 必要测试

只覆盖高风险联动：

- `en-zh / en-vi / en-en` 主词典在非单语言下选择正确词典。
- word/phrase/sentence 任一单语言开关只覆盖对应查询类型为 `en-en`。
- Auto Switch 开启时 Main Dictionary 仍可选择。
- 关闭单语言模式后恢复用户选定的 Main Dictionary。
- 旧 `activeDictionary` 设置能无损迁移，默认主词典为英汉。
- 切换主词典会清理当前结果缓存。
- 英越库可执行 suggest、lookup、related phrases。
- 英越库不存在时应用不崩溃。
- 英越主词典下：英语输入→越南语；越南语输入→英语表达；其他外语→越南语。
- 单语言模式下所有输入→英语解释。
- 越南语 Prompt 不包含中文输出要求。
- 现有英汉、英英测试继续通过。

手工验证约 100 个英文词和短语，并分别走一次 Instant、AI Lookup、Pure Core、Chat 和练习。检查越南语变音符号和已加载词典的离线查询。

不建设完整 E2E 矩阵或大规模语言质量平台。

---

## 8. MVP Definition of Done

- [ ] Main Dictionary 始终可选英汉、英越或英英，不被 Auto Switch 禁用。
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
