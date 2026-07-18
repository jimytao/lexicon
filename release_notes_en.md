Fix React rendering crash (infinite loop) in AI Chat
1. **Fix**: Resolved a critical React rendering crash (Minified React Error #185) caused by an infinite loop in Zustand selector returning a new empty array reference `[]` on every state evaluation.
