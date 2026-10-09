"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Pick products from a Shopify store to turn into cards. Reads the store's
 * public product feed straight from the browser (Shopify allows it), so the
 * card gets the product photo, name, price and link in one go.
 */

export interface StoreProduct {
  id: number;
  title: string;
  url: string;
  images: string[];
  price: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  images: { src: string }[];
  variants: { price: string; available?: boolean }[];
}

const STORE_KEY = "cards:storeUrl";
const DEFAULT_STORE = "https://ofsyd.com";
const PAGE_SIZE = 250;

function readStore(): string {
  try {
    return window.localStorage.getItem(STORE_KEY) || DEFAULT_STORE;
  } catch {
    return DEFAULT_STORE;
  }
}

function storeOrigin(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Shopify's CDN resizes on request; 1080 px is all Instagram shows. */
function sized(src: string): string {
  return `${src}${src.includes("?") ? "&" : "?"}width=1080`;
}

export default function StoreProductPicker({
  open,
  maxSelectable,
  onClose,
  onPick,
}: {
  open: boolean;
  maxSelectable: number;
  onClose: () => void;
  onPick: (products: StoreProduct[]) => void;
}) {
  const { t, locale } = useI18n();
  const [store, setStore] = useState(DEFAULT_STORE);
  const [storeDraft, setStoreDraft] = useState(DEFAULT_STORE);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const saved = readStore();
      setStore(saved);
      setStoreDraft(saved);
      setSelected([]);
      setQuery("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const origin = storeOrigin(store);
    if (!origin) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const meta = await fetch(`${origin}/meta.json`).then((r) => r.json()).catch(() => null);
          const currency = typeof meta?.currency === "string" ? meta.currency : null;
          const money = (value: string) =>
            currency
              ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value))
              : value;
          const all: StoreProduct[] = [];
          for (let page = 1; page <= 4; page++) {
            const res = await fetch(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`);
            if (!res.ok) throw new Error(String(res.status));
            const data = (await res.json()) as { products?: ShopifyProduct[] };
            const batch = data.products ?? [];
            for (const p of batch) {
              all.push({
                id: p.id,
                title: p.title,
                url: `${origin}/products/${p.handle}`,
                images: p.images.map((image) => sized(image.src)),
                price: p.variants[0] ? money(p.variants[0].price) : "",
              });
            }
            if (batch.length < PAGE_SIZE) break;
          }
          if (!cancelled) setProducts(all);
          try {
            window.localStorage.setItem(STORE_KEY, origin);
          } catch {
            // Remembering the store is a convenience only.
          }
        } catch {
          if (!cancelled) {
            setProducts([]);
            setError(t("Could not read products from this store. Check the address (a Shopify store, not password protected)."));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, store, locale, t]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;
  }, [products, query]);

  if (!open) return null;

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= maxSelectable ? prev : [...prev, id]
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("Choose products")}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{t("Choose products")}</h2>
            <button onClick={onClose} className="text-sm text-muted hover:text-foreground" aria-label={t("Close")}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const origin = storeOrigin(storeDraft);
                if (origin) setStore(origin);
                else setError(t("Enter the store address, e.g. https://ofsyd.com"));
              }}
            >
              <input
                value={storeDraft}
                onChange={(e) => setStoreDraft(e.target.value)}
                className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm"
                aria-label={t("Store address")}
              />
              <button className="shrink-0 rounded border border-border px-3 py-2 text-sm text-muted hover:text-foreground">
                {t("Load")}
              </button>
            </form>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search products")}
              className="rounded border border-border bg-surface px-3 py-2 text-sm sm:w-56"
            />
          </div>
          <p className="text-xs text-muted">
            {t("Pick up to {count} products. Each becomes a card with its photo, name, price and a Shop now button.", {
              count: maxSelectable,
            })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">{t("Loading products…")}</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-error">{error}</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t("No products found.")}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
              {shown.map((product) => {
                const order = selected.indexOf(product.id);
                const isSelected = order >= 0;
                const full = !isSelected && selected.length >= maxSelectable;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggle(product.id)}
                    disabled={full}
                    className={`relative min-w-0 overflow-hidden rounded-lg border-2 text-left transition-colors disabled:opacity-40 ${
                      isSelected ? "border-accent" : "border-transparent hover:border-border"
                    }`}
                  >
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.images[0]} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    ) : (
                      <span className="block aspect-square w-full bg-surface" />
                    )}
                    <span className="block px-1.5 py-1.5">
                      <span className="line-clamp-2 block text-xs font-medium">{product.title}</span>
                      <span className="block text-xs text-muted">{product.price}</span>
                    </span>
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <span className="text-xs text-muted">{t("{count} selected", { count: selected.length })}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
              {t("Cancel")}
            </button>
            <button
              onClick={() => {
                onPick(selected.map((id) => products.find((p) => p.id === id)).filter((p): p is StoreProduct => Boolean(p)));
                onClose();
              }}
              disabled={selected.length === 0}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t("Add {count} cards", { count: selected.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
