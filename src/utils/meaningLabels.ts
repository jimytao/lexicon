/**
 * Display-time cleanup for local dictionary meaning rows.
 *
 * The bundled SQLite dictionaries store grammar / register labels inline at the
 * start of each gloss (and older OALD9 builds also mangled them, e.g.
 * `[[countable] 海或湖的）湾`). Rather than requiring a DB regeneration, the UI
 * peels recognised labels off into tags and repairs the known converter damage.
 *
 * Everything here is deliberately conservative: a leading bracket / parenthesis
 * is only removed when every piece of it is a known label, so real content such
 * as `(in Britain) …`, `(not) mentally normal` or `(a person) …` stays in the text.
 */

export interface MeaningLabels {
  grammar: string[]
  register: string[]
  text: string
}

export interface CleanMeaning {
  grammar: string[]
  register: string[]
  zh: string
  en: string
}

const CJK = /[一-鿿]/

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// OALD9 / OALD10 grammar codes, including composites such as
// "countable + singular or plural verb" and "not usually before noun".
const GRAMMAR_ATOM =
  /^(?:(?:only|usually|often|not usually|not|no|sometimes|always)\s+)?(?:countable|uncountable|transitive|intransitive|singular|plural|passive|before noun|after noun)(?:\s*\+\s*singular or plural verb)?$|^singular or plural verb$/

const REGISTER_CORES = [
  'informal', 'formal', 'old-fashioned', 'saying', 'specialist', 'figurative',
  'disapproving', 'literary', 'slang', 'humorous', 'taboo', 'old use', 'approving',
  'ironic', 'less frequent', 'offensive', 'non-standard', 'dialect',
]

const VARIETIES = [
  'British English', 'North American English', 'US English', 'Indian English',
  'Australian English', 'New Zealand English', 'South African English',
  'Canadian English', 'Scottish English', 'Irish English', 'Welsh English',
  'East African English', 'West African English', 'South-East Asian English',
  'Northern British English',
  // OALD9 writes varieties as abbreviations inside <label-g-blk>.
  'BrE', 'NAmE', 'US', 'AustralE', 'NZE', 'SAfrE', 'IndE', 'ScotE', 'IrishE', 'CanE',
  'WelshE', 'EAfrE', 'WAfrE', 'NEngE',
]

// Every `<span class="subj">` value in the OALD10 source.
const SUBJECTS = [
  'computing', 'medical', 'law', 'biology', 'grammar', 'business', 'music',
  'chemistry', 'physics', 'linguistics', 'anatomy', 'mathematics', 'phonetics',
  'finance', 'geometry', 'sport', 'geology', 'psychology', 'politics', 'philosophy',
  'economics', 'astronomy', 'architecture', 'art', 'statistics', 'religion',
]
const SUBJECT_SET = new Set(SUBJECTS)

export const LABEL_MODIFIERS = [
  'also', 'often', 'usually', 'sometimes', 'especially', 'rather', 'very',
  'becoming', 'both', 'all',
] as const

const REGISTER_PART = new RegExp(
  `^(?:(?:${LABEL_MODIFIERS.join('|')})\\s+){0,2}(?:${[...REGISTER_CORES, ...VARIETIES, ...SUBJECTS].map(escapeRe).join('|')})$`,
)

