# Lexicon 自动发布工作流 (AI Agent Workflow)

这是一份写给 AI Agent 的标准操作程序 (SOP)。

**触发场景（任一即适用）：**
- 用户要求「发布新版本 / 执行发版工作流」
- 用户要求「上传代码 / push / 推送到远程」
- 用户要求「做完这轮改动后提交并推送」

请严格按顺序执行。终端权限不足时，提示人类授权后再继续。  
**未完成下方「0. 上传前文档门禁」之前，禁止 `git push`、禁止创建 Release、禁止上传二进制产物。**  
**正式发版时：未通过 §3.5 / `Assert-ReleaseGates.ps1` 之前，禁止 `git push`、禁止打 tag、禁止 `gh release`。**

### 发版脚本（优先调用，勿手写易错环境变量）

| 脚本 | 用途 |
|------|------|
| `scripts/release/Load-ReleaseEnv.ps1` | 从 `.env.release` 加载密钥；设置 **正确的** Tauri / Android 签名环境变量 |
| `scripts/release/Sign-TauriBundle.ps1` | 构建后若无 `.sig` 则补签（自动清除冲突 env） |
| `scripts/release/Write-VersionJson.ps1` | 无 BOM 写入 `version.json`（signature 来自 `.sig`） |
| `scripts/release/Prepare-AndroidApks.ps1` | 把 Gradle APK 拷成 Release 文件名 |
| `scripts/release/Assert-ReleaseGates.ps1` | **硬门禁**：缺 `.sig` / BOM / signature 不一致 / URL 版本错 → exit 1 |

密钥模板：根目录 `.env.release.example` → 复制为 `.env.release`（已 gitignore）。

---

## 0. 上传前文档门禁（强制，不可跳过）

> 目的：把「自上次成功推送到远程以来」的真实代码改动，与对外文档对齐。  
> 漏更 `CHANGELOG.md`、或中英文 README 仍写已删除/已过时功能，视为发版/上传失败。

### 0.1 锚定「上次上传」基线

在仓库根目录执行（PowerShell / bash 均可）。先刷新远程，再取基线：

```powershell
git fetch origin

# 当前分支跟踪的远程尖端（最常用：上次 push 成功后的点）
$BASE = "origin/$(git rev-parse --abbrev-ref HEAD)"
git rev-parse $BASE
```

若当前是**正式发版**且存在版本 tag，改用「上一正式版 tag」作基线（与上一 Release 对齐）：

```powershell
git fetch origin --tags
$BASE = git describe --tags --abbrev=0
# 例：$BASE = "v0.8.2"
```

> 基线变量下文统一写作 `$BASE`。不要用「凭感觉回忆改了什么」代替 git 输出。

### 0.2 列出上次上传之后的全部改动（精确命令）

```powershell
# A. 提交列表（理解「做了什么」）
git log $BASE..HEAD --oneline --no-merges

# B. 文件级变更统计
git diff $BASE...HEAD --stat

# C. 未提交工作区（若即将连同未提交改动一起上传，必须一并纳入检查）
git status --short
git diff --stat
git diff --cached --stat
```

必读范围：
- `src/` 下所有出现在上述 diff 中的路径
- 若改了导航 / 模式 / 设置 / 下载链接相关，额外打开 `App.tsx`、设置与搜索相关组件核对现状

### 0.3 核对并补全 `CHANGELOG.md`（精确步骤）

```powershell
# 打开变更日志顶部（Agent：用 Read 工具读文件前 80～120 行）
# 路径：仓库根目录 CHANGELOG.md
```

**验收标准（必须全部满足）：**

1. 对 `git log $BASE..HEAD` 里**每一条用户可感知的改动**（新功能、行为变更、删除/雪藏功能、重要 bugfix、跨平台/发版相关），`CHANGELOG.md` 顶部都有对应条目。  
2. 条目写在**文件最上方**（日期 + 简短标题；发版则带 `vX.Y.Z`）。  
3. 每条写清：**改了哪些文件 / 解决什么问题或新增什么能力**（与仓库现有 CHANGELOG 文风一致）。  
4. 若 diff 里有改动但 CHANGELOG 未写 → **立刻补写**，然后重新自检本小节。  
5. 纯文档笔误、仅本地构建缓存、与产品无关的噪声可省略；**功能增减不得省略**。

**禁止：** 用空话「杂项优化」吞掉多个独立功能；雪藏/删除的功能必须在 CHANGELOG 写明「已雪藏 / 已移除」，避免 README 与真实产品相反。

