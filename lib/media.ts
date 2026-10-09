/** Image types a card may use, recognised by their first bytes (not the header a browser sent). */
const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    ext: "png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
];

/** Instagram accepts card images up to 8 MB; uploads are resized in the browser first. */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes.length < 12) return null;
  const match = SIGNATURES.find((s) => s.test(bytes));
  return match ? { type: match.type, ext: match.ext } : null;
}

export function mediaExtension(contentType: string): string {
  return SIGNATURES.find((s) => s.type === contentType)?.ext ?? "jpg";
}
