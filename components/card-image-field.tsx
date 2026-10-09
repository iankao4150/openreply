"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { uploadCardImage } from "@/lib/client/resize-image";

/**
 * A card's image: drop or pick a file (uploaded and resized for you), or paste
 * a link. Shows the image as Instagram will crop it, square.
 */
export default function CardImageField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (url: string) => void;
  invalid?: boolean;
}) {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadCardImage(file));
      setShowUrl(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "unsupported_type"
          ? t("Use a JPG, PNG, WEBP or GIF image.")
          : code === "too_large"
            ? t("That image is too large.")
            : t("Upload failed. Try again.")
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={`relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-center transition-colors ${
          dragging
            ? "border-accent bg-accent/10"
            : invalid
              ? "border-error/60"
              : value
                ? "border-transparent"
                : "border-border hover:border-accent/50"
        }`}
        aria-label={t("Upload an image")}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-xs leading-5 text-muted">
            <span className="block text-2xl">🖼️</span>
            {t("Drop an image here or click to upload")}
            <span className="block text-[11px] text-zinc-500">{t("Square works best")}</span>
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium">
            {t("Uploading…")}
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button type="button" onClick={() => fileInput.current?.click()} className="font-medium text-accent hover:underline">
          {value ? t("Replace image") : t("Upload image")}
        </button>
        <button type="button" onClick={() => setShowUrl((v) => !v)} className="text-muted hover:text-foreground">
          {t("Use an image link")}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-muted hover:text-error">
            {t("Remove")}
          </button>
        )}
      </div>
      {showUrl && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://"
          className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none"
          autoFocus
        />
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
