# Lexicon UI/UX Design System & Implementation Guide

## 1. Core Philosophy: Intentionality & Structure
This design system is built upon the philosophies outlined in Apple's HIG and Microsoft Fluent 2. We do not design components by visual instinct; we design by function and hierarchy.

Every screen and component must answer:
1. **Hierarchy (主次关系)**: What is the single most important action or piece of information?
2. **Harmony (视觉和谐)**: Do margins, paddings, and border radii mathematically align across nested containers?
3. **Consistency (语义一致性)**: Is the visual language strictly mapped to its interaction type? (e.g. Buttons vs Toggles vs Links)

---

## 2. Navigation & Page Architecture

### 2.1 Bottom Navigation Bar (3-Tab Layout — current)
Lexicon uses a floating iOS-pill style **3-tab** bottom navigation (all labels via i18n `nav.*`):
- **`Dict`** (`dictionary`): Core search, dictionary lookup, AI deep analysis, and Mode 3 Core exploration.
- **`Image`** (`translate`): Camera & photo OCR text translation.
- **`Settings`** (`settings`): AI Providers, Search Behavior, Appearance, and System Preferences.

> **SHELVED — Memory / Weakness Board**: `MemoryView` + `AILearningDigestCard` remain in the codebase but are **not mounted**. Do not re-add a fourth tab or place the digest card on the home empty state until product explicitly re-enables it. Profile backend + Settings Profile modal stay active.

### 2.2 Home Empty State Purity Rule
The main search page (`dictionary` tab) in its empty/unqueried state MUST remain 100% minimalist and distraction-free:
- **Icon**: Centered Book icon (SVG in `App.tsx`, accent soft tile — not emoji).
- **Placeholder Text**: Centered 2-line placeholder (`max-w-[270px] text-center leading-relaxed mx-auto text-xs font-medium text-foreground-muted/70`).
- **No Floating Cards**: Diagnostic cards, weak-point dashboards, or heavy widgets MUST NOT be placed on the home empty state.

---

## 3. Container & Grouping Rules (Anti-"Box-in-Box" & No Glowing Aura)

### 3.1 The "Card-in-Card" Antipattern
Placing an isolated, bordered, padded component inside a parent container that is also bordered and padded leads to inconsistent content widths and chaotic margins.

**❌ BAD (Box-in-Box)**
```tsx
// Parent Group
<div className="p-4 border rounded-2xl">
  // Child Component
  <div className="p-4 border rounded-2xl bg-gray-50">
     Content
  </div>
</div>
```

**✅ GOOD (Flush / Surface Level)**
Components inside a Group (like Accordions or List Items) must be *flush* with the parent's padding, or the parent should manage padding exclusively.
```tsx
// Parent Group
<div className="rounded-2xl border bg-background-soft/20 py-2 overflow-hidden">
  // Child Component (Flush, edge-to-edge interactive area)
  <button className="w-full px-4 py-3 hover:bg-foreground/5">
     Content
  </button>
</div>
```

### 3.2 No Button-Like Hover Glowing Borders on Dashboard Cards
Standalone page modules and dashboard cards (e.g. `AILearningDigestCard`) must feel like native structural panels, NOT interactive buttons:
- **❌ DO NOT** use `hover:border-accent/40`, `bg-accent/10`, or glowing purple outlines on outer card wrappers.
- **✅ USE** subtle, static container borders (`bg-background-soft/60 border border-border/60 shadow-sm`).

---

## 4. Typography, Sizing & Alignment Standards

### Global Typography Sizes
- **Group Headers**: `text-[10px] font-black uppercase tracking-widest text-foreground-muted/40`
- **Row Titles**: `text-sm font-bold text-foreground block`
- **Descriptions/Subtitles**: `text-[11px] text-foreground-muted mt-0.5 leading-snug`

### Result Section Header（查词结果页板块标题）
Use shared `SectionHeading` (`src/components/ResultView/SectionHeading.tsx`):
- **Style**: same as Group Headers (`text-[10px] font-black uppercase tracking-widest text-foreground-muted/50`)
- **❌ DO NOT** put decorative colored dots (`w-1.5 h-1.5 rounded-full`) before titles
- **❌ DO NOT** repeat per-section 「AI」 pills — mode is already shown once at the page top
- **❌ DO NOT** use emoji (🎯🧠💡🧭 etc.) as section icons
- **❌ DO NOT** give every module its own rainbow accent; body copy stays neutral `foreground` / `border`
- **✅ Color for mode track only**: one top badge (Lookup amber / Core indigo / Phrase teal)
- **✅ Icons only for interaction or status**: pronunciation, expand/collapse, retry, generate, delete, nav

### Alignment & Flex Rules
- **Left Column** (ToggleRow / single action): Wraps in `flex-1 min-w-0 pr-3` so titles and descriptions never overlap or push right-side controls.
- **Right Column**: Buttons, toggles, and selectors wrap in `shrink-0 flex items-center gap-2`.
- **Button Text**: All right-side action buttons MUST include `whitespace-nowrap` to prevent awkward multi-line button text wrapping.
- **Multi-option ChoiceRow** (2+ pill selectors, e.g. Default Search Mode): **Do not** put title + long description in a narrow left column beside a wide pill group. Use scheme 1 — row 1: title + controls; row 2: full-width description (`SETTINGS_CHOICE_ROW_LAYOUT` / `ChoiceRow` in `SettingsView`).

---

## 5. Component Dictionary

### `Group`
- **Purpose**: Groups conceptually related settings or actions.
- **Styling**: `rounded-2xl border border-border/50 bg-background-soft/20 py-2 overflow-hidden flex flex-col`

### `ToggleRow`
- **Purpose**: Binary state toggle.
- **Padding & Layout**: `w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5`

### `ChoiceRow` (Settings multi-option)
- **Purpose**: Segmented / pill selectors with 2+ options (Default Search Mode, History Prefer, App Language).
- **Layout (scheme 1)**: `flex-col` — title + controls on the first row; description on a second full-width row.
- **Contract**: `src/utils/settingsChoiceRowLayout.ts` (`SETTINGS_CHOICE_ROW_LAYOUT`).

### `Accordion` (Settings Menu)
- **Purpose**: Hides secondary complexity without adding visual clutter.
- **Rules**: MUST NOT carry individual emoji icons in its trigger header. MUST be flush with no outer border inside a `Group`.

### `Buttons`
- **Primary**: `bg-accent text-white font-bold px-4 py-2 rounded-xl shadow-sm`.
- **Secondary**: `border border-border text-foreground hover:bg-foreground/5 font-bold px-2.5 py-1 rounded-lg whitespace-nowrap`.
- **Subtle/Destructive**: `border border-border text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold px-2.5 py-1 rounded-lg whitespace-nowrap`.

---

## 6. Agent Directives
When modifying or creating UI components in Lexicon:
1. **Always** ensure home empty state has NO extra cards, only Book icon + 2-line centered prompt.
2. **Do not** remount `MemoryView` / `AILearningDigestCard` or add a Memory tab unless the user explicitly asks to un-shelve the board.
3. **Always** check if the component will cause a "Box-in-Box" or glowing-border antipattern.
4. **Always** use `whitespace-nowrap shrink-0` on button elements in settings and lists.
5. **Always** use `flex-1 min-w-0 pr-3` on row title containers to ensure clean left-aligned text layout.
6. **Always** i18n all bottom-nav labels (`nav.dict` / `nav.image` / `nav.settings`).
7. **Always** use `SectionHeading` (or identical typography) for result-page section titles; never reintroduce decorative dots, emoji headers, or per-module AI badges.