### 0.4 核对并更新中英文 README（强制双文件）

对外说明有两份，必须**成对**检查，内容语义对齐（不是机翻逐字，但功能点集合必须一致）：

| 文件 | 语言 |
|------|------|
| `README.md` | 中文 |
| `README_en.md` | 英文 |

```powershell
# 确认两文件都在、且本次是否已纳入提交意图
git status --short -- README.md README_en.md

# 对照「上次上传后」这两份是否被改过（未改不代表不用改——功能变了就得改）
git diff $BASE...HEAD --stat -- README.md README_en.md
```

**逐项核对清单（Agent 必须显式过一遍，缺一项就改文件）：**

| # | 检查项 | 不通过时怎么做 |
|---|--------|----------------|
| 1 | **核心特性**是否仍描述已删除或已雪藏的功能（例如弱项看板 Memory Tab、已下线入口） | 从两份 README 删除或改为「已雪藏/暂未开放」 |
| 2 | **新增用户可见功能**是否已写入特性列表（模式、笔记、Profile、发音等） | 中英文同步补充 |
| 3 | **查词模式名称**是否与产品一致：`Instant` / `AI Lookup` / `Pure Core`（勿再写过时的「仅 AI mode」） | 改正文与配置 AI 小节 |
| 4 | **设置入口**是否与现状一致（当前为底栏 **Settings Tab 全页**，不是右上角抽屉） | 改「配置 AI」操作步骤 |
| 5 | **底栏导航**描述是否为 3 Tab：Dict / Image / Settings | 改正文 |
| 6 | **下载链接版本号**是否指向即将发布 / 已发布的 `vX.Y.Z`（发版时必改；普通 push 若未发版可暂留旧链接，但不得指向不存在的文件） | 同步改 Windows / Android 链接与 Releases tag 链接 |
| 7 | **技术栈版本**（如 Vite / Capacitor / Tauri）是否与 `package.json` 严重不符 | 小幅更正 |
| 8 | 中英文两份的**功能点集合一致**（一侧有、另一侧无 → 补齐） | 成对编辑 |

改完后再次确认：

```powershell
git diff -- README.md README_en.md
```

### 0.5 门禁通过条件（Checklist）

Agent 在进入版本号滚动 / `git commit` / `git push` / `gh release` 之前，必须能对用户简短确认：

- [ ] `$BASE` 已锚定，且已阅读 `git log $BASE..HEAD` 与相关 diff  
- [ ] `CHANGELOG.md` 已覆盖上次上传以来的功能增减与重要修复  
- [ ] `README.md` 与 `README_en.md` 已按 0.4 清单校对，无「文档承诺了 App 里没有的功能」  
- [ ] 若本次是发版：README 下载链接版本号已改为新版本 `X.X.X`

**任一未勾选 → 停在本节补文档，不得上传。**

---

## 1. 自动滚动版本号 (Version Bumping)
除非用户明确指定了目标版本，否则默认进行**小版本号（Patch）滚动**（例如从 `0.7.5` 升级到 `0.7.6`）。
你需要跨平台同步修改以下所有文档中的版本号，确保没有任何遗漏：

### 核心与 Web (Frontend)
- **`package.json`**: `"version": "X.X.X"`
- **`src/stores/updateStore.ts`**: `currentVersion: 'X.X.X'` (**非常关键**，决定了 App 内部显示的构建版本)

### 桌面端 (Tauri)
- **`src-tauri/tauri.conf.json`**: `"version": "X.X.X"`
- **`src-tauri/Cargo.toml`**: `version = "X.X.X"`

### 更新检测 (Manifest)
- **`version.json`**: `"version": "X.X.X"` 以及 `platforms["windows-x86_64"].url` 中的下载链接版本号（确保指向 `.../download/vX.X.X/Lexicon_X.X.X_x64-setup.exe`，避免下载旧版本与新签名不匹配导致签名校验失败）。

### 移动端 (Mobile)
- **Android**: 修改 `android/app/build.gradle`，自增 `versionCode` 并更新 `versionName` 为新的 "X.X.X"。
- **iOS**: 修改 `ios/App/App.xcodeproj/project.pbxproj` 中的 `MARKETING_VERSION` 为 "X.X.X"，并同步自增 `CURRENT_PROJECT_VERSION` (建议与 Android 的 `versionCode` 保持一致)。

> [!IMPORTANT]
> **修改顺序**：必须先完成上述所有文件的版本修改，然后再执行后续的 `npm run build` 或打包流程。否则，打包出的二进制文件内部仍可能显示旧版本号。

