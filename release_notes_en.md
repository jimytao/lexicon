Fix iOS context bulb visibility and Settings↔Search freezes / black screens
1. **Fix**: AI Chat rich-context bulb was scrolled off-screen on iOS keyboard show; use nearest scroll and move the single bulb beside the input.
2. **Fix**: Local-dictionary AI mode never passed enrichedContext, so the bulb never appeared on that path.
3. **Fix**: Any settingsStore update incorrectly unloaded both sql.js dictionaries (30–46MB); only activeDictionary changes invalidate caches now.
4. **Improve**: In-flight load dedupe, epoch/gate invalidation without deadlock, and warm up only the active dictionary after first paint.
5. **Improve**: Keep Dict/Image/Settings tabs mounted after first visit (hidden toggle) to avoid expensive remount jank.
