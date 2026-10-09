import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/media";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe("uploaded card images", () => {
  it("recognises images by their first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.type).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))?.ext).toBe("png");
    expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38))?.type).toBe("image/gif");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImage(webp)?.type).toBe("image/webp");
  });

  it("rejects anything else, whatever the browser claimed", () => {
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