## 2. 准备中英双语更新日志与重大版本判定 (Release Notes & Major Flag)
**长期真相源是 `CHANGELOG.md`**。根目录 **不再** 常驻 `release_notes_zh.md` / `release_notes_en.md`（避免与 CHANGELOG 双轨漂移）。

发版时按下列步骤**临时**生成两份说明（第一行为简短摘要/标题，后续为编号更新项），内容从本版 `CHANGELOG.md` 条目提炼：
- **`release_notes_zh.md`**（临时）：中文更新说明。例如：
  ```markdown
  支持本地英英词典与单语言模式自动切换及中文查词路由优化
  1. 新增：牛津高阶第10版纯英英词典...
  2. 新增：旧双解词典...
  ```
- **`release_notes_en.md`**（临时）：英文更新说明。例如：
  ```markdown
  Support for local English-English dictionary, monolingual mode auto-switching, and Chinese query routing optimization.
  1. **New**: Integrated the pure English-English Oxford Advanced Learner's Dictionary...
  2. **New**: Fully mined syntax and register prefixes...
  ```

读取临时文件的全部内容，并填入 `version.json`：
- **`notes_zh`**: `release_notes_zh.md`
- **`notes_en`**: `release_notes_en.md`
- **`notes`**: 通用降级兜底（优先中文或英文其一）

填完 `version.json`、写完 GitHub Release description 后，**可删除**这两份临时文件，不必入库。

> [!TIP]
> **软件内部更新弹窗（UpdateModal）自适应渲染机制**：
> 当用户在设置弹窗中点击更新或收到新版本通知时，`UpdateModal` 会读取当前软件语言设置（`appLanguage`）：
> - 若语言为 `zh`，自动优先渲染 `manifest.notes_zh`；
> - 若语言为 `en`，自动优先渲染 `manifest.notes_en`；
> - 若未命中则降级回 `manifest.notes`。同时弹窗按钮文案也已实现全量 i18n 国际化。

**重大版本判定逻辑**：
- **默认行为**：如果你没有收到“这是重大更新”或类似的明确指令，请**务必确保** `version.json` 中的 `"is_major"` 为 `false` 或将其彻底移除。即使上一个版本是重大版本，当前版本也应默认为小版本。
- **特殊指令**：只有当用户明确强调“这是重大版本”或要求“弹出大窗口提醒”时，才在 `version.json` 中设置 `"is_major": true`。

## 3. 本地编译构建 (Local Compilation)

下文把版本号写作 `$V`（如 `0.8.6`，**无**前缀 `v`）。Agent 必须用真实版本替换。

### 3.0 环境变量约定（唯一真相源）

| `.env.release` 字段 | 进程环境变量 | 用途 |
|---------------------|--------------|------|
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 同名 | `src-tauri/lexicon.key` 密码 |
| （脚本设置） | `TAURI_SIGNING_PRIVATE_KEY_PATH` | **私钥文件绝对路径**（推荐唯一方式） |
| `ANDROID_KEYSTORE_PASSWORD` | → `KEYSTORE_PASSWORD` | `android/app/build.gradle` |
| `ANDROID_KEY_PASSWORD` | → `KEY_PASSWORD` | 同上 |

**禁止 / 易错（曾导致补签与更新失败）：**

| 错误做法 | 后果 |
|----------|------|
| `$env:TAURI_SIGNING_PRIVATE_KEY = "src-tauri/lexicon.key"`（把**路径**当私钥内容） | 签名静默失败，**不生成 `.sig`** |
| 同时设置 `TAURI_SIGNING_PRIVATE_KEY`（内容）与 `--private-key-path` / `TAURI_SIGNING_PRIVATE_KEY_PATH` | CLI 报 conflict，补签失败 |
| 使用已废弃名 `TAURI_PRIVATE_KEY` | 当前 Tauri CLI **不认**，等于没设签名 |
| 手写 `version.json` 用 `Set-Content -Encoding UTF8` | 写入 **UTF-8 BOM**，更新器解析失败 |
| `platforms` 里放 android/ios 空 signature | Tauri 校验整个 JSON 失败 |
| `.env.release` 的 `ANDROID_*` 未映射到 `KEYSTORE_PASSWORD` | Gradle 可能用到错误默认密码 |

**正确加载（每次构建前必跑）：**

```powershell
# 仓库根目录
. .\scripts\release\Load-ReleaseEnv.ps1
# 此后：KEY_PATH 已设；TAURI_SIGNING_PRIVATE_KEY 已清除；Android KEY* 已映射
```

