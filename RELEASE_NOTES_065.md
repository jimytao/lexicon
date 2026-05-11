# Lexicon v0.6.5 补丁说明

## 更新亮点

- **Module Management 排序补强**：移动端现在可以通过常驻的三横杠手柄拖拽模块排序，桌面端依旧保留 hover 后才可点击的上下按钮；拖拽加入触控延迟与距离阈值，避免误触。
- **拖拽反馈优化**：拖拽时行卡片会半透明 + 边框高亮，手柄在按下/拖动时也会有强调色反馈，排序入口更易发现。
- **历史记录即时可见**：搜索触发后立即写入一条 history，使输入框重新聚焦时能立刻看到最新记录，不再等异步查询结束。
- **历史键统一 `trim`**：`historyStore` 在 `add / upgrade / remove` 时统一 `trim()` 并忽略空字符串，避免 "apple" 与 " apple " 被当成两条记录。

## 受影响文件

- `src/components/Settings/SettingsDrawer.tsx`
- `src/hooks/useSearch.ts`
- `src/stores/historyStore.ts`
- `CHANGELOG.md`

## 构建产物

- Android APK（含 Universal 与 ABI 分包）
- Windows NSIS EXE 安装包
- Windows MSI 安装包
