# Lexicon UI/UX Design System & Implementation Guide

## 1. Core Philosophy: Intentionality & Structure
This design system is built upon the philosophies outlined in Apple's HIG and Microsoft Fluent 2. We do not design components by visual instinct; we design by function and hierarchy.

Every screen and component must answer:
1. **Hierarchy (主次关系)**: What is the single most important action or piece of information?
2. **Harmony (视觉和谐)**: Do margins, paddings, and border radii mathematically align across nested containers?
3. **Consistency (语义一致性)**: Is the visual language strictly mapped to its interaction type? (e.g. Buttons vs Toggles vs Links)

## 2. Container & Grouping Rules (Anti-"Box-in-Box")

### The "Card-in-Card" Antipattern
A common mistake is placing an isolated, bordered, padded component inside a parent container that is also bordered and padded. This leads to inconsistent content widths and chaotic margins.

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

## 3. Typography & Sizing Standard

### Global Sizes
- **Group Headers**: `text-[10px] font-black uppercase tracking-widest text-foreground-muted/40`
- **Primary Titles (Rows)**: `text-sm font-bold text-foreground` (or `text-xs` if no description).
- **Descriptions/Subtitles**: `text-[10px] text-foreground-muted leading-relaxed`

### Alignment
- **Left-edge alignment**: The left edge of a Group Header, a standard Toggle row title, and an Accordion title MUST perfectly align vertically.
- **Right-edge alignment**: Toggles, chevrons, and trailing icons MUST perfectly align on the right vertical axis.

## 4. Component Dictionary

### `Group`
- **Purpose**: Groups conceptually related settings or actions.
- **Styling**: `rounded-2xl border border-border/50 bg-background-soft/20 py-2 overflow-hidden` (Notice: no hard horizontal padding `px-4` if children are edge-to-edge interactable rows).

### `ToggleRow`
- **Purpose**: Binary state toggle.
- **Padding**: `px-4 py-3` to match edge-to-edge layouts inside a Group.

### `Accordion` (Settings Menu)
- **Purpose**: Hides secondary complexity.
- **Styling**: MUST NOT have its own outer border or `rounded-2xl` if placed inside a `Group`. It must be *flush*. It uses `px-4 py-3` for its trigger area to align with `ToggleRow`.

### `Buttons`
- **Primary**: High contrast, solid background (e.g. `bg-accent text-white`). Only one per view context.
- **Secondary**: Subtle background or borders (e.g. `bg-foreground/5 text-foreground hover:bg-foreground/10`).
- **Subtle**: Text only, for destructive or purely navigational acts (e.g. `text-foreground-muted hover:text-foreground`).

## 5. Agent Instructions
When modifying or creating UI components in Lexicon:
1. **Always** check if the component will cause a "Box-in-Box" layout break.
2. **Always** use standard padding variables or classes (`px-4 py-3` for interactive rows).
3. **Never** hardcode custom widths or unaligned paddings in settings or list views.
4. If a component looks disjointed, it is probably lacking `flex-1 min-w-0` which prevents text overflow from breaking flexbox width constraints.
