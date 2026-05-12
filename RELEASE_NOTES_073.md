# Lexicon v0.7.3 Patch Notes

## ✨ Premium Visual Overhaul
- Upgraded Glassmorphism to diagonal linear gradient + `saturate(200%) blur(28px)` with 3D box-shadow and inset highlight border for stronger depth.
- Boosted ambient radial gradients (indigo + sky + pink) in `index.css` for a more vivid, layered backdrop.

## 🔄 Update Robustness
- Added jsDelivr CDN mirrors (`cdn.jsdelivr.net`, `gcore.jsdelivr.net`) as fallback endpoints in both `tauri.conf.json` and `updateStore.ts`, ensuring version-check works on restricted networks (e.g. mainland China).
- Auto-check still runs silently once per launch; manual retry still available in Settings.

## 💬 AI Chat UX
- Follow-up questions now trigger a smooth auto-scroll to the bottom of the chat so users immediately see the new query and AI thinking state.
- Streaming AI responses do **not** force-scroll, preserving user reading position.

## ⚡ Performance Mode Refinement
- Removed the blanket `transition-duration: 0.01s` override. Only `backdrop-filter`, heavy `box-shadow`, and glow layers are stripped; lightweight hardware-accelerated animations (press scale, hover lift) are preserved.