### 3.1 Windows PC (Tauri)

```powershell
$V = "X.X.X"   # 例：0.8.6
. .\scripts\release\Load-ReleaseEnv.ps1
npm run tauri:build

# 若构建未产出 .sig → 补签（脚本会再清冲突 env）
.\scripts\release\Sign-TauriBundle.ps1 -Version $V

# 硬断言：exe 旁必须有 .sig
$sig = "src-tauri/target/release/bundle/nsis/Lexicon_${V}_x64-setup.exe.sig"
if (-not (Test-Path $sig)) { throw "NO .sig — STOP. Do not write version.json or push." }
```

产物期望路径：
- `src-tauri/target/release/bundle/nsis/Lexicon_${V}_x64-setup.exe` + `.sig`
- `src-tauri/target/release/bundle/msi/Lexicon_${V}_x64_en-US.msi`

> 私钥文件：`src-tauri/lexicon.key`（gitignore）。密码只来自 `.env.release`，**禁止**把密码写进 `workflow.md` / CHANGELOG / 提交信息。

### 3.2 Android (Capacitor / Gradle)

```powershell
$V = "X.X.X"
. .\scripts\release\Load-ReleaseEnv.ps1   # 映射 KEYSTORE_PASSWORD / KEY_PASSWORD
npm run build
npx cap copy android
cd android
.\gradlew.bat assembleRelease   # macOS/Linux: ./gradlew assembleRelease
cd ..
.\scripts\release\Prepare-AndroidApks.ps1 -Version $V
```

Gradle 在 `signingConfigs.release` 中签名；输出在 `android/app/build/outputs/apk/release/`，脚本会拷到仓库根目录的 `Lexicon_${V}_*_signed.apk`（供 `gh release upload`）。

### 3.3 iOS 与 macOS 桌面端（云端自动构建）

无需本地 Mac 电脑。推送 tag `v$V` 后，GitHub Actions 自动触发：
- `.github/workflows/ios-build.yml`：自动编译并把 `Lexicon.ipa` 挂载到 GitHub Release。
- `.github/workflows/macos-build.yml`：自动编译 Tauri macOS 通用安装包（`Lexicon_${V}_universal.dmg` / `.app.zip`）并挂载到 GitHub Release。

### 3.5 构建后硬门禁（正式发版必跑）

在写完 `version.json`、准备好 5 个 APK 根目录拷贝之后、**任何 push / tag / gh release 之前**：

```powershell
.\scripts\release\Assert-ReleaseGates.ps1 -Version $V
# exit 1 → 立刻停，禁止上传
```

---

## 4. 签名与更新检测文件同步 (Signing & Version Manifest)

### 4.1 写入 `version.json`（唯一推荐方式）

先有临时 `release_notes_zh.md` / `release_notes_en.md`（§2），再：

```powershell
$V = "X.X.X"
.\scripts\release\Write-VersionJson.ps1 -Version $V
# 自动：从 .sig 读 signature；url 指向 v$V；UTF-8 **无 BOM**；is_major=false；仅 windows-x86_64
```

**禁止**手写把 `signature` 留成 `PLACEHOLDER` 就 push。  
**禁止**在 `platforms` 中加入 android / ios。

### 4.2 手写时的 BOM 规则（仅应急）

若必须手写 JSON：

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$PWD\version.json", $content, $utf8NoBom)
$b = [System.IO.File]::ReadAllBytes("$PWD\version.json")
if ($b[0] -eq 0xEF) { throw "BOM detected! Fix before pushing." }
```

`Set-Content -Encoding UTF8` 与 `[Text.Encoding]::UTF8` **默认带 BOM**，会导致用户端更新检测静默失败。

### 4.3 同步后自检

```powershell
$sigText = (Get-Content "src-tauri/target/release/bundle/nsis/Lexicon_${V}_x64-setup.exe.sig" -Raw).Trim()
$m = Get-Content version.json -Raw | ConvertFrom-Json
if ($m.platforms.'windows-x86_64'.signature.Trim() -ne $sigText) { throw "signature mismatch" }
if ($m.version -ne $V) { throw "version mismatch" }
```

或直接再跑一遍 `Assert-ReleaseGates.ps1`。

## 5. 代码提交与推送 (Git Commit & Push)

**前置（全部满足才能继续）：**
1. §0 文档门禁已通过  
2. `.\scripts\release\Assert-ReleaseGates.ps1 -Version $V` 已 **exit 0**  
3. 工作区含更新后的 `version.json`（真实 signature，非 PLACEHOLDER）

**不要** `git add .` 一把梭：临时 `release_notes*.md` / `release_notes.txt`、根目录 `*.apk` / `*.exe` 不应入库（后两者已在 `.gitignore`；notes 仍可能被误加）。

```powershell
$V = "X.X.X"
.\scripts\release\Assert-ReleaseGates.ps1 -Version $V
if ($LASTEXITCODE -ne 0) { throw "gates failed — abort commit/push" }

