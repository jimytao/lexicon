# 2026-10-29 学习者证据与三词典核验 / 执行记录

## 基线与使用约定

- 修改前：`feat/learner-evidence-harness`，HEAD `0dcc889d40239bea519ae439edf56db0b5d87b9a`；父提交 / 当时 GitHub master `e24db9e`。
- 本文在本轮代码修改前建立。保留“修改前”证据，修复过程填写“修改后”和验证，避免把计划误记成完成。
- 初始工作区只有未跟踪的 `public/assets/databases/lexicon_vi.db`。保留用户文件；不提交、不推送、不发布。
- 原始 MDX → 转换脚本 → 生成 `.db` → App 显示，是四个不同层次。旧库里还存在的损伤可兼容修复；被旧转换器漏掉的义项必须从 MDX 重新导入才能恢复。
- 先前报告中的“脚本已修好”不够准确：深查发现 D05。旧 Unreleased 中的全面表述需以本文后续验收为准。
- 阅读顺序：本节与问题表是修改前基线；“修改后与验收日志”保留过程；“最终验收与当前状态”是最终结论。文档同步复核见文末 2026-10-30 清单。

## 已验证正确、应保留的行为

1. Chrome localhost 中已保存的 Gemini API 可连接并返回真实分析；未输出密钥。
2. 原有 43 文件 / 422 测试通过，Web 与扩展构建通过，ESLint 0 error / 80 warning。
3. 英汉 `bay` 恢复左括号并显示可数标签；`bench` 恢复法官释义；英英 `acceleration` 拆出 physics 标签；英越 `abacus` 结果页隐藏复数头碎片。
4. 中 / 英界面标签本地化、三词典切换、英越 AI Lookup / Pure Core 越南语输出可用。
5. OUT 原句 `fails charging` 被提示复犯；原句 `failed to charge ... felt angrily` 中保留的正确结构可提示真实进步。
6. 请求中切换 IN/OUT 不改变已提交查询的归属；IN 外部错误句没有增加 OUT 写作错误次数。
7. 低成本批处理、方向与学习者语言隔离、无证据不凑弱点数量的总体设计保留。

## 用户本轮确认的产品语义

- 气泡可有可无，由 AI 判断学习价值；**没有合适内容就不返回该字段，不安排必出配额**。
- 可回顾历史错误 / 进步，也可联系过去用法、比较 `to do` 与 `doing`、指出相似结构的不同逻辑，或作一句有用的延伸。
- “有联系”不要求“犯了同一个错误”，但提及具体历史必须有对应记录，不能编造“你以前……”。
- 自然语言解释继续由 AI 写；程序核验来源、方向、引文与历史依据，不以固定评分模板替代解释。
- IN 材料可和阅读学习经历联系，不可据其遣词造句评价本人写作；OUT 辅助语言表达需求不等于本人已经写出了英文译文。

## 问题、补法与验收

