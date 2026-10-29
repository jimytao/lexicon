import { describe, expect, it } from 'vitest'
import {
  cleanDictionaryBrief,
  cleanDictionaryMeaning,
  isDictionaryHeaderFragment,
  localizeMeaningLabel,
  parseMeaningLabels,
  repairChineseGloss,
} from './meaningLabels'

// All fixtures below are verbatim rows from public/assets/databases/*.db.

describe('parseMeaningLabels — OALD9 (lexicon.db)', () => {
  it('strips the doubled `[[` grammar label', () => {
    expect(parseMeaningLabels('[[countable] 海或湖的）湾')).toEqual({
      grammar: ['countable'],
      register: [],
      text: '海或湖的）湾',
    })
  })

  it('strips grammar followed by a register label', () => {
    expect(parseMeaningLabels('[[transitive] (formal) 适合；符合；比得上；相配')).toEqual({
      grammar: ['transitive'],
      register: ['formal'],
      text: '适合；符合；比得上；相配',
    })
  })

  it('handles composite grammar codes', () => {
    const r = parseMeaningLabels('[[countable + singular or plural verb] (informal) 一伙人；一帮人')
    expect(r.grammar).toEqual(['countable + singular or plural verb'])
    expect(r.register).toEqual(['informal'])
    expect(r.text).toBe('一伙人；一帮人')
  })

  it('keeps parenthesised content that is not a label', () => {
    const inBritain = '(in Britain) a member of the House of Lords'
    expect(parseMeaningLabels(inBritain).text).toBe(inBritain)
    const not = '(not) mentally normal'
    expect(parseMeaningLabels(not)).toEqual({ grammar: [], register: [], text: not })
    expect(parseMeaningLabels('(a person) who is').text).toBe('(a person) who is')
  })

  it('never empties a label-only cell', () => {
    expect(parseMeaningLabels('[[singular]')).toEqual({ grammar: [], register: [], text: '[[singular]' })
  })
})

describe('parseMeaningLabels — OALD10 (lexicon_en.db)', () => {
  it('splits comma-separated grammar and register labels', () => {
    const r = parseMeaningLabels(
      '[countable, usually singular] (especially British English, informal) a hard hit with the hand or a hard object',
    )
    expect(r.grammar).toEqual(['countable', 'usually singular'])
    expect(r.register).toEqual(['especially British English', 'informal'])
    expect(r.text).toBe('a hard hit with the hand or a hard object')
  })

  it('accepts `or` alternatives inside a register atom', () => {
    const r = parseMeaningLabels(
      '[intransitive] (North American English, informal or British English, old-fashioned) to learn a lot of things in a short time, in preparation for an exam',
    )
    expect(r.register).toEqual(['North American English', 'informal or British English', 'old-fashioned'])
    expect(r.text).toBe('to learn a lot of things in a short time, in preparation for an exam')
  })

  it('repairs a subject label whose closing paren was lost', () => {
    expect(parseMeaningLabels('[countable, uncountable] (music the 6th note in the scale of C major')).toEqual({
      grammar: ['countable', 'uncountable'],
      register: ['music'],
      text: 'the 6th note in the scale of C major',
    })
    const law = parseMeaningLabels(
      '[uncountable, singular] (formal or law the act of taking something that belongs to somebody else, especially without permission',
    )
    expect(law.register).toEqual(['formal or law'])
    expect(law.text).toBe('the act of taking something that belongs to somebody else, especially without permission')
  })

  it('handles an unclosed subject label with nested parens in the gloss', () => {
    const r = parseMeaningLabels(
      '[uncountable] (physics the rate at which the velocity (= speed in a particular direction) of an object changes',
    )
    expect(r.register).toEqual(['physics'])
    expect(r.text).toBe('the rate at which the velocity (= speed in a particular direction) of an object changes')
  })

  it('leaves context notes, dates and ambiguous labels untouched', () => {
    for (const raw of [
      '(in nouns) a person who is very enthusiastic about a particular thing or is addicted to a particular drug',
      '(1895-1948) the most famous US baseball player in the history of the game.',
      '(in writing) amp',
      '(British English also) to support something publicly',
    ]) {
      expect(parseMeaningLabels(raw).text).toBe(raw)
    }
  })
})

