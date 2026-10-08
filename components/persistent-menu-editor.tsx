"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface MenuDraft {
  title: string;
  kind: "url" | "module";
  url: string;
  moduleId: string;
}

const MAX_ITEMS = 5;
const TITLE_MAX = 30;

const inputClass =
  "w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

/**
 * The menu Instagram keeps in the DM composer for this account. Items open a
 * link or send a message module.
 */
export default function PersistentMenuEditor({
  accountId,
  initial,
}: {
  accountId: string;
  initial: { title: string; url: string | null; moduleId: string | null }[];
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<MenuDraft[]>(
    initial.map((item) => ({
      title: item.title,
      kind: item.moduleId ? "module" : "url",
      url: item.url ?? "",
      moduleId: item.moduleId ?? "",
    }))
  );
  const [modules, setModules] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/modules", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success) setModules(payload.data);
      })
      .catch(() => {});
  }, []);

  function update(index: number, patch: Partial<MenuDraft>) {
    setStatus(null);
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    for (const item of items) {
      if (!item.title.trim() || (item.kind === "url" ? !/^https:\/\/\S+$/i.test(item.url.trim()) : !item.moduleId)) {
        setStatus(t("Every menu item needs a title and an https:// link or a module."));
        return;
      }
    }
    setSaving(true);
    const res = await fetch(`/api/instagram/accounts?id=${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persistentMenu: items.map((item) =>
          item.kind === "url"
            ? { title: item.title.trim(), url: item.url.trim(), moduleId: null }
            : { title: item.title.trim(), url: null, moduleId: item.moduleId }
        ),
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!data?.success) setStatus(t("Could not save the menu."));
    else if (data.menuError) setStatus(t("Saved, but Instagram did not accept the menu yet. Try saving again in a minute."));
    else setStatus(t("Changes saved"));
  }

  return (
    <div className="mt-3 space-y-2 rounded border border-border p-3">
      <div>
        <p className="text-xs font-medium text-foreground">{t("DM menu")}</p>
        <p className="text-xs text-muted">
          {t("Up to 5 shortcuts Instagram keeps next to the message box in every chat with you. Each opens a link or sends a module.")}
        </p>
      </div>
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={item.title}
            maxLength={TITLE_MAX}
            onChange={(e) => update(index, { title: e.target.value })}
            placeholder={t("Menu title")}
            className={`${inputClass} sm:w-40`}
          />
          <select
            value={item.kind}
            onChange={(e) => update(index, { kind: e.target.value as MenuDraft["kind"] })}
            className={`${inputClass} sm:w-32`}
          >
            <option value="url">{t("Open a link")}</option>
            <option value="module">{t("Send a module")}</option>
          </select>
          {item.kind === "url" ? (
            <input
              value={item.url}
              onChange={(e) => update(index, { url: e.target.value })}
              placeholder="https://"
              className={inputClass}
            />
          ) : (
            <select value={item.moduleId} onChange={(e) => update(index, { moduleId: e.target.value })} className={inputClass}>
              <option value="">{t("Choose a module…")}</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setStatus(null);
              setItems((prev) => prev.filter((_, i) => i !== index));
            }}
            className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
            aria-label={t("Remove menu item")}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {items.length < MAX_ITEMS && (
          <button
            onClick={() => setItems((prev) => [...prev, { title: "", kind: "url", url: "", moduleId: "" }])}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("+ Add a menu item")}
          </button>
        )}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t("Saving…") : t("Save menu")}
        </button>
        {status && <span className="text-xs text-muted">{status}</span>}
      </div>
    </div>
  );
}
