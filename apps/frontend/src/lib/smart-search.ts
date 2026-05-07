function normalizeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeValue(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildSmartSearchText(...parts: Array<string | null | undefined>) {
  return normalizeValue(parts.filter(Boolean).join(" "));
}

export function getSmartSearchScore(query: string, haystack: string) {
  const normalizedQuery = normalizeValue(query);
  const normalizedHaystack = normalizeValue(haystack);

  if (!normalizedQuery) return 1;
  if (!normalizedHaystack) return 0;
  if (normalizedHaystack === normalizedQuery) return 120;
  if (normalizedHaystack.startsWith(normalizedQuery)) return 100;
  if (normalizedHaystack.includes(normalizedQuery)) return 80;

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return 1;

  let score = 0;
  let matchedTokens = 0;

  for (const token of queryTokens) {
    if (normalizedHaystack.startsWith(token)) {
      score += 24;
      matchedTokens += 1;
      continue;
    }
    if (normalizedHaystack.includes(token)) {
      score += 14;
      matchedTokens += 1;
    }
  }

  if (matchedTokens === queryTokens.length) {
    return score + 20;
  }

  return 0;
}