| ID | 修改前 / 复现证据 | 补法与验收目标 | 状态 |
|---|---|---|---|
| E01 | `PhraseView` 将 correctForm 传入 Chat context；`askQuestion` 又标为 learner_original。Chrome 原文 `My phone fails charging after the update.`，追问却说原文是 `fails to charge`。Chat 归纳上下文同样可能被错标。 | 原始提交、订正版、AI 分析分别标来源；后台 Chat 记录保留原始查询；富语境开关不影响原文归属。真实追问必须能引用原句。 | 所列复现已修复；见验收日志 |
| E02 | `isLearnerQuote` 接受 Chat 问句的任意引用。定向测试：问“为什么这里用 fails to charge？这是你改的”也能令 confidence=.9 / mastered。 | 提问是理解兴趣证据，不自动作为自主英文输出；提高掌握度需引用本轮明确的 OUT 英文表达事件，绑定事件 ID；AI 订正仍不算能力证据。 | 所列复现已修复；见验收日志 |
| E03 | kind=related 直接放行任意正文，即便正文是在 IN 下表扬“已掌握”；旧 schema 强制同一错误模式，无法支持用户要的类比扩展。 | 可选回顾 / 联系 / 延伸；回顾需核验本人片段与已有弱点，历史联系需对应记录，普通延伸不得假借历史或评价进步。保留自然语言解释，明确禁止凑数。 | 所列复现已修复；见验收日志 |
| E04 | 混合批次只返回 OUT、空对象、错误字段类型仍可返回“成功”；profile.ts 随后删掉整批事件。 | 预期方向与字段严格完整校验，失败不保存、不出队。发送 / 验收 / 删除同一快照；截断预算外的记录继续保留；成功后继续处理剩余批次。 | 所列复现已修复；见验收日志 |
| D01 | 三本共 346,626 条旧义项扫查；英汉 A 音仍错作“音乐”，英文夹中文；旧例句中有中英重复。 | 修显示兼容的有限边界；修转换源并对生成库核验，不无限扩大不可靠的正文猜测。 | 所列复现已修复；见验收日志 |
| D02 | 英越 abatis 联想残留 `, số nhiều…`；旧 suggest 共 1,947 条前导头碎片。 | 结果、联想、相关词组一致清理明确的 SPDict 词性 / 复数头；合法标点正文保留。 | 所列复现已修复；见验收日志 |
| D03 | 旧英越 abacus 缺柱顶义项、aback 缺航海 / 比喻义项；parseSpdictEntry 新版可提取。 | 临时生成新库，对照源 MDX 验证义项恢复后再替换运行库。 | 所列复现已修复；见验收日志 |
| D04 | 英越解析后每义项有 pos，写库却只保存 entry.pos；bay 所有义项标 ADJ。 | 按词性拆 entry，沿用现有 schema；每条义项保留正确词性。 | 所列复现已修复；见验收日志 |
| D05 | 英英脚本第 77 行含 U+0008 而非正则词边界，无法截在 def 前。真实 MDX 的 `abort` 等词会误提取后续标签。 | 修正边界并补解析器回归测试；验证例句标签不提升为义项标签。 | 所列复现已修复；见验收日志 |
| D06 | 本地三库 hash 与 GitHub dictionaries Release 完全相同，最新提交未更新 .db；Git master 只跟踪英汉 / 英英，英越库为用户未跟踪文件。 | 记录生成前后 hash / 数量 / 差异；保留原始 MDX 与旧库可恢复副本；更新本地库后不自动推送 Release。说明英越文件仍需随用户后续提交 / 分发。 | 本地生成 / 应用已完成；远程资产未发布，英越文件仍未跟踪 |
| D07 | 要求复核 countable / uncountable 等是否三本同等适配。OALD9/10 有语法标签；SPDict 不保证提供可数性。 | 三库真实数据矩阵：源有标签才提取与本地化，无标签不推断或编造。检查语法、语体、学科、地区标签及内容括号保留。 | 已核验；见标签矩阵 |

浏览器限制：Brave 在 Web 的 CORS 失败为已有已提示限制，本轮不等同于桌面 / 移动联网验收。

## 执行顺序（修改前计划）

1. 建立本文与 CHANGELOG 入口，固定基线 / 正确项 / 问题 / 用户气泡要求。
2. E01/E02/E04：修来源、能力证据、结果验收与出队；用针对实际错误的回归测试验证。
3. E03：可选自然语言学习联系，不强制历史评价；同步 AI schema、Profile 文档、UI 中性说明与中英文 README。
4. D01–D05/D07：共享显示清理、转换器修复、三库标签审计、旧 / 新库对比。
5. D06：在临时目录生成验证，保存旧库副本，再应用核验通过的生成库；不改原始 MDX，不发布。
6. 全量测试、Web / extension build、lint；Chrome 真实 API 检查原文追问、可选气泡、方向隔离、标签和恢复义项。
7. 把每个 ID 的修改后状态和实际验证写回本文；未完成 / 仅代码验证部分明确记录。

