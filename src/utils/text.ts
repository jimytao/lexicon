/**
 * Normalizes a search query or word for consistent indexing and comparison.
 * Trims whitespace and converts to lowercase.
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}
