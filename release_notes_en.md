Fix PC text overflow, optimize AI long-text full translation prompt, and add UI text folding controls.
1. **Fix**: Resolved text and URL overflow issues on PC/Webview platforms by enforcing `break-words` and `overflow-wrap: anywhere` across title, diff, and container elements.
2. **Optimize**: Enhanced AI phrase/sentence query prompt rules so that long-text or multi-sentence queries require full sentence-by-sentence translation, preventing single-sentence summary shortcuts.
3. **New**: Integrated UI gradient collapse and expand controls for long original texts and long translation results.