## 修改后与验收日志

### 代码与数据阶段（已执行；最终验收见下）

- E01：追问原文 / AI 订正版分块；后台 Chat 以上交的 routeQuery 记上下文；已有分析不再重贴为用户原文。
- E02：问句独立标签，不算掌握证据；improvementEventId 必须对应同批 OUT sentence / production，引用必须原文与订正后都存在。production 支持原本写对、仅格式变化的表达，90s 延迟归纳；程序累计不同原文，至少两条才可接受新 mastered。
- E03：可选 repeat / improved / related / extension。自然语言解释保留；真实弱点与探索记录有 referenceId；类比无需同一错误，普通扩展不能冒充历史评价；UI 改“学习联想”。旧缓存保留分析、隐藏未经过新版校验的气泡。边界：程序核验来源 / 引文 / 记录与常见分类冲突，语言语义仍由 AI 判断。
- E04：本轮方向及三数组严格校验，缺项保留整批；最早 12 条高价值 + 40 条 lookup 是同一发送 / 验收 / 删除快照，未发送的继续排队。整批失败不即时自我重试。集成测试验证混合缺项不丢事件、45 lookup 只消费前 40。
- D01/D02：修复旧 A 音恢复，摘要过滤明确的越南语词性 / 复数头，合法标点释义保留。新库英文例句的译文重复数为 0。
- D03/D04/D05：三转换器支持临时输出并按义项词性分组；英英 def 边界修复。新增发现：空中文的 aren't 必须保留英文定义；SPDict 独立星号段落需继承词性、复数头删除不能吞掉后续义项，均已补测试。
- D06：三库已先备份、临时生成、核验并复制到本地 public。未改原始 MDX，未提交 / 推送 / 发布。原生资产版本已升，扩展线上下载资产仍是旧版，须后续正式发布新库。
- 构建环境记录：原 better-sqlite3 缺本机原生 binding；尝试 sql.js 生成时英英有 WASM 越界，未应用该输出。转换器改用 Node 内置 node:sqlite（Node 24.18）；解析器导入无需执行建库，App 存储引擎不变。

| 库 | 旧词条（去重） | 新词条（去重） | 旧义项 | 新义项 | 丢失旧词条 | quick_check |
|---|---:|---:|---:|---:|---:|---|
| 英汉 | 51,902 | 51,959 | 99,392 | 99,477 | 0 | ok |
| 英英 | 61,206 | 61,206 | 112,040 | 112,040 | 0 | ok |
| 英越 | 83,066 | 83,071 | 135,194 | 146,901 | 0 | ok |

数据是实际 SQLite 去重词条计数，与 MDX keyword / alias 数不混淆。三库识别到的头碎片与双语例句尾部回声均为 0。

- 旧库副本、生成库、基线 hash 与 comparison.json：`C:/Users/Julina/.codex/visualizations/2026/10/29/01a18692-d73b-7313-8ec1-06b11d8f07e4/dictionary-audit/`。可用 audit-dictionaries.mjs 重跑；不以测试数量替代词条语义验收。
- 此阶段中间结果：44 文件 / 449 项通过；TypeScript 通过；lint 0 error。后续新增回归后的最终数量为 452，见“最终验收与当前状态”。


### D07 三库标签矩阵（数据扫描与 Chrome）

| 来源 | 源标签与程序行为 | Chrome 结果 |
|---|---|---|
| OALD9 英汉 | countable / uncountable / transitive / intransitive；只按源标注提取 | bay 同时验证可数、不可数与动词不及物；A 音释义与 music 标签分开 |
| OALD10 英英 | 同一提取 / 本地化路径，完整保留嵌套学科标签 | acceleration 显示不可数、单数、物理；bay 显示可数及多词性 |
| SPDict 英越 | số nhiều / định ngữ 等语法标签按 UI 映射复数 / 定语或 plural / attributive；领域词原样；不补造 countability | bay 名词与动词不再套 ADJ，并显示复数；abacus 柱顶与 aback 航海 / 比喻义项恢复 |

