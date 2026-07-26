/**
 * Settings multi-option rows (Default Search Mode, History Prefer, App Language).
 * Scheme 1: title + controls on row 1; description full-width on row 2.
 * Avoids squeezing long descriptions into a narrow left column beside wide pill groups.
 */
export const SETTINGS_CHOICE_ROW_LAYOUT = {
  root: 'flex flex-col gap-2 px-4 py-3',
  titleRow: 'flex items-center justify-between gap-3 min-w-0',
  title: 'text-sm font-bold text-foreground min-w-0 flex-1 truncate',
  controls: 'flex items-center gap-1 bg-foreground/5 p-1 rounded-xl border border-border shrink-0',
  desc: 'text-[11px] text-foreground-muted leading-snug w-full',
  optionButton: (active: boolean) =>
    `px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
      active ? 'bg-accent text-white shadow-sm' : 'text-foreground-muted hover:text-foreground'
    }`,
} as const

export function isChoiceRowStackedLayout(rootClass: string): boolean {
  return rootClass.includes('flex-col')
}

export function isChoiceRowDescFullWidth(descClass: string): boolean {
  return descClass.includes('w-full') && !descClass.includes('min-w-0 pr-3')
}