// SPDict (English–Vietnamese) domain / register labels, keyed by their
// comma-collapsed form. Values are the display form; obvious source typos are
// normalised so the same label does not render two ways.
const VI_REGISTER_LABELS: Record<string, string> = Object.fromEntries(
  [
    'từ Mỹ,nghĩa Mỹ', 'y học', 'thực vật học', 'động vật học', 'nghĩa bóng', 'hoá học',
    'thông tục', 'sinh vật học', 'từ lóng', 'kỹ thuật', 'giải phẫu', 'quân sự',
    'từ cổ,nghĩa cổ', 'âm nhạc', 'hàng hải', 'pháp lý', 'ngôn ngữ học', 'toán học',
    'thể dục,thể thao', 'vật lý', 'sử học', 'sinh học', 'tôn giáo', 'thơ ca', 'thực vật',
    'từ hiếm,nghĩa hiếm', 'kiến trúc', 'khoáng chất', 'triết học', 'địa lý,địa chất',
    'động vật', 'điện học', 'Ê-cốt', 'đùa cợt', 'thiên văn học', 'hàng không', 'sân khấu',
    'văn học', 'ngành in', 'thương nghiệp', 'thần thoại,thần học', 'ngành đường sắt',
    'viết tắt', 'chính trị', 'nông nghiệp', 'dược học', 'đánh bài', 'ngành mỏ',
    'nghệ thuật', 'rađiô', 'ngôn ngữ nhà trường', 'điện ảnh', 'Anh-Ân', 'nhiếp ảnh',
    'tiếng địa phương', 'khí tượng', 'địa chất', 'tâm lý học', 'tin học', 'thú y học',
    'khoáng vật học', 'pháp luật', 'hội họa', 'kinh thánh', 'phương ngữ', 'tài chính',
    'từ Mỹ', 'khảo cổ học', 'từ cổ', 'đường sắt', 'thể thao', 'đánh cờ', 'ngoại giao',
    'thân mật', 'lịch sử', 'từ hiếm', 'thể dục thể thao', 'kinh tế', 'luyện kim',
    'mỉa mai', 'săn bắn', 'nghĩa xấu', 'Scotland', 'Ai-len',
  ].map((label) => [label, label.replace(/,/g, ', ')] as const)
    .concat([
      ['địa lý,ddịa chất', 'địa lý, địa chất'],
      ['raddiô', 'rađiô'],
      ['giải phẩu học', 'giải phẫu học'],
      ['hàng hi', 'hàng hải'],
      ['nghành dệt', 'ngành dệt'],
      ['ngành dệt', 'ngành dệt'],
    ]),
)

const VI_GRAMMAR_LABELS: Record<string, string> = {
  'số nhiều': 'số nhiều',
  'định ngữ': 'định ngữ',
  '(thường) số nhiều': '(thường) số nhiều',
  'số ít': 'số ít',
  'thường số ít': 'thường số ít',
}

function isRegisterAtom(atom: string): boolean {
  const parts = atom.split(/\s+or\s+/)
  return parts.length > 0 && parts.every((p) => REGISTER_PART.test(p))
}

