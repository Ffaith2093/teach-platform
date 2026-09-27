export function shuffleOptions<T>(options: T[], seed: string): T[] {
  let state = 2166136261;
  for (const char of seed) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  const result = [...options];
  for (let i = result.length - 1; i > 0; i--) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
