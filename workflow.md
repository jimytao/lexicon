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
- **`version.json`**: `"version": "X.X.X"`

### 移动端 (Mobile)
- **Android**: 修改 `android/app/build.gradle`，自增 `versionCode` 并更新 `versionName` 为新的 "X.X.X"。
- **iOS**: 修改 `ios/App/App.xcodeproj/project.pbxproj` 中的 `MARKETING_VERSION` 为 "X.X.X"，并同步自增 `CURRENT_PROJECT_VERSION` (建议与 Android 的 `versionCode` 保持一致)。

> [!IMPORTANT]
> **修改顺序**：必须先完成上述所有文件的版本修改，然后再执行后续的 `npm run build` 或打包流程。否则，打包出的二进制文件内部仍可能显示旧版本号。

## 2. 提取更新日志与重大版本判定 (Changelog & Major Flag)
打开根目录下的 `CHANGELOG.md`，读取最顶部（即刚刚由人类或 AI 更新的最新一条）的中文更新说明。
将提取出的中文说明填入 `version.json` 的 `"notes"` 字段中。
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

**Android APK 签名**：确保 APK 已经通过 `apksigner` 与本地 Release Keystore 完成签名。密码请查阅本地 `.env.release`。

## 5. 代码提交与推送 (Git Commit & Push)
确保所有版本文件（包含更新后的 `version.json`，确保包含最新的签名信息）已保存。
```bash
git add .
git commit -m "Release vX.X.X"
git push origin master
```

## 6. 创建 GitHub Release 并上传全架构产物
使用 GitHub CLI 自动创建 Release 附带更新日志，并上传本地编译完成的所有 PC 和安卓端产物。

**上传前准备 (安卓重命名)**：
为了文件名整齐，请将 `android/app/build/outputs/apk/release/` 下的各架构包重命名/拷贝为：
- `Lexicon_X.X.X_universal_signed.apk` (通用包)
- `Lexicon_X.X.X_arm64-v8a_signed.apk`
- `Lexicon_X.X.X_armeabi-v7a_signed.apk`
- `Lexicon_X.X.X_x86_signed.apk`
- `Lexicon_X.X.X_x86_64_signed.apk`

**执行上传命令**：
```bash
# 1. 创建 Release 标签和说明
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
