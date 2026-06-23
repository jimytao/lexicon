# Lexicon — Feature & Cleanup Work Plan
> Last updated: 2026-06-22. This is the authoritative checklist; tick items off as they are completed.

---

## STATUS KEY
- `[ ]` Not started
- `[x]` Completed
- `[~]` In progress

---

## PART 0 — Dead Code Cleanup (嵌字模块 残留)

The image-overlay / text-embed (嵌字) module was removed from the UI but left orphaned files and dead code throughout the codebase. These must be cleaned first to avoid confusion.

### 0-A: Delete entire files
- [ ] `src/components/ImageTranslate/ImageEditor.tsx` — Konva.js canvas editor, ~1 100 lines, not imported anywhere
- [ ] `src/components/ImageTranslate/ExportButton.tsx` — export button for ImageEditor, not imported anywhere
- [ ] `src/components/ImageTranslate/BlockStylePanel.tsx` — text-block style panel, only "imported" via TranslationList which never activates it; becomes orphaned after 0-B
- [ ] `src/services/ocr.ts` — Tesseract.js OCR pipeline for Phase-2 embed, not called from any active code

### 0-B: Remove dead code from existing files

**`src/components/ImageTranslate/TranslationList.tsx`**
- Remove `import { BlockStylePanel } from './BlockStylePanel'`
- Remove unused props: `onUpdateBlock?`, `selectedIndex?`, `onSelect?`, `onDeselect?`, `onDrawL1?`
- Remove dead JSX: `BlockStylePanel` render block (`{isSelected && onUpdateBlock && ...}`)
- Remove dead JSX: `onDrawL1` render block (重绘遮罩 button)
- Remove `isSelected` variable and click-selection logic

**`src/services/ai.ts`** — remove all dead image-embed functions
- Remove `IMAGE_TRANSLATE_FULL_PROMPT` constant (only used by deprecated funcs below)
- Remove `aiImageTranslateFull()` function (`@deprecated`, not imported anywhere)
- Remove `aiImageTranslate()` function (`@deprecated`, not imported anywhere)
- Remove `IMAGE_LOCATE_PROMPT` constant
- Remove `aiImageLocateBubbles()` function (not imported anywhere)
- In `callImageTranslateAPI()`: simplify parsed type — remove `TextRegion[]` branch, only keep `TextBlock[]`

**`src/types/index.ts`** — remove dead types
- Remove `TextRegion` interface (image-editor layer system)
- Remove `L1Polygon` interface
- Remove `L2Text` interface
- Remove `ImageTranslation` interface
- Simplify `TextBlock` interface — keep only active fields:
  - **KEEP**: `original`, `translation`, `type`, `direction`, `bbox`, `polygon`, `rotation`
  - **REMOVE** (all image-editor rendering/styling fields): `colorHue`, `colorSaturation`, `colorOpacity`, `l1ColorHue`, `l1ColorSaturation`, `l1ColorOpacity`, `textColor`, `fontSizeMode`, `fontSizeCustom`, `fontSizeMultiplier`, `fontFamilyCustom`, `fontWeight`, `fontStyle`, `textAlign`, `lineHeight`, `strokeEnabled`, `strokeColor`, `strokeWidth`, `fillColorMode`, `fillColorCustom`, `fillOpacity`, `maskShape`, `magicMaskUrl`, `magicMaskBbox`

**`src/stores/imageStore.ts`**
- Remove `FONT_OPTIONS` export constant
- Remove `fontFamily` field from `ImageState` + initial state
- Remove `setFontFamily` method
- Remove `bboxReady` field from `ImageEntry` + all `bboxReady` parameter usage in setBlocksAt/setBlocks
- Remove unused methods: `nextImage`, `prevImage`, `addBlock`, `deleteBlock`
- Remove non-At setter variants that are never called: `setImageBase64`, `setBlocks`, `setStatus`
- Update `setBlocksAt` signature: remove `bboxReady` parameter

---

## PART 1 — UI Internationalisation (i18n)

### 1-A: Create i18n system

