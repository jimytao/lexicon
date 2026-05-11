# Lexicon v0.7.2 Patch Notes

## ✨ Visual Layer Fixes
- Removed redundant opaque backgrounds in `App.tsx` so the bg-grid texture and radial lighting layers are visible again on both light and dark themes.
- Tuned the global radial gradients in `index.css` (0.06 / 0.15 opacity) to restore the intended glow effect without overpowering content.
- Simplified duplicated `.glass` / `.segmented-control` styles, ensuring the header glass now blurs live content instead of showing a flat fill.

## 📱 Android
- Bumped `versionCode` to **11** (matching semantic `0.7.2`) for Play Store / sideload consistency.

## 📦 Metadata
- `version.json` and all manifests now reference **0.7.2**, so Tauri auto-updaters and manual downloads will see the hotfix changelog immediately.
