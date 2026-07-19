/**
 * Deterministic string hash used for seeded layout/variation choices.
 */

/**
 * FNV-style 32-bit hash of a string, returned as a non-negative integer.
 * @param value - Input string
 */
export function hashNumber(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    // Classic 32-bit string hash: hash * 31 + char, forced to int32.
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