**New file: `src/i18n/index.ts`**
```ts
export type AppLanguage = 'zh' | 'en'

// Complete translation map — add ALL keys here as you encounter them
export const translations: Record<AppLanguage, Record<string, string>> = {
  zh: { ... },
  en: { ... },
}

// Hook — reads appLanguage from settingsStore
export function useT(): (key: string) => string
```

Translation key naming convention: `<component>.<key>` e.g. `chat.send`, `module.dictionary`, `image.uploadHint`.

### 1-B: Add `appLanguage` to settings store

**`src/stores/settingsStore.ts`**
- Add `appLanguage: 'zh' | 'en'` (default: `'en'`)
- Add `setAppLanguage: (v: 'zh' | 'en') => void`

### 1-C: Replace all hardcoded Chinese UI strings

Go through every file in the list below, import `useT()`, and replace each Chinese string with `t('key')`.

**Files and their Chinese strings:**

| File | Chinese strings to replace |
|---|---|
| `ImageTranslate/index.tsx` | Language selector labels (自动检测→Auto, 日语→Japanese…), upload hint, button labels (翻译中/开始翻译全部/重新翻译全部/删除/清空/重试), 重置视图, 未检测到文字 |
| `ImageTranslate/TranslationList.tsx` | 音效/标注/对话, 竖排/横排, 多边形遮罩, 输入译文, 未检测到文字 |
| `ImageTranslate/BlockStylePanel.tsx` | (to be deleted in 0-A — i18n not needed) |
| `AiSection/AiChatBox.tsx` | AI 问答, 思考中, 输入问题, 发送, 出错了 |
| `AiSection/AiStatusBar.tsx` | All Chinese error/status messages |
| `AiSection/EtymologyCard.tsx` | 词根词缀, AI 解析, 记忆锚点 |
| `AiSection/MnemonicCard.tsx` | 词源逻辑/趣味故事/智能联想, 生成助记, loading/error text, 换一个, 提议/取消/提交想法, textarea placeholder |
| `AiSection/PracticeSection.tsx` | 练习, AI 生成, 生成练习, 场景 {n}, 评分中/提交/不错！/参考/重新作答 |
| `AiSection/SynonymList.tsx` | 近/反义词 section headings and tab labels |
| `AiSection/SemanticScene.tsx` | 语义情景, AI 解析, 展开/折叠 |
| `ResultView/index.tsx` | 切换 AI mode hint text |
| `ResultView/PhraseView.tsx` | AI 查询 · 词组/句子, 你输入的是, 释义, 使用场景, 文化背景 |
| `ResultView/AiFullView.tsx` | AI 查询, 你输入的是, 文化背景 |
| `ResultView/PhraseExercises.tsx` | 练习, 场景 {n}, 用英文表达, 评分中/提交/不错！/参考/重新作答 |
| `InstantSection/MeaningList.tsx` | 收起/展开更多, 查看图片释义/收起图片释义, loading/error image text |
| `InstantSection/ExampleList.tsx` | 收起/展开更多 |
| `InstantSection/PhrasesSection.tsx` | 相关词组, 展开全部/收起 |
| `SearchBar/HistoryList.tsx` | AI 结果已缓存 SVG title |
| `SuggestList/index.tsx` | AI 结果已缓存 SVG title |
| `ErrorBoundary.tsx` | 页面渲染出错, 未知错误 |
| `Settings/SettingsView.tsx` | Provider names: 智谱 GLM, 零一万物, 自定义 |
| `services/ai.ts` `testConnection()` | 未填写 API Key/Endpoint, error hint strings, 连接成功 |
| `stores/imageStore.ts` | FONT_OPTIONS labels (快乐体/马善政/龙藏/默认黑体), default targetLang `'中文'` |
| `stores/settingsStore.ts` | Module labels (see Part 2 for correct English names) |

### 1-D: Add App Language toggle to Settings UI

**`src/components/Settings/SettingsView.tsx`**
- Add new section above Dark Mode:
  ```
  App Language
  "Controls UI display language — does not affect lookup content"
  [中文]  [English]   ← segment control styled like Default Mode
  ```