describe('parseMeaningLabels — SPDict (lexicon_vi.db)', () => {
  it('extracts Vietnamese domain labels and normalises comma spacing', () => {
    expect(parseMeaningLabels('(địa lý,địa chất) vịnh')).toEqual({
      grammar: [],
      register: ['địa lý, địa chất'],
      text: 'vịnh',
    })
    expect(parseMeaningLabels('(địa lý,ddịa chất) gió phơn (gió nồm vùng An-pơ)').register).toEqual(['địa lý, địa chất'])
  })

  it('treats (số nhiều) as grammar', () => {
    expect(parseMeaningLabels('(số nhiều) vòng nguyệt quế')).toEqual({
      grammar: ['số nhiều'],
      register: [],
      text: 'vòng nguyệt quế',
    })
  })

  it('follows comma-chained labels', () => {
    const r = parseMeaningLabels('(từ Mỹ,nghĩa Mỹ), (từ lóng) vô cùng, hết sức, cùng cực')
    expect(r.register).toEqual(['từ Mỹ, nghĩa Mỹ', 'từ lóng'])
    expect(r.text).toBe('vô cùng, hết sức, cùng cực')
  })

  it('keeps content-bearing parentheses', () => {
    expect(parseMeaningLabels('(y học) (thuộc) ổ cối.')).toEqual({
      grammar: [],
      register: ['y học'],
      text: '(thuộc) ổ cối.',
    })
    for (const raw of ['(+ to, from) không hợp với, trái với', '[một cách] vị tha', '(như) habiliate']) {
      expect(parseMeaningLabels(raw).text).toBe(raw)
    }
  })
})

describe('repairChineseGloss', () => {
  it('restores the lost leading full-width paren from the English column', () => {
    expect(repairChineseGloss('海或湖的）湾', 'a part of the sea, or of a large lake, partly surrounded by a wide curve of the land （海或湖的）湾'))
      .toBe('（海或湖的）湾')
  })

  it('recovers multi-character lost prefixes', () => {
    expect(repairChineseGloss('世纪 40 和 50 年代美国少女和年轻妇女爱穿的）白色短袜', 'short white socks （20 世纪 40 和 50 年代美国少女和年轻妇女爱穿的）白色短袜'))
      .toBe('（20 世纪 40 和 50 年代美国少女和年轻妇女爱穿的）白色短袜')
    expect(repairChineseGloss('群体（或类）的事物', 'the group or class of …群体（或类）的事物')).toBe('…群体（或类）的事物')
  })

  it('falls back to a bare （ without an English hint', () => {
    expect(repairChineseGloss('表示所属关系）…的')).toBe('（表示所属关系）…的')
  })

  it('leaves well-formed or non-Chinese text alone', () => {
    expect(repairChineseGloss('（试题、练习等的）答案，正确答案')).toBe('（试题、练习等的）答案，正确答案')
    expect(repairChineseGloss('答复；回答', 'something that you say 答复；回答')).toBe('答复；回答')
    expect(repairChineseGloss('nhịp (cầu)')).toBe('nhịp (cầu)')
  })
})

describe('cleanDictionaryMeaning', () => {
  it('cleans the OALD9 "bay" row end to end', () => {
    expect(
      cleanDictionaryMeaning({
        zh: '[[countable] 海或湖的）湾',
        en: '[[countable] a part of the sea, or of a large lake, partly surrounded by a wide curve of the land （海或湖的）湾',
      }),
    ).toEqual({
      grammar: ['countable'],
      register: [],
      zh: '（海或湖的）湾',
      en: 'a part of the sea, or of a large lake, partly surrounded by a wide curve of the land',
    })
  })

  it('repairs a lost paren after register labels', () => {
    expect(
      cleanDictionaryMeaning({
        zh: '[[countable + singular or plural verb] (informal) 人）一对；（尤指）夫妻，情侣',
        en: '[[countable + singular or plural verb] (informal) two people who are seen together, especially if they are married or in a romantic or sexual relationship （人）一对；（尤指）夫妻，情侣',
      }),
    ).toMatchObject({ register: ['informal'], zh: '（人）一对；（尤指）夫妻，情侣' })
  })

  it('replaces a context-label translation with the real gloss from the English column', () => {
    expect(
      cleanDictionaryMeaning({
        zh: '[[singular] 法律',
        en: '[[singular] a judge in court or the seat where he/she sits; the position of being a judge or magistrate 法官；法官席位；法官（或裁判官）的职位',
      }),
    ).toEqual({
      grammar: ['singular'],
      register: [],
      zh: '法官；法官席位；法官（或裁判官）的职位',
      en: 'a judge in court or the seat where he/she sits; the position of being a judge or magistrate',
    })
    expect(cleanDictionaryMeaning({ zh: '构成名词', en: 'a process or state of （表示过程或状态）' }).zh).toBe('（表示过程或状态）')
    expect(cleanDictionaryMeaning({ zh: '[[singular]', en: '[[singular] the fact that sb/sth is able to do sth 能力' }).zh).toBe('能力')
  })

  it('does not trust a partially captured Chinese tail', () => {
    const r = cleanDictionaryMeaning({
      zh: '用于记分系统',
      en: 'slightly lower than the mark/grade A, B, etc. 略低于（A、B 等）',
    })
    expect(r.zh).toBe('用于记分系统')
  })

  it('dedupes labels shared by an OALD10 row (zh === en)', () => {
    const row = '(informal, often disapproving) to be confident that you know something, especially when you actually do not'
    expect(cleanDictionaryMeaning({ zh: row, en: row })).toEqual({
      grammar: [],
      register: ['informal', 'often disapproving'],
      zh: 'to be confident that you know something, especially when you actually do not',
      en: 'to be confident that you know something, especially when you actually do not',
    })
  })

  it('passes AI meanings and SPDict rows through safely', () => {
    expect(cleanDictionaryMeaning({ zh: '（期望达成后的）满足感', en: 'The feeling of pleasure when sth you wanted to happen does happen.' }))
      .toEqual({ grammar: [], register: [], zh: '（期望达成后的）满足感', en: 'The feeling of pleasure when sth you wanted to happen does happen.' })
    expect(cleanDictionaryMeaning({ zh: '(quân sự) chỗ tránh nhau (trong chiến hào)', en: '' }))
      .toEqual({ grammar: [], register: ['quân sự'], zh: 'chỗ tránh nhau (trong chiến hào)', en: '' })
  })
})

