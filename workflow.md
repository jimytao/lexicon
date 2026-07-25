# Lexicon 自动发布工作流 (AI Agent Workflow)

这是一份写给 AI Agent 的标准操作程序 (SOP)。当你被要求“发布新版本”或“执行发版工作流”时，请严格按照以下步骤进行操作（请确保在终端中有足够的权限执行这些命令，如果没有，请提示人类用户手动执行或授权）。

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
执行以下命令来编译各平台软件：

**Windows PC (Tauri)**
在根目录执行打包命令：
```bash
# 确保设置了签名环境变量（请从本地 .env.release 中获取）
$env:TAURI_SIGNING_PRIVATE_KEY = "src-tauri/lexicon.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $YOUR_SECRET_PASSWORD
npm run tauri:build
```
> [!IMPORTANT]
> **私钥信息**：
> - **位置**：`src-tauri/lexicon.key`
> - **密码**：请查询本地 `.env.release` 文件中的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 字段。
> - **手动签名**：
>   `npx tauri signer sign -f src-tauri/lexicon.key -p <PASSWORD> <EXE_PATH>`

> [!WARNING]
> **`TAURI_SIGNING_PRIVATE_KEY` 的值必须是私钥文件的完整内容（base64 字符串），而不是文件路径字符串。**
> 如果你把它设置为文件路径（如 `"src-tauri/lexicon.key"`），Tauri 会将路径字符串本身当作 base64 私钥来解析，导致签名静默失败、不生成 `.sig` 文件。
> 正确做法是先读取文件内容：
> ```powershell
> $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "src-tauri/lexicon.key" -Raw
> ```
> 如果 `npm run tauri:build` 完成后在 `src-tauri/target/release/bundle/nsis/` 目录下**没有生成 `.sig` 文件**，说明签名失败，需要用上方的手动签名命令补签。

**Android (Capacitor / Gradle)**
构建前确保前端产物已同步，然后进入 `android` 目录执行 Gradle 任务：
```bash
npm run build
npx cap copy android
cd android
./gradlew assembleRelease
cd ..
```
这将在 `android/app/build/outputs/apk/release/` 下生成通用的 Universal APK 和针对不同架构的拆分 APK（ABI splits，例如 arm64-v8a 等）。

**iOS (云端自动构建)**
iOS 端无须本地编译！本仓库配置了 GitHub Actions (`.github/workflows/ios-build.yml`)。只要在后续步骤中推送到带有 `v*` 前缀的 tag（如 `v0.7.6`），云端服务器就会自动拉取最新代码，执行构建并自动将生成的 `.ipa` 文件附加到最新的 GitHub Release 中。

## 4. 签名与更新检测文件同步 (Signing & Version Manifest)
**Windows 签名同步**：Tauri 在打包时会自动使用本地环境变量（如 `TAURI_PRIVATE_KEY`）生成 `.sig` 签名文件。请**务必**读取生成的最新签名文件（例如 `src-tauri/target/release/bundle/nsis/Lexicon_X.X.X_x64-setup.exe.sig`）的文本内容，并将该长字符串更新到根目录 `version.json` 中的 `platforms["windows-x86_64"].signature` 字段。

> [!WARNING]
> **写入 `version.json` 时必须使用无 BOM 的 UTF-8 编码。**
> PowerShell 的 `[System.IO.File]::WriteAllText(path, content, [System.Text.Encoding]::UTF8)` 以及 `Set-Content -Encoding UTF8` **默认会添加 UTF-8 BOM（EF BB BF）**。
> Tauri 更新器使用 Rust 的 `serde_json` 解析 `version.json`，该解析器**严格不接受 BOM**，会静默失败导致 `check()` 返回 `null`，最终用户看到"下载错误"。
> 正确写法（PowerShell）：
> ```powershell
> $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
> [System.IO.File]::WriteAllText("version.json", $content, $utf8NoBom)
> ```
> 写入后可用以下命令验证：
> ```powershell
> $b = [System.IO.File]::ReadAllBytes("version.json")
> if ($b[0] -eq 0xEF) { Write-Error "BOM detected! Fix before pushing." }
> ```