---

## PART 2 — New Feature: Chunks & Collocations Module

### 2-A: Add types

**`src/types/index.ts`**
```ts
export interface CollocationEntry {
  chunk: string   // e.g. "take the tram" / "black tea"
  note?: string   // brief usage note (language matches monolingualWord setting)
}

export interface CollocationData {
  chunks: CollocationEntry[]        // Verb/prep patterns using the word (语块)
  collocations: CollocationEntry[]  // Natural word combinations (搭配)
}
```
- Extend `AiAnalysis`: add `collocations?: CollocationData`
- Extend `AiFullResult`: add `collocations?: CollocationData`

### 2-B: Add module to settings store

**`src/stores/settingsStore.ts`** — insert into DEFAULT_MODULES array (after `dictionary`, before `synonyms`):
```ts
{ id: 'collocations', label: 'Chunks & Collocations', enabled: true }
```
Also update `getConfig()` defaultModules in `services/ai.ts` to include `'collocations'`.

### 2-C: Extend AI prompts

**`src/services/ai.ts`**

In `getSystemPrompt(modules, includeExamples)` — when `isEnabled('collocations')`, append to schema:
```json
"collocations": {
  "chunks": [
    { "chunk": "take the tram", "note": "most common verb pattern" }
  ],
  "collocations": [
    { "chunk": "tram stop", "note": "compound noun" }
  ]
}
```
Rules to add:
- `chunks`: 4–6 common verb+noun or prep+noun patterns using this word (语块)
- `collocations`: 4–6 natural word combinations (adj+noun, noun+verb)
- `note` should match the monolingual setting language

In `getFullLookupPrompt()` — add the same schema block for English words.

### 2-D: Create CollocationCard component

**New file: `src/components/ResultView/AiSection/CollocationCard.tsx`**

Layout:
- Section header: `CHUNKS & COLLOCATIONS` label with compass/link icon
- Two sub-sections (labels: `CHUNKS` / `COLLOCATIONS`)
- Each item rendered as a pill/tag badge
  - Pill text: `chunk`
  - Tooltip or sub-text for `note` (if present)
- Colors: chunks → purple-ish, collocations → teal-ish (consistent with existing section color scheme)

### 2-E: Wire into result views

**`src/components/ResultView/index.tsx`**
- Add `case 'collocations':` in the module switch — render `<CollocationCard collocations={aiAnalysis?.collocations} />`

**`src/components/ResultView/AiFullView.tsx`**
- Add `case 'collocations':` — render `<CollocationCard collocations={aiFullResult?.collocations} />`

> Note: `PhraseView` has `default: return null` so it naturally skips this module — no change needed there.

---

## PART 3 — New Feature: Monolingual Mode (Three Independent Toggles)

### 3-A: Add to settings store

**`src/stores/settingsStore.ts`**
```ts
monolingualWord:     boolean   // default: false — single word queries
monolingualPhrase:   boolean   // default: false — phrase queries
monolingualSentence: boolean   // default: false — sentence queries
setMonolingualWord:     (v: boolean) => void
setMonolingualPhrase:   (v: boolean) => void
setMonolingualSentence: (v: boolean) => void
```

### 3-B: Add to AiConfig

**`src/services/ai.ts`** — `AiConfig` interface + `getConfig()`:
```ts
monolingualWord: boolean
monolingualPhrase: boolean
monolingualSentence: boolean
```
Read these from `localStorage['lexicon-settings']`.

### 3-C: Modify AI prompts

**For `monolingualWord` (single word queries):**

