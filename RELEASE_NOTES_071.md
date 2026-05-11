# Lexicon v0.7.1 Patch Notes

## 🛡️ Silent Auto-Update Improvements
- App startup now performs at most one background request to GitHub version.json. If the network is blocked, Lexicon immediately returns to idle without surfacing any dialogs or toasts.
- Manual **Check Update** in Settings still forces a retry and shows detailed error copy, so advanced users can diagnose connectivity issues without impacting everyone else.
- The Update modal is only rendered when a real manifest is available (available / downloading / ready), eliminating the blank “Update now” prompt that previously appeared on offline desktops.

## 🔧 Misc
- `version.json` notes updated for 0.7.1 so auto-updaters receive the correct changelog blurb.
- Android versionCode bumped to 10 to match the 0.7.1 semantic version.
