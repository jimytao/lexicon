Implement Mobile Native SQLite Storage and Fix Critical Queries, Build, and Sync Bugs
1. **New**: Integrated native SQLite storage via @capacitor-community/sqlite on mobile platforms with seamless fallback to sql.js.
2. **Fixed**: Refactored the query runner to return standard object records, completely eliminating fields mismatch and blank definitions on native devices due to unordered dictionary serialization.
3. **Fixed**: Replaced Windows backslashes with Unix forward slashes in Package.swift to solve SPM dependency compile failures on macOS.
4. **Fixed**: Repositioned iOS header row filtering logic to prevent it from becoming unreachable under native environment.
5. **Optimized**: Redesigned database startup checking to copy asset files only when the mandatory bilingual dictionary is missing, avoiding redundant copying of 80MB files.
6. **Optimized**: Enhanced MDX parser scripts to recursively resolve and bake @@@LINK redirects at build time, enabling full suggestions and lookup support for plural and tense inflections.