`getSystemPrompt(modules, includeExamples, monolingualWord)`:
- When `monolingualWord === true`:
  - Change system role description: "for learners who prefer English-only monolingual explanations"
  - Schema for `meanings[i].zh`: change to `"English meaning with context prefix, e.g. '(of a goal) a feeling of satisfaction'"`
  - Schema for `scene.label`: change to `"2-4 word English context tag"`
  - Schema for `scene.description`: change to `"1-3 sentences in English: when this meaning occurs, tone, and how it differs"`
  - Schema for `etymology.parts[i].meaning`: change to `"meaning in English"`
  - Schema for `etymology.story`: change to `"in English"`
  - Schema for `synonyms[i].distinction` / `antonyms[i].distinction`: change to `"English nuance explanation"`
  - Add rule: `"ALL output text must be in English only. No Chinese characters anywhere."`

`buildUserPrompt(word, meanings, includeExamples, monolingualWord)`:
- When `monolingualWord === true`: pass only `en` field from meanings:
  ```
  1. EN: a feeling of contentment when something is achieved
  ```

`getFullLookupPrompt(modules, lang, ..., monolingualWord)`:
- When `monolingualWord && lang === 'en'`: same schema changes as `getSystemPrompt`.

**For `monolingualPhrase` / `monolingualSentence` (phrase & sentence queries):**

`getPhrasePrompt(modules, lang, ..., monolingualPhrase)`:
- When `monolingualPhrase` (or sentence):
  - ALL output in English
  - Add extra rule: `"Use simple, learner-friendly English vocabulary (CEFR B1–B2 level max). Avoid idioms or advanced expressions in explanations. Your readers are learners, not native speakers."`

### 3-D: Modify display components

**`src/components/ResultView/InstantSection/MeaningList.tsx`**
- Import `monolingualWord` from `useSettingsStore()`
- When `monolingualWord === true`:
  - Show `m.en` as the primary (large, bold) text
  - Hide `m.zh` entirely
  - Fallback: if `m.en` is empty, show `m.zh` (defensive)

**`src/components/ResultView/InstantSection/ExampleList.tsx`**
- Import `monolingualWord` from `useSettingsStore()`
- When `monolingualWord === true`: hide `ex.zh`

**`src/components/ResultView/PhraseView.tsx`**
- Import `monolingualPhrase`, `monolingualSentence`, `queryType` (from `useSearchStore`)
- When the relevant toggle is true: hide `ex.zh` in examples; `meaning` / `usageScenes` will be in English from the AI (per 3-C above, no UI code change needed beyond hiding zh)

### 3-E: Add toggles to Settings UI

**`src/components/Settings/SettingsView.tsx`** — add below the existing settings toggles:

```
Monolingual Mode
"Hide Chinese in results. Phrase/sentence mode also uses simpler English in AI explanations."

  Word queries      [toggle]
  Phrase queries    [toggle]  
  Sentence queries  [toggle]
```

### 3-F: Cache invalidation

**`src/hooks/useAiLookup.ts`**
- In `trigger()`: when checking cache, also require that the cached result was generated with the same `monolingualWord` value (add a suffix to the cache key, or skip cache when mode differs)
- Same for `triggerPhraseQuery()` with `monolingualPhrase`/`monolingualSentence`

---

## PART 4 — New Feature: Preposition Spatial Imagery

For phrase queries that contain prepositions, show a dedicated card explaining the spatial/conceptual imagery behind each preposition's role in the phrase. Has a per-preposition "Regenerate" button (identical pattern to MnemonicCard).

### 4-A: Add types

**`src/types/index.ts`**
```ts
export interface PrepSpatialItem {
  preposition: string        // e.g. "UP"
  coreIdea: string          // e.g. "Increase · Completion · Creation"
  phraseExplanation: string  // 2-3 sentences: how this preposition's meaning
                             //   shapes THIS specific phrase (e.g. "set up an account")
  smartAssoc: string         // 1-sentence quick visual summary
}

export interface PrepSpatialData {
  items: PrepSpatialItem[]
}
```
- Extend `PhraseResult`: add `prepSpatial?: PrepSpatialData` (generated on-demand, NOT in initial query)

### 4-B: Utility function

