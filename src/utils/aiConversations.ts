import type { ChatMessage, CognitiveMode } from '../types'

/** Lexicon Memory `ai_conversations_json` — Lookup / Core buckets. */
export interface AiConversationsBuckets {
  lookup: ChatMessage[]
  core: ChatMessage[]
}

function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
  )
}

/** Parse stored JSON: legacy plain array → lookup; object with lookup/core buckets. */
export function parseAiConversationsBuckets(
  json: string | null | undefined,
): AiConversationsBuckets {
  const empty: AiConversationsBuckets = { lookup: [], core: [] }
  if (!json) return empty
  try {
    const parsed: unknown = JSON.parse(json)
    if (isChatMessageArray(parsed)) {
      return { lookup: parsed, core: [] }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      return {
        lookup: isChatMessageArray(obj.lookup) ? obj.lookup : [],
        core: isChatMessageArray(obj.core) ? obj.core : [],
      }
    }
  } catch {
    /* ignore */
  }
  return empty
}

export function getBucketMessages(
  buckets: AiConversationsBuckets,
  cognitive: CognitiveMode,
): ChatMessage[] {
  return cognitive === 'core' ? buckets.core : buckets.lookup
}

export function setBucketMessages(
  buckets: AiConversationsBuckets,
  cognitive: CognitiveMode,
  messages: ChatMessage[],
): AiConversationsBuckets {
  return cognitive === 'core'
    ? { ...buckets, core: messages }
    : { ...buckets, lookup: messages }
}

export function flattenAiConversations(buckets: AiConversationsBuckets): ChatMessage[] {
  return [...buckets.lookup, ...buckets.core]
}

/** Drop oldest messages from a single track until serialized size fits. */
export function trimMessagesToCharBudget(
  messages: ChatMessage[],
  maxChars: number,
): ChatMessage[] {
  let trimmed = [...messages]
  while (JSON.stringify(trimmed).length > maxChars && trimmed.length > 1) {
    trimmed.shift()
  }
  return trimmed
}

/** Serialize buckets; if over budget, trim oldest from the longer track first. */
export function stringifyAiConversationsBuckets(
  buckets: AiConversationsBuckets,
  maxChars = 60000,
): string {
  let next = { ...buckets }
  let json = JSON.stringify(next)
  while (json.length > maxChars) {
    const lookupLen = JSON.stringify(next.lookup).length
    const coreLen = JSON.stringify(next.core).length
    if (lookupLen === 0 && coreLen === 0) break
    if (lookupLen >= coreLen && next.lookup.length > 0) {
      next = { ...next, lookup: next.lookup.slice(1) }
    } else if (next.core.length > 0) {
      next = { ...next, core: next.core.slice(1) }
    } else if (next.lookup.length > 0) {
      next = { ...next, lookup: next.lookup.slice(1) }
    } else {
      break
    }
    json = JSON.stringify(next)
  }
  return json
}
