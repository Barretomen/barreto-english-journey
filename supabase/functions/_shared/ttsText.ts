/** Normalizes authored lesson text before hashing or sending it to Azure Speech. */
export function normalizeTextForTts(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*~#>|]/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([.!?])\s*\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function requireTtsText(value: string): string {
  const normalized = normalizeTextForTts(value)
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) {
    throw new Error('TTS text is empty after normalization.')
  }
  return normalized
}