**New file: `src/utils/prepDetect.ts`**
```ts
// Prepositions that have documented spatial imagery in our reference material.
// AI is free to handle any OTHER preposition not in this set — it should
// apply its own spatial reasoning for prepositions like AT, WITH, BY, FROM, etc.
const PRIMARY_SPATIAL_PREPS = new Set([
  'up','out','off','on','over','in','into','down',
  'back','through','away','around','for'
])

// Broader detection set — detects common prepositions worth explaining
const ALL_PREPS = new Set([
  'up','out','off','on','over','in','into','down','back','through',
  'away','around','for','at','with','by','from','to','about',
  'between','after','before','along','against','across','onto',
  'toward','towards','under','without','within','beyond','beside',
  'beside','beneath','below','above','near','behind','inside',
  'outside','except','past','since','during','until','upon','per'
])

/**
 * Returns uppercase prepositions found in the phrase.
 * Prioritises the well-documented spatial set, falls back to broader set.
 * @param phrase  The phrase/sentence to scan
 * @param limit   Maximum number of prepositions to return (default 3)
 */
export function detectSpatialPreps(phrase: string, limit = 3): string[]
```

### 4-C: AI function

**`src/services/ai.ts`** — add `generatePrepImagery()`:

```ts
export async function generatePrepImagery(
  phrase: string,
  prepositions: string[],
  signal?: AbortSignal
): Promise<PrepSpatialData>
```

**System prompt** (embed Julian.docx reference data inline):
```
You are an expert in English preposition spatial imagery and phrasal verb analysis.

REFERENCE — Core spatial imagery for common prepositions:
UP: Increase · Completion · Improvement · Creation (something moving upward, becoming more complete)
OUT: Reveal · Remove · Exhaust · Distribute (moving from inside to outside)
OFF: Separation · Removal · Disconnection (taking something away or losing connection)
ON: Connection · Continuation · Activation (attaching or keeping something running)
OVER: Transfer · Review · Repetition · Completion (crossing from one side to another)
IN: Entering · Inclusion · Participation (entering a space or group)
INTO: Transformation · Entry (entering and changing state)
DOWN: Reduction · Recording · Stabilisation (moving lower, settling, writing something permanent)
BACK: Return · Response (going back to a previous state or replying)
THROUGH: Completion Through Difficulty (persisting to the end of a challenge)
AWAY: Distance · Continuous Action (moving or continuing action at a distance)
AROUND: Movement Without Direct Progress · Flexibility (circling, exploring, not committed to one direction)
FOR: Purpose · Seeking (directed toward a goal)

NOTE: For any preposition NOT in this list, apply your own spatial reasoning based on native-speaker intuition.

For the given phrase and its prepositions, explain:
1. The core spatial/conceptual image of each preposition
2. How that image specifically shapes the meaning of this phrase
3. A concise smart association

Return ONLY valid JSON. No markdown, no extra text.

Schema:
{
  "items": [
    {
      "preposition": "UP",
      "coreIdea": "Increase · Completion · Creation",
      "phraseExplanation": "2-3 sentences explaining how UP's imagery applies to THIS phrase",
      "smartAssoc": "1-sentence quick visual summary of the phrase's preposition usage"
    }
  ]
}

Rules:
- items must contain ONE entry PER preposition in the input list, in the same order
- phraseExplanation must reference the specific phrase, not just the preposition in isolation
- smartAssoc should be a memorable one-liner (can use emoji or → notation)
- Keep language clear and learner-friendly (CEFR B2 level)
- Return ONLY the JSON object
```

**User prompt**: `Phrase: "${phrase}"\nPrepositions to explain: ${prepositions.join(', ')}\n\nReturn the JSON.`

### 4-D: Create PrepImageryCard component

**New file: `src/components/ResultView/AiSection/PrepImageryCard.tsx`**

Behaviour mirrors `MnemonicCard.tsx`:
- Initially shows a "Generate Spatial Imagery" button (no AI call until clicked)
- On click: calls `generatePrepImagery(phrase, detectedPreps)` → stores result in local state
- Renders one sub-card per preposition:
  - Badge: preposition name (e.g. `UP`)
  - Core idea line (styled faintly)
  - `phraseExplanation` text
  - `smartAssoc` italic line with ⚡/🧭 icon
  - "Regenerate" button (re-calls for just this one preposition)