**Android APK 签名**：确保 APK 已经通过 `apksigner` 与本地 Release Keystore 完成签名。密码请查阅本地 `.env.release`。

## 5. 代码提交与推送 (Git Commit & Push)
确保所有版本文件（包含更新后的 `version.json`，确保包含最新的签名信息）已保存。
```bash
git add .
git commit -m "Release vX.X.X"
git push origin master
```

## 6. 创建 GitHub Release 并上传全架构产物
使用 GitHub CLI 自动创建 Release 并上传本地编译完成的所有 PC 和安卓端产物。

**更新日志整合**：
在创建 GitHub Release 前，将本版临时中英文说明合并进同一个临时文件：
1. 读取本轮生成的 `release_notes_en.md`。
2. 添加分隔线 `\n\n---\n\n`。
3. 读取本轮生成的 `release_notes_zh.md`。
4. 写入临时文件 `release_notes.txt`，作为 GitHub Release 的 description（用完可删）。

**上传前准备 (安卓重命名)**：
为了文件名整齐，请将 `android/app/build/outputs/apk/release/` 下的各架构包重命名/拷贝为：
- `Lexicon_X.X.X_universal_signed.apk` (通用包)
- `Lexicon_X.X.X_arm64-v8a_signed.apk`
- `Lexicon_X.X.X_armeabi-v7a_signed.apk`
- `Lexicon_X.X.X_x86_signed.apk`
- `Lexicon_X.X.X_x86_64_signed.apk`

**执行上传命令**：
```bash
# 1. 创建 Release 标签和说明（使用整合后的中英文说明文件 release_notes.txt）
gh release create vX.X.X -t "Lexicon vX.X.X" -F release_notes.txt

# 2. 上传 Windows 产物 (exe 和 msi)
gh release upload vX.X.X src-tauri/target/release/bundle/nsis/Lexicon_X.X.X_x64-setup.exe
gh release upload vX.X.X src-tauri/target/release/bundle/msi/Lexicon_X.X.X_x64_en-US.msi

# 3. 上传 Android 全架构产物 (5个文件)
gh release upload vX.X.X Lexicon_X.X.X_universal_signed.apk Lexicon_X.X.X_arm64-v8a_signed.apk Lexicon_X.X.X_armeabi-v7a_signed.apk Lexicon_X.X.X_x86_signed.apk Lexicon_X.X.X_x86_64_signed.apk
```
*(注意：请根据当前版本号 X.X.X 动态调整文件名)*

## 7. 最终核验 (Final Verification)
- 检查 `version.json` 中的 `version` 是否正确。
- 检查 `version.json` 中的 `signature` 是否确实替换为了最新编译出的 Tauri 签名。
- 检查 GitHub Release 是否创建成功，并且包含了本地上传的 `.exe` 和 `.apk` 文件。
- 检查 GitHub Actions 是否已成功触发并正在构建 iOS `.ipa`。
- 一切无误后，发版流程结束，向人类用户汇报成功。

## 8. 清理本地构建产物 (Cleanup)
在确认 GitHub Release 已成功发布且所有平台产物（Windows EXE/MSI, Android APKs）已完整上传后，**务必**执行清理操作以释放本地空间：

- **删除所有发布产物**：删除根目录下以及各编译目录（如 `src-tauri/target/release/bundle/` 和 `android/app/build/outputs/apk/release/`）中生成的所有 `.exe`, `.msi`, `.apk` 及 `.sig` 文件。
- **清理编译缓存**：执行 `cd android && ./gradlew clean` 以清理安卓编译产物，并建议清理 `src-tauri/target` 目录以彻底释放空间。
- **保持环境整洁**：确保工作区内没有任何已发布的二进制安装包残留，仅保留源码。
