/**
 * Client-side search helper for already-loaded lists (categories, tags, etc.).
 * For server-side search use `searchAPI` (services/api.ts). Both enforce a
 * 3-character minimum. Use these instead of ad-hoc `.filter(...includes...)`.
 */
export const MIN_SEARCH_LENGTH = 3;

export function filterBySearch<T>(
  items: T[],
  query: string,
  keys: (keyof T)[],
  opts: { min?: number; limit?: number } = {}
): T[] {
  const min = opts.min ?? MIN_SEARCH_LENGTH;
  const q = (query || '').trim().toLowerCase();

  let result = items;
  if (q.length >= min) {
    const matches = items.filter((it) => keys.some((k) => String(it[k] ?? '').toLowerCase().includes(q)));
    // Rank prefix matches first, then alphabetical by the first key.
    result = matches.sort((a, b) => {
      const ap = keys.some((k) => String(a[k] ?? '').toLowerCase().startsWith(q)) ? 0 : 1;
      const bp = keys.some((k) => String(b[k] ?? '').toLowerCase().startsWith(q)) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a[keys[0]] ?? '').localeCompare(String(b[keys[0]] ?? ''));
    });
  }
  return opts.limit ? result.slice(0, opts.limit) : result;
}