/** Index of the `)` closing the `(` at position 0, or -1 when it never closes. */
function matchingParen(s: string): number {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

interface LabelHit {
  kind: 'grammar' | 'register'
  labels: string[]
  rest: string
}

function matchGrammar(s: string): LabelHit | null {
  // `[[` comes from the OALD9 converter wrapping an already-bracketed <gram-blk>.
  const m = s.match(/^\[\[?([^[\]]+)\]\s*/)
  if (!m) return null
  const atoms = m[1].split(/\s*,\s*/).map((a) => a.trim())
  if (!atoms.every((a) => GRAMMAR_ATOM.test(a))) return null
  return { kind: 'grammar', labels: atoms, rest: s.slice(m[0].length) }
}

function matchRegister(s: string): LabelHit | null {
  if (!s.startsWith('(')) return null
  const close = matchingParen(s)
  if (close > 0) {
    const inner = s.slice(1, close).trim()
    const rest = s.slice(close + 1).trimStart()
    const viKey = inner.replace(/\s*,\s*/g, ',')
    if (VI_GRAMMAR_LABELS[viKey]) return { kind: 'grammar', labels: [VI_GRAMMAR_LABELS[viKey]], rest }
    if (VI_REGISTER_LABELS[viKey]) return { kind: 'register', labels: [VI_REGISTER_LABELS[viKey]], rest }
    const atoms = inner.split(/\s*,\s*/)
    if (atoms.length === 0 || !atoms.every(isRegisterAtom)) return null
    return { kind: 'register', labels: atoms, rest }
  }
  return matchUnclosedSubject(s)
}

/**
 * OALD10 builds cut `(<span class="subj">music</span>)` at the inner `</span>`,
 * leaving `(music the 6th note …` with no closing paren. Only accept it when the
 * words up to a subject name are all known labels.
 */
function matchUnclosedSubject(s: string): LabelHit | null {
  const words = s.slice(1).split(' ')
  for (let k = 0; k < Math.min(words.length - 1, 8); k++) {
    const w = words[k]
    if (w.endsWith(',')) continue
    if (!SUBJECT_SET.has(w)) continue
    const label = words.slice(0, k + 1).join(' ')
    const atoms = label.split(/\s*,\s*/)
    if (!atoms.every(isRegisterAtom)) return null
    const rest = words.slice(k + 1).join(' ').trimStart()
    return rest ? { kind: 'register', labels: atoms, rest } : null
  }
  return null
}

const pushUnique = (into: string[], items: string[]) => {
  for (const item of items) if (item && !into.includes(item)) into.push(item)
}

interface PeeledLabels {
  grammar: string[]
  register: string[]
  rest: string
}

function peelLabels(text: string): PeeledLabels {
  const grammar: string[] = []
  const register: string[] = []
  let rest = text
  for (let guard = 0; guard < 6; guard++) {
    // SPDict sometimes chains labels with a comma: `(từ Mỹ,nghĩa Mỹ), (từ lóng) …`.
    const chained = guard > 0 ? rest.match(/^,\s*(?=\()/)?.[0] ?? '' : ''
    const candidate = rest.slice(chained.length)
    const hit = matchGrammar(candidate) ?? matchRegister(candidate)
    if (!hit) break
    pushUnique(hit.kind === 'grammar' ? grammar : register, hit.labels)
    rest = hit.rest
  }
  return { grammar, register, rest }
}

/** Split leading grammar / register labels off one gloss string. */
export function parseMeaningLabels(raw: string): MeaningLabels {
  const original = (raw ?? '').trim()
  const { grammar, register, rest } = peelLabels(original)
  // A row that is nothing but labels keeps its text so it never renders blank.
  if (!rest) return { grammar: [], register: [], text: original }
  return { grammar, register, text: rest }
}

/**
 * The OALD9 converter stripped every non-CJK character before the Chinese gloss,
 * eating the opening `（` of `（海或湖的）湾`. The English column still ends with
 * the intact gloss, so recover the exact lost prefix from it when possible.
 */
export function repairChineseGloss(zh: string, enHint = ''): string {
  if (!CJK.test(zh)) return zh
  const close = zh.indexOf('）')
  const open = zh.indexOf('（')
  const orphanClose = close >= 0 && (open < 0 || open > close)
  if (enHint.length > zh.length && enHint.endsWith(zh)) {
    const head = enHint.slice(0, enHint.length - zh.length)
    // The converter always put a space before the gloss, so punctuation glued to
    // it (`…`, `（`, `（《`) can only be a prefix it stripped.
    const glued = head.match(/(\S+)$/)?.[1]
    if (glued && !/[A-Za-z]/.test(glued) && !CJK.test(glued)) return glued + zh
    if (orphanClose) {
      const tail = head.slice(Math.max(0, head.length - 24))
      const j = tail.lastIndexOf('（')
      if (j >= 0) {
        const lost = tail.slice(j)
        if (!lost.includes('）') && !CJK.test(lost)) return lost + zh
      }
    }
  }
  return orphanClose ? `（${zh}` : zh
}

/** OALD9's English column repeats the Chinese gloss at its end; drop that echo. */
function dropTrailingGloss(en: string, zh: string): string {
  if (!zh || en === zh || !CJK.test(zh) || !en.endsWith(zh)) return en
  const head = en.slice(0, en.length - zh.length)
  if (!/\s$/.test(head) || !head.trim()) return en
  return head.trim()
}

const TRAILING_CHINESE = /\s((?:[（《“…]|[一-鿿])[^A-Za-z]*)$/

function hasBalancedFullWidthParens(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '（') depth++
    else if (ch === '）' && --depth < 0) return false
  }
  return depth === 0
}

/**
 * The OALD9 converter took the first `<chn>` of a sense, which is often the
 * translation of a context label (`人`, `法律`, `构成名词`) rather than the gloss.
 * The real gloss survives at the end of the English column; only trust it when
 * it is letter-free and paren-balanced, so a partially captured tail is ignored.
 */
function trailingChineseGloss(en: string): string | null {
  // Old OALD9 used an explicit bilingual separator before glosses containing
  // Latin symbols (A 音, A 级公路). This boundary is safer than guessing at letters.
  const symbolGloss = en.match(/\s\*\s+([A-Za-z][^*]*[一-鿿][^*]*)$/)?.[1]?.trim()
  if (symbolGloss && hasBalancedFullWidthParens(symbolGloss)) return symbolGloss
  const m = en.match(TRAILING_CHINESE)
  if (!m || m.index === undefined || m.index === 0) return null
  const tail = m[1].trim()
  return hasBalancedFullWidthParens(tail) ? tail : null
}

export function cleanDictionaryMeaning(meaning: { zh?: string; en?: string }): CleanMeaning {
  const rawZh = (meaning.zh ?? '').trim()
  const z = peelLabels(rawZh)
  const e = parseMeaningLabels(meaning.en ?? '')
  let zh = z.rest
  let en = e.text
  // A label-only Chinese cell (`[[singular]`) also lost its gloss to the same bug.
  const zhSuspect = zh === '' || (CJK.test(zh) && !en.endsWith(zh))
  const recovered = zhSuspect ? trailingChineseGloss(en) : null
  if (!recovered && zh === '') zh = rawZh
  if (recovered) {
    zh = recovered
    en = en.slice(0, en.length - recovered.length).trim().replace(/\s*\*$/, '').trim()
  } else {
    zh = repairChineseGloss(zh, en)
    en = dropTrailingGloss(en, zh)
  }
  const grammar: string[] = []
  const register: string[] = []
  pushUnique(grammar, [...z.grammar, ...e.grammar])
  pushUnique(register, [...z.register, ...e.register])
  return { grammar, register, zh, en }
}

/**
 * SPDict POS headers such as `& tính từ` or `, số nhiều abaci` were split out as
 * if they were senses (all ≤ 84 chars in the shipped DB). The length cap keeps
 * long real glosses that merely start with stray punctuation, e.g. OALD10's
 * `, the popular name for the States' Rights Party …`.
 */
export function isDictionaryHeaderFragment(text: string): boolean {
  const trimmed = (text ?? '').trim()
  return trimmed.length <= 100 && /^[&,;]\s*(?:\(thường\)\s*)?(?:số nhiều|danh từ|(?:nội |ngoại )?động từ|tính từ|phó từ|trạng từ|thán từ|giới từ|liên từ|đại từ)(?=\s|$|[,(&])/u.test(trimmed)
}

/**
 * Suggestion briefs are the first gloss(es) truncated by the converters, so they
 * can hold labels cut mid-word (`[[uncounta；[[singular`). Drop label-only
 * pieces and strip recognised labels from the rest.
 */
export function cleanDictionaryBrief(brief: string): string {
  if (!brief) return brief
  const sep = brief.includes('；') ? '；' : '; '
  const kept = brief.split(sep).map((part) => {
    const trimmed = part.trim()
    if (isDictionaryHeaderFragment(trimmed)) return ''
    // Grammar code truncated by the converter's fixed-width slice.
    if (/^\[\[?[a-z ,+]*\]?$/.test(trimmed)) return ''
    const rest = peelLabels(trimmed).rest
    // Register label truncated mid-word, e.g. `(old-fashion`.
    return /^\([A-Za-z ,.-]*$/.test(rest) ? '' : rest
  }).filter(Boolean)
  return kept.join(sep)
}

const LABEL_KEY_PREFIX = 'meaning.label.'

const labelKey = (label: string) =>
  LABEL_KEY_PREFIX + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function lookupLabel(label: string, t: (key: string) => string): string | null {
  const key = labelKey(label)
  const hit = t(key)
  if (hit !== key) return hit

  const orParts = label.split(/\s+or\s+/)
  if (orParts.length > 1) {
    const joiner = t(`${LABEL_KEY_PREFIX}join.or`)
    const parts = orParts.map((p) => lookupLabel(p, t))
    if (joiner === `${LABEL_KEY_PREFIX}join.or` || parts.some((p) => p === null)) return null
    return parts.join(joiner)
  }

  const mod = label.match(new RegExp(`^(${LABEL_MODIFIERS.join('|')})\\s+(.+)$`))
  if (mod) {
    const modKey = `${LABEL_KEY_PREFIX}mod.${mod[1]}`
    const modText = t(modKey)
    const core = lookupLabel(mod[2], t)
    if (modText === modKey || core === null) return null
    return modText + core
  }
  return null
}

/**
 * Localise a raw dictionary label via the i18n table. Unknown labels (and the
 * Vietnamese SPDict labels, already in the gloss language) fall back to the raw text.
 */
export function localizeMeaningLabel(label: string, t: (key: string) => string): string {
  const viGrammar: Record<string, string> = {
    'số nhiều': 'plural', 'số ít': 'singular', 'định ngữ': 'attributive',
    '(thường) số nhiều': 'usually plural', 'thường số ít': 'usually singular',
  }
  const canonical = viGrammar[label]
  if (canonical) return lookupLabel(canonical, t) ?? canonical
  if (/[^ -~]/.test(label)) return label
  return lookupLabel(label, t) ?? label
}