### 追加发现 S01（先记录后补）

- 原有 useSearch 的 skipNextSuggestRef 是布尔值。再次搜索同一词时 query 不变，effect 不会消费它；接着一次粘贴完整前缀会被错误地跳过联想。继续再打一个字才出现词典联想。本轮 Chrome 从 bay 一次粘贴 abati 可复现只有历史结果，改成 abatis 后才显示词典摘要。
- 补法：skip 标记绑定实际已提交的 normalized query，只略过同一次提交的回填；用户改成别的前缀时必须请求联想。验收：重复搜同词后一次粘贴不同前缀即出现 DB 联想。此项与词典摘要验收一起完成，不改变查词或画像含义。

### E03 追加验收发现：局部用对不等于广泛掌握

- Chrome 正确句 `I considered replacing the battery, but decided to wait.`：Lookup 自行省略气泡；Core 返回“你准确使用了 consider…非谓语动词掌握得很地道”。前半有原文依据，后半把一次局部用对扩大为整类语法掌握。
- 补法：表现气泡仍可自然指出这次具体片段用对，但所有类型均拒绝“已经掌握 / 掌握得… / mastered / 克服习惯”等广泛结论。当时提示门禁先修订为 v3；后续 S02 后最终为 v4，旧分析保留、旧版提示隐藏；补真实措辞回归，重新构建验证。

### S02 追加观察：历史检索串不等于权威词义（先记录后补）

- 操作测试产生的无效串 abatibay 被搜索 / Profile 记录后，AI 一度在英越气泡里为它编出建筑术语释义。记录本身真实存在，但记录过某个字符串不能证明它是合法词，更不能证明 AI 附会的词义。
- 补法：所有注入的历史检索 / 探索都标为未验证的文字；未附有依据的历史词义不得作为事实扩展。可以比较有依据的语法模式，或直接省略；不把清空用户历史 / Profile 当修复手段。更新提示门禁修订，隐藏旧提示但保留分析。语言解释的正确性仍是 AI 语义判断，代码不宣称已形式化证明每句话的词义。

### 最终验收与当前状态

- 全量自动测试：44 文件 / 452 项通过；Web build、extension build、TypeScript 通过；ESLint 0 error / 87 warning（基线 80，新增主要为回归测试中的非空断言）。git diff --check 无空白错误。
- E01 Chrome：原文 My laptop fails charging after the latest update. → 订正 fails to charge；追问现正确逐字引用 fails charging，并指出 fail + v-ing，不再把订正版当原文。修复前后截图保存在本任务 visualizations 目录。
- E03 Chrome：cat 分析完成后 AI 自行省略提示；正确 considered replacing / decided to wait 句在 Lookup 也自行省略。Core 曾过度夸大“掌握得很地道”，已补全类型过度掌握措辞拦截和真实句回归；新版提示修订 v4，旧分析可回放、旧提示隐藏。自然语言解释保留，不增加常驻气泡、不凑数。related / extension 的不同结构对比和无历史延伸路径有定向测试。
- D01/D07 Chrome：英汉 bay 可数 / 不可数 / 不及物和 noun/verb 分开；A 音含字母释义、music 标签、纯英文例句正确。英英 acceleration 的不可数 / 物理、bay 的可数与多词性正确。
- D02/D03/D04 Chrome：英越 abatis 联想无复数头碎片；abacus 两义项、aback 三义项恢复；bay 为 ADJ / NOUN / VERB，复数标签在中文 UI 显示复数。
- S01 Chrome 最终构建版：在英越重复搜索 bay，再一次替换为 abati，300ms 联想完成后出现 abatis / abatised 及干净摘要，不必再输入一个字。
- S02：Profile 注入和诊断均明确“历史检索串未验证，可能拼错或无意义；无依据不得定义历史词义”，并补回归。此为减少模型语义误推断的约束，不宣称代码已经证明所有生成文字的事实准确性。
- 最终验收用相同端口 localhost:5173 的 vite preview，避免补写 Markdown / 构建扩展触发 Vite dev 的 page reload 干扰在途请求。服务与 Chrome 留在初始页；恢复英汉、English、IN / Instant。
- 测试生成的本地查询 / Profile 记录保留，未清空既有个人数据。原始 MDX 未修改，旧三库有副本；代码与生成库只在本地工作区，未 commit、push、merge 或发布线上资产。
- 尚未实机验收：原生 iOS / Android / Tauri 升级后的资产重导入、线上扩展新库下载。扩展线上仍使用旧 Release，只有后续发布新资产 / manifest 才能得到新义项。

