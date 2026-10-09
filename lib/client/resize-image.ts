/**
 * Shrink a picked image in the browser before uploading: the longest side to
 * 1080 px (what Instagram shows at most) as a JPEG. Keeps uploads small and
 * well under the server's limit. Transparent areas turn white.
 */
export async function resizeImage(file: File, maxSide = 1080, quality = 0.86): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unreadable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("unreadable"))), "image/jpeg", quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload an image for a card; resolves to its public URL. */
export async function uploadCardImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("unsupported_type");
  const blob = await resizeImage(file);
  const res = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  const data = await res.json().catch(() => null);
  if (!data?.success) throw new Error(data?.error ?? "upload_failed");
  return data.data.url as string;
}
