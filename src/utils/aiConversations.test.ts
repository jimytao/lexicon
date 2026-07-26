import { describe, expect, it } from 'vitest'
import {
  flattenAiConversations,
  parseAiConversationsBuckets,
  setBucketMessages,
  stringifyAiConversationsBuckets,
} from './aiConversations'

describe('parseAiConversationsBuckets', () => {
  it('treats legacy plain array as lookup', () => {
    const legacy = [
      { role: 'user' as const, content: 'q' },
      { role: 'assistant' as const, content: 'a' },
    ]
    expect(parseAiConversationsBuckets(JSON.stringify(legacy))).toEqual({
      lookup: legacy,
      core: [],
    })
  })

  it('reads lookup/core buckets', () => {
    const buckets = {
      lookup: [{ role: 'user' as const, content: 'L' }],
      core: [{ role: 'user' as const, content: 'C' }],
    }
    expect(parseAiConversationsBuckets(JSON.stringify(buckets))).toEqual(buckets)
  })

  it('tolerates bad JSON', () => {
    expect(parseAiConversationsBuckets('{nope')).toEqual({ lookup: [], core: [] })
  })
})

describe('setBucketMessages / stringify', () => {
  it('updates only one track', () => {
    const base = parseAiConversationsBuckets(
      JSON.stringify({
        lookup: [{ role: 'user', content: 'old' }],
        core: [{ role: 'user', content: 'keep' }],
      }),
    )
    const next = setBucketMessages(base, 'lookup', [{ role: 'user', content: 'new' }])
    expect(next.lookup).toEqual([{ role: 'user', content: 'new' }])
    expect(next.core).toEqual([{ role: 'user', content: 'keep' }])
    const roundTrip = parseAiConversationsBuckets(stringifyAiConversationsBuckets(next))
    expect(roundTrip).toEqual(next)
  })
})

describe('flattenAiConversations', () => {
  it('concatenates both tracks', () => {
    expect(
      flattenAiConversations({
        lookup: [{ role: 'user', content: 'a' }],
        core: [{ role: 'assistant', content: 'b' }],
      }),
    ).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])
  })
})