### 新旧库 SHA-256（可复查）

- `lexicon.db`：旧 `6597ef317f4410c24c6647681ff54525407766d12bd401d46ea08f4f9ba283fc` → 新 `dbba9d1b3a94bfba783792b547afb93f750d62b7ef2238b7e35fa928fe168a1f`。
- `lexicon_en.db`：旧 `a2bc42e79f4f128011b85edd35e6978ce8eba9a71c0350d0636526c4eb4f755d` → 新 `fd22bae098346bfe46f58f1f51336f8309e1d9221d0c446ab73f7762c273c3ef`。
- `lexicon_vi.db`：旧 `11ac312e830beccd204dd43e099710236153e5049a0546123b758766f40c1906` → 新 `608e4f052a6f22dfb0c514cc0dee5fbac755537243c7ee7fc1b4f221a41142a6`。

## 2026-10-30 文档覆盖复核

本次对照工作区实际 diff 与 `AGENT.md` 的文档同步规则逐项核对。发现的问题是旧正文与新增说明并存，可能让后续开发误用旧契约；本次同步文档及两处代码注释，未改运行逻辑。

| 记录位置 | 已覆盖内容 / 本次补齐 |
|---|---|
| [CHANGELOG](../CHANGELOG.md) | 用户决策、修复范围、最终验证与未发布状态；新增 10-30 文档复核条目 |
| 本文 | 修改前基线、正确项、E01–E04 / D01–D07 / S01 / S02、补法、前后结果、限制、备份与 hash；中间 449 项 / v3 明确标为过程，最终 452 项 / v4 |
| [01 架构](01-architecture.md) / [05 组件与状态](05-components.md) | 构建期 Node SQLite、结果缓存版本、程序验证字段、Chat 原文上下文；补 useSearch 只跳过同词提交回填的条件 |
| [02 UI](02-ui-design.md) / 双语 README | 可选学习联想、可数性按源显示、三库差异；补重复搜索后一次粘贴联想的交互要求 |
| [03 数据库](03-database.md) | 三库转换、无 schema 迁移、重建数据、版本与旧库兼容；纠正“当前旧损伤”表述，补第三转换器与可复跑命令 |
| [04 AI](04-ai-schema.md) / [08 Profile](08-ai-learning-system-and-profile.md) | 四类可选联系、referenceId、问句来源、production、事件绑定与掌握证据、失败保留；补完整 schema、最早快照 / v4，说明 active≤8 是 prompt 要求而非代码裁剪 |
| [06 跨平台](06-crossplatform.md) | 本地资产版本、Web / 原生 / 扩展分发路径；实机升级与线上新库尚未验收 / 发布 |
| [11 原路线](11-multilingual-dictionary-roadmap.md) / [文档索引](README.md) / [AGENT](../AGENT.md) | 原路线标为历史计划，指向现行文档；Agent 上下文同步当前约束与执行记录入口 |

