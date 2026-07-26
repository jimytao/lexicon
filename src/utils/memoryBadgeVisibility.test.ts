import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countUserQaMessages, getVisibleMemoryBadges } from './memoryBadgeVisibility'

describe('getVisibleMemoryBadges', () => {
  it('never surfaces the AI follow-ups count badge (product 2A)', () => {
    expect(
      getVisibleMemoryBadges({ hasNotes: false, qaCount: 5, hasCoreSaved: false }),
    ).toEqual([])
    expect(
      getVisibleMemoryBadges({ hasNotes: true, qaCount: 2, hasCoreSaved: true }),
    ).toEqual(['notes', 'coreSaved'])
    expect(
      getVisibleMemoryBadges({ hasNotes: false, qaCount: 99, hasCoreSaved: true }),
    ).not.toContain('qaFollowUps')
  })

  it('still shows notes and core-saved when present', () => {
    expect(
      getVisibleMemoryBadges({ hasNotes: true, qaCount: 0, hasCoreSaved: false }),
    ).toEqual(['notes'])
    expect(
      getVisibleMemoryBadges({ hasNotes: false, qaCount: 0, hasCoreSaved: true }),
    ).toEqual(['coreSaved'])
  })
})

describe('countUserQaMessages', () => {
  it('counts user turns for persistence / analytics (badge is separate)', () => {
    expect(countUserQaMessages(null)).toBe(0)
    expect(
      countUserQaMessages(
        JSON.stringify([
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
          { role: 'user', content: 'c' },
        ]),
      ),
    ).toBe(2)
  })

  it('counts across lookup/core buckets', () => {
    expect(
      countUserQaMessages(
        JSON.stringify({
          lookup: [{ role: 'user', content: 'a' }],
          core: [
            { role: 'user', content: 'b' },
            { role: 'assistant', content: 'c' },
          ],
        }),
      ),
    ).toBe(2)
  })

  it('tolerates bad JSON', () => {
    expect(countUserQaMessages('{not-json')).toBe(0)
  })
})

describe('LexiconMemoryBadge wiring', () => {
  const badgeSrc = readFileSync(
    join(__dirname, '../components/ResultView/LexiconMemoryBadge.tsx'),
    'utf8',
  )

  it('uses visibility helper and does not render badge.qaCount', () => {
    expect(badgeSrc).toContain('getVisibleMemoryBadges')
    expect(badgeSrc).not.toContain("badge.qaCount")
    expect(badgeSrc).not.toContain('qaCount > 0')
  })
})
