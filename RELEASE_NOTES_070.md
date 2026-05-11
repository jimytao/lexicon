# Lexicon v0.7.0 Major Update

## ✨ 核心亮点

- **跨平台自动更新系统**：桌面版集成 Tauri Updater，移动端新增 APK 流式下载+安装引导，iOS 自动跳转 Release 页面。
- **安全分发基础设施**：启用 Ed25519 签名，新增 `version.json` 版本清单，支持 GitHub Raw 分发与强制更新预留字段。
- **Premium 视觉重构**：引入 Indigo/Sky Blue 科技配色、全局 Neo-Glass 毛玻璃、bg-grid 背景纹理以及沉浸式更新弹窗。
- **性能模式开关**：老设备可一键关闭重型视觉效果，专注性能。
- **设置页更新入口**：显示当前版本并可手动触发检查更新。

## 文件改动焦点

- `src/components/Settings/SettingsDrawer.tsx`
- `src/components/Settings/UpdateModal.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/stores/settingsStore.ts` / `src/stores/updateStore.ts`
- `src-tauri/src/lib.rs`、`src-tauri/tauri.conf.json`、`version.json`

## 构建产物

- Android APK：Universal + 4 个 ABI Split
- Windows 桌面端：NSIS EXE、MSI