为使证据随项目保留，复制只读审计报告至文档目录：[旧库基线](evidence/2026-10-29/dictionary-baseline.json)、[三库新旧完整比对](evidence/2026-10-29/dictionary-comparison.json)。报告包含新旧 hash、词条 / 义项 / 例句数量、完整性、标签计数、丢失词列表和样例；数据库大文件备份仍在前述 visualizations 目录。复制报告不等于已经提交 Git。

复核检查：报告副本与原件 hash 一致，报告的新库 hash 与当前 public 三库一致；相关文档入口存在，文档同步规则对应的文件均已更新，`git diff --check` 无空白错误。原 Bash hook 在本机受 MSYS 权限限制未能启动，改用 PowerShell 执行同等文件覆盖检查；未把 hook 记为运行成功。本次只改文档 / 注释，未重复执行代码测试；452 项及构建 / lint 结论来自上节最终代码验收。

边界继续保留：没有 commit / push / merge / 发版；线上扩展新库、iOS / Android / Tauri 实机升级仍待后续验证。后续修改须先查本文基线与编号，再记录新的实际变更和验证，不把本次结果外推为全部 AI 文本均正确。

### 2026-10-30 后续本地提交授权

用户在文档复核后明确要求“在这个分支做 commit”。提交范围为当前 `feat/learner-evidence-harness` 上本轮代码、回归测试、三份生成库、开发文档与比对报告；此前未跟踪的 `lexicon_vi.db` 一并纳入。上文“未提交 / 英越仍未跟踪”保留为当时的过程状态，以本节授权后的 Git 记录为准。未要求 push / merge / 发布，实机与线上资产的待验收状态不变。提交前 `git diff --check` 通过；代码未发生新逻辑变更，沿用 452 项测试及构建结果。

### 2026-10-30 复核追加 S03：Profile 归纳输出被截断、静默丢批（Claude 复核）

- 复现：Chrome localhost:5173（Gemini `models/gemini-3.5-flash`）OUT 提交对句 `The update failed to install last night, so I restarted the laptop.`，产生 production 事件；90s 后归纳请求返回 200，但 `finish_reason: "length"`，content 3577 字符止于 recommendations 中途。JSON 解析失败 → `applyDiagnosticResult` 得到 null → 不保存、不出队、无日志。同一会话较早的错句 + 追问两次归纳也未写入，刷新后冷启动重试才成功。
- 原因：`max_tokens: 3000`（本轮之前已有）对思考型模型偏小；基线画像越写越长，且 E02 新增的 `verifiedProductionIds/Texts` 也随基线发出并被模型原样回写。
- 补法：`DIAGNOSTIC_MAX_TOKENS = 8192`；`baselineFor` 去掉两项程序自有字段；截断 / 非法 JSON / 校验不通过分别 `console.warn('[profile] …')`。失败仍保留整批，不改变 E04 的严格校验与出队语义。
- 验证：新增 3 项回归；44 文件 / 455 项通过，`tsc -b` 通过，ESLint 0 error。修复后未再用真实 API 重跑 Chrome 归纳。

### 2026-10-30 复核追加 S04：追问看不到 AI 自己的订正说明（Claude 复核）

- 现象：E01 修复后追问已分块拿到原文与 AI 改句，但页面上的「为什么这么改？」、地道表达 / 选词理由、思维违和感剖析只在富语境开关（`chatRichContextDefault` 默认 false）打开时发送，`nativeForm` / `nativeRationale` 从未发送。用户追问 AI 的改动时，模型只能重新推理，可能与页面说法不一致。
- 补法：`buildChatCorrectionContext()` 生成订正段，经 `AiChatBox.correctionContext` → `askQuestion` 始终发送，非 irrelevant 路线标 `<ai_generated>`（不进入学习者证据）；富语境中去掉重复项。irrelevant 路线追问同时注明原始输入。
- 验证：新增 5 项回归；46 文件 / 466 项通过，`tsc -b` 通过。浏览器以模拟 AI 实测富语境关 / 开两种请求内容，订正各项恰好出现一次。未用真实 API 重跑。
