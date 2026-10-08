"use client";

/**
 * Message modules: reusable replies (carousel cards with images and buttons)
 * that campaigns and DM keyword rules point at.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface ModuleSummary {
  id: string;
  name: string;
  cardCount: number;
  coverImage: string | null;
  clickCount: number;
  updatedAt: string;
  automations: { id: string; name: string; dmOnly: boolean; isActive: boolean }[];
}

export default function ModulesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/modules", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.success) setModules(data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred like the campaigns list, so the fetch never sets state inside
    // the effect body itself.
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function duplicate(id: string) {
    const res = await fetch("/api/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateFrom: id }),
    });
    const data = await res.json().catch(() => null);
    if (data?.success) void load();
  }

  async function remove(moduleSummary: ModuleSummary) {
    if (moduleSummary.automations.length > 0) {
      setNotice(t("This module is still used by a campaign or DM rule. Switch them to another reply first."));
      return;
    }
    if (!confirm(t("Delete this module? This cannot be undone."))) return;
    const res = await fetch(`/api/modules?id=${moduleSummary.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.success) setModules((prev) => prev.filter((m) => m.id !== moduleSummary.id));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="panel h-24 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-sm text-muted">
          {t("A module is a reply you build once — carousel cards with images and buttons — and reuse in campaigns and DM keyword rules.")}
        </p>
        <Link
          href="/modules/new"
          className="rounded bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t("New module")}
        </Link>
      </div>

      {notice && (
        <div className="rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{notice}</div>
      )}

      {modules.length === 0 ? (
        <div className="panel rounded p-8 text-center sm:p-12">
          <h3 className="mb-2 text-lg font-semibold">{t("No modules yet")}</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-muted">
            {t("Build your first carousel, then pick it as the reply in a campaign or a DM keyword rule.")}
          </p>
          <Link
            href="/modules/new"
            className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {t("New module")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((moduleSummary) => (
            <div
              key={moduleSummary.id}
              onClick={() => router.push(`/modules/${moduleSummary.id}`)}
              className="panel flex cursor-pointer flex-wrap items-center gap-4 rounded p-4 transition-all hover:border-border-hover"
            >
              {moduleSummary.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={moduleSummary.coverImage} alt="" className="h-14 w-14 shrink-0 rounded border border-border object-cover" />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded border border-dashed border-border" />
              )}
              <div className="min-w-[12rem] flex-1">
                <h3 className="truncate text-sm font-semibold">{moduleSummary.name}</h3>
                <p className="mt-1 text-xs text-muted">
                  {t("{count} cards", { count: moduleSummary.cardCount })} ·{" "}
                  {t("{count} clicks", { count: moduleSummary.clickCount })} ·{" "}
                  {moduleSummary.automations.length > 0
                    ? t("Used by {count}", { count: moduleSummary.automations.length })
                    : t("Not used yet")}{" "}
                  · {new Date(moduleSummary.updatedAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => void duplicate(moduleSummary.id)}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:border-border-hover hover:text-foreground"
                >
                  {t("Duplicate module")}
                </button>
                <button
                  onClick={() => void remove(moduleSummary)}
                  className="rounded-full border border-error/20 px-3 py-1 text-xs font-medium text-error hover:bg-error/10"
                >
                  {t("Delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