describe('isDictionaryHeaderFragment', () => {
  it('flags SPDict POS-header fragments only', () => {
    expect(isDictionaryHeaderFragment('& phó từ')).toBe(true)
    expect(isDictionaryHeaderFragment(', số nhiều abaci, abacuses')).toBe(true)
    expect(isDictionaryHeaderFragment(', (thường) số nhiều')).toBe(true)
    expect(isDictionaryHeaderFragment('bàn tính')).toBe(false)
    expect(isDictionaryHeaderFragment(
      ", the popular name for the States' Rights Party, a 'third party' that competed in the 1948 election for US President against the Democratic Party and Republican Party.",
    )).toBe(false)
  })
})

describe('cleanDictionaryBrief', () => {
  it('drops truncated label-only pieces', () => {
    expect(cleanDictionaryBrief('[[uncounta；[[singular')).toBe('')
    expect(cleanDictionaryBrief('以…为中心；有…中心；(often dis')).toBe('以…为中心；有…中心')
    expect(cleanDictionaryBrief('(informal)；[[countabl')).toBe('')
  })

  it('strips complete labels from each piece', () => {
    expect(cleanDictionaryBrief('[uncountable] the phone number; [singular] (North American Eng')).toBe('the phone number')
    expect(cleanDictionaryBrief('(medical a disease of; (informal, especially humorous')).toBe('a disease of')
    expect(cleanDictionaryBrief('(hàng hải) ở phía sau bánh lái, gần phía bánh lái; (hàng hải) sau, ở đằng sau, ở phía sau'))
      .toBe('ở phía sau bánh lái, gần phía bánh lái; sau, ở đằng sau, ở phía sau')
  })

  it('keeps ordinary briefs', () => {
    expect(cleanDictionaryBrief('答复；回答')).toBe('答复；回答')
    expect(cleanDictionaryBrief('')).toBe('')
  })
})

describe('localizeMeaningLabel', () => {
  const zh: Record<string, string> = {
    'meaning.label.countable': '可数',
    'meaning.label.informal': '非正式',
    'meaning.label.formal': '正式',
    'meaning.label.literary': '文学',
    'meaning.label.disapproving': '含贬义',
    'meaning.label.british-english': '英式英语',
    'meaning.label.countable-singular-or-plural-verb': '可数（动词单复数皆可）',
    'meaning.label.mod.often': '常',
    'meaning.label.mod.especially': '尤用于',
    'meaning.label.join.or': '或',
  }
  const tZh = (key: string) => zh[key] ?? key
  const tEn = (key: string) => key

  it('uses direct translations', () => {
    expect(localizeMeaningLabel('countable', tZh)).toBe('可数')
    expect(localizeMeaningLabel('countable + singular or plural verb', tZh)).toBe('可数（动词单复数皆可）')
  })

  it('composes modifiers and `or` alternatives', () => {
    expect(localizeMeaningLabel('often disapproving', tZh)).toBe('常含贬义')
    expect(localizeMeaningLabel('especially British English', tZh)).toBe('尤用于英式英语')
    expect(localizeMeaningLabel('formal or literary', tZh)).toBe('正式或文学')
  })

  it('falls back to the raw label', () => {
    expect(localizeMeaningLabel('Welsh English', tZh)).toBe('Welsh English')
    expect(localizeMeaningLabel('formal or Welsh English', tZh)).toBe('formal or Welsh English')
    expect(localizeMeaningLabel('informal', tEn)).toBe('informal')
    expect(localizeMeaningLabel('từ lóng', tZh)).toBe('từ lóng')
  })
})