- Loading state: spinner overlay
- Error state: retry button

State management: component-local (same as MnemonicCard), no store needed.

Regenerate single preposition: calls a new helper `regenerateSinglePrepItem(phrase, preposition, currentContent)` that re-generates only that item.

### 4-E: Add module to settings store

**`src/stores/settingsStore.ts`** — insert into DEFAULT_MODULES (after `mnemonic`, before `examples`):
```ts
{ id: 'preposition', label: 'Prep. Imagery', enabled: true }
```

### 4-F: Wire into PhraseView

**`src/components/ResultView/PhraseView.tsx`**
- Add `case 'preposition':` in the module switch:
  ```tsx
  case 'preposition': {
    const preps = detectSpatialPreps(phraseResult.phrase)
    if (preps.length === 0) return null
    return <PrepImageryCard phrase={phraseResult.phrase} prepositions={preps} />
  }
  ```

> ResultView and AiFullView have `default: return null` for unknown module IDs — no change needed.

---

## PART 5 — Monolingual Mode Cache Key Fix (follow-up to Part 3)

After Part 3 is complete, verify that switching monolingual mode on/off correctly bypasses cached results for AI queries. The cache keys in `resultStore` should include the active monolingual flags.

Implementation options:
- A) Append `_mono` suffix to cache key when monolingualWord is true
- B) Clear the relevant cache entries whenever a monolingual flag changes (watcher in settingsStore)

Option B is simpler. In `settingsStore`:
```ts
setMonolingualWord(v) {
  set({ monolingualWord: v })
  useResultStore.getState().clearAiCache()  // clear AI analysis cache
}
```
(Same for `setMonolingualPhrase`, `setMonolingualSentence`.)

---

## IMPLEMENTATION ORDER (recommended)

```
Sprint 1 — Cleanup + i18n foundation
  1. PART 0: Delete dead files + clean existing files
  2. PART 1-A & 1-B: Create i18n system + add appLanguage to store
  3. PART 1-C: Replace Chinese strings (batch-edit all files in table)
  4. PART 1-D: Add Language toggle to Settings

Sprint 2 — Collocations module
  5. PART 2-A: types
  6. PART 2-B: settings module
  7. PART 2-C: AI prompt schema
  8. PART 2-D: CollocationCard component
  9. PART 2-E: wire into ResultView + AiFullView

Sprint 3 — Monolingual mode
  10. PART 3-A/B: store + AiConfig
  11. PART 3-C: AI prompt modifications
  12. PART 3-D: MeaningList + ExampleList + PhraseView display changes
  13. PART 3-E: Settings UI toggles
  14. PART 5: Cache invalidation

Sprint 4 — Preposition Imagery
  15. PART 4-A: types
  16. PART 4-B: prepDetect.ts utility
  17. PART 4-C: generatePrepImagery() in ai.ts
  18. PART 4-D: PrepImageryCard component
  19. PART 4-E: settings module
  20. PART 4-F: wire into PhraseView
```

---

## NOTES

- **AI prompt language**: All AI prompts are written in English regardless of appLanguage setting. The appLanguage setting ONLY affects UI chrome (labels, buttons, headings). Dictionary content (meanings, examples, AI-generated text) respects monolingualWord/Phrase/Sentence settings instead.
- **Module system compatibility**: `normalizeModules()` in settingsStore already handles inserting new module IDs for existing users — no migration needed when adding `collocations` and `preposition` modules.
- **TextBlock simplification**: After removing editor fields from TextBlock, the `aiImageTranslateFast` response will include unknown fields in its JSON — the `JSON.parse` + type assertion is fine; extra fields are simply ignored at runtime.
- **Preposition detection breadth**: `detectSpatialPreps` limits to 3 prepositions by default to keep the card concise. Raise the limit if needed. For prepositions outside the 13 documented in the reference material, the AI system prompt instructs the model to apply its own spatial reasoning — no hardcoded fallback required.