# 显式 add 发版相关源码与文档（按本次实际改动调整）
git add package.json version.json AGENT.md CHANGELOG.md README.md README_en.md `
  src/stores/updateStore.ts src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock `
  android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj
# …以及本轮功能改动的 src/、lexicon-docs/ 等

git commit -m "Release v$V"
git push origin master

# tag 必须在 commit 之后创建再推送（触发 iOS Actions）
git tag "v$V"
git push origin "v$V"
```

## 6. 创建 GitHub Release 并上传全架构产物

**前置**：§5 已 push；`Assert-ReleaseGates.ps1` 仍为通过状态；APK 已在仓库根目录。

**更新日志整合**（临时，勿 commit）：

```powershell
$V = "X.X.X"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$en = (Get-Content release_notes_en.md -Raw).TrimEnd()
$zh = (Get-Content release_notes_zh.md -Raw).TrimEnd()
[System.IO.File]::WriteAllText("$PWD\release_notes.txt", "$en`n`n---`n`n$zh`n", $utf8NoBom)
```

**执行上传**（tag 已存在时用 `gh release create`；若 tag 已由 §5 推送，create 会挂到该 tag）：

```powershell
$V = "X.X.X"
gh release create "v$V" -t "Lexicon v$V" -F release_notes.txt `
  "src-tauri/target/release/bundle/nsis/Lexicon_${V}_x64-setup.exe" `
  "src-tauri/target/release/bundle/msi/Lexicon_${V}_x64_en-US.msi" `
  "Lexicon_${V}_universal_signed.apk" `
  "Lexicon_${V}_arm64-v8a_signed.apk" `
  "Lexicon_${V}_armeabi-v7a_signed.apk" `
  "Lexicon_${V}_x86_signed.apk" `
  "Lexicon_${V}_x86_64_signed.apk"
```

若 Release 已用空资产创建，可改为 `gh release upload "v$V" ...`。

## 7. 最终核验 (Final Verification)

Agent 必须用命令核对，不能只「口头检查」：

```powershell
$V = "X.X.X"
# 本地门禁（构建产物仍在时）
.\scripts\release\Assert-ReleaseGates.ps1 -Version $V

# 远程资产
gh release view "v$V" --json assets --jq '.assets[].name'
# 期望至少含：x64-setup.exe、x64_en-US.msi、5 个 apk；稍后出现 Lexicon.ipa

# iOS & macOS Actions
gh run list --workflow=ios-build.yml --limit 1
gh run list --workflow=macos-build.yml --limit 1
# 失败则排查 Actions 日志，勿声称发版完成

核对清单：
- [ ] `version.json` 的 `version` / `url` / `signature` 与本版 `.sig` 一致，无 BOM，`is_major` 符合用户意图（默认 false）  
- [ ] GitHub Release 含 Windows + Android 产物  
- [ ] iOS 与 macOS workflows 触发成功且产物挂上（或已向用户说明仍在构建）  
- [ ] 向用户回报 Release URL  

全部通过后进入 §8 清理。

## 8. 清理本地构建产物 (Cleanup)
在确认 GitHub Release 已成功发布且所有平台产物（Windows EXE/MSI, Android APKs；建议等 iOS `.ipa` 也挂上）已完整上传后，**务必**清理：

```powershell
$V = "X.X.X"
Remove-Item "Lexicon_${V}_*.apk" -Force -ErrorAction SilentlyContinue
Remove-Item release_notes.txt, release_notes_zh.md, release_notes_en.md -Force -ErrorAction SilentlyContinue
cd android; .\gradlew.bat clean; cd ..
# 建议彻底释放空间（下次 tauri:build 会较慢）：
Remove-Item -Recurse -Force src-tauri\target -ErrorAction SilentlyContinue
```

- **保持环境整洁**：工作区不残留已发布二进制；临时 release notes **不要** commit。  
- **密钥**：`.env.release` / `*.key` / `*.keystore` 永不入库。
