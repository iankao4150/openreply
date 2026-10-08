/**
 * Instagram caps a text message at 1000 UTF-8 bytes, not characters: about 333
 * Chinese characters. Cut on a character boundary so no character is split.
 */
export const MAX_TEXT_BYTES = 1000;

export function fitUtf8(text: string, maxBytes = MAX_TEXT_BYTES): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let out = "";
  let used = 0;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (used + size > maxBytes - 3) break;
    out += char;
    used += size;
  }
  return `${out}…`;
}
