import { describe, expect, it } from 'vitest'
// @ts-expect-error Build-only ESM utility.
import { parseEntry as parseEnglish } from '../../scripts/mdx-en-to-sqlite.mjs'
// @ts-expect-error Build-only ESM utility.
import { parseSense } from '../../scripts/mdx-to-sqlite.mjs'
// @ts-expect-error Build-only ESM utility.
import { splitEntryByPos } from '../../scripts/dictionary-entries.mjs'

describe('MDX conversion regressions', () => {
  it('does not promote an example label to the meaning itself', () => {
    const html = '<span class="pos">noun</span><ol><li class="sense"><span class="def">a normal definition</span><span class="labels">(informal)</span><span class="x">an informal example</span></li></ol>'
    expect(parseEnglish('demo', html).meanings[0].en).toBe('a normal definition')
  })
  it('keeps nested OALD10 subject labels complete and per-sense POS distinct', () => {
    const html = '<span class="pos">noun</span><ol><li class="sense"><span class="grammar">[countable]</span><span class="labels">(<span class="subj">music</span>)</span><span class="def">a musical note</span></li></ol><span class="pos">verb</span><ol><li class="sense"><span class="def">to make a sound</span></li></ol>'
    const entries = splitEntryByPos(parseEnglish('demo', html))
    expect(entries.map((e: { pos: string }) => e.pos)).toEqual(['noun', 'verb'])
    expect(entries[0].meanings[0].en).toBe('[countable] (music) a musical note')
  })
  it('extracts the actual OALD9 definition, preserving letters and Chinese punctuation', () => {
    const sense = parseSense('<label-g-blk>(<reg>music</reg><chn>音乐</chn>)</label-g-blk><def>the 6th note<chnsep> * <chn>A 音（C 大调音阶的第六级音）</chn></chnsep></def>')
    expect(sense.zh).toBe('(music) A 音（C 大调音阶的第六级音）')
    expect(sense.en).toBe('(music) the 6th note')
  })
  it('retains English definitions when the original contraction has no Chinese translation', () => {
    expect(parseSense('<def>are not<chn></chn></def>').gloss).toBe('are not')
  })
})
