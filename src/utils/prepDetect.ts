const PRIMARY_SPATIAL_PREPS = new Set([
  'up','out','off','on','over','in','into','down',
  'back','through','away','around','for'
])

const ALL_PREPS = new Set([
  'up','out','off','on','over','in','into','down','back','through',
  'away','around','for','at','with','by','from','to','about',
  'between','after','before','along','against','across','onto',
  'toward','towards','under','without','within','beyond','beside',
  'beneath','below','above','near','behind','inside',
  'outside','except','past','since','during','until','upon','per'
])

/**
 * Returns uppercase prepositions found in the phrase.
 * Prioritises the well-documented spatial set, falls back to broader set.
 * @param phrase  The phrase/sentence to scan
 * @param limit   Maximum number of prepositions to return (default 3)
 */
export function detectSpatialPreps(phrase: string, limit = 3): string[] {
  const words = phrase.toLowerCase().split(/[^a-zA-Z]+/)
  const found = new Set<string>()
  const result: string[] = []

  // Prioritize primary spatial prepositions
  for (const w of words) {
    if (PRIMARY_SPATIAL_PREPS.has(w) && !found.has(w)) {
      found.add(w)
      result.push(w.toUpperCase())
      if (result.length >= limit) return result
    }
  }

  // Fallback to other common prepositions if we still have capacity
  for (const w of words) {
    if (ALL_PREPS.has(w) && !found.has(w)) {
      found.add(w)
      result.push(w.toUpperCase())
      if (result.length >= limit) return result
    }
  }

  return result
}
