/** Search only existing labels/identities; this is not a second terminology store. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function matchesSearch(query: string, values: readonly (string | undefined)[]): boolean {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  const text = normalizeSearchText(values.filter(Boolean).join(' '));
  return tokens.every(token => text.includes(token));
}

/** Rank exact preferred/Latin/English names ahead of broader substring matches. */
export function searchRank(query: string, values: readonly (string | undefined)[]): number {
  const normalized = normalizeSearchText(query);
  if (!normalized) return 2;
  const labels = values.filter((value): value is string => !!value).map(normalizeSearchText);
  if (labels.some(value => value === normalized)) return 0;
  return labels.some(value => value.startsWith(normalized)) ? 1 : 2;
}

/** Physical PDF page, not the book's printed page number. No URL/path is inferred. */
export function sourcePdfLabel(path: string, page: number): string {
  const filename = path.split('/').pop()!.replace(/\.pdf$/i, '');
  return `${filename} · fizična str. ${page}`;
}
