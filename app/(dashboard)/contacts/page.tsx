"use client";

/**
 * Contacts: everyone who commented on a watched post, messaged the account,
 * tapped a button or mentioned it in a story, with the tags campaigns gave
 * them. Instagram lets the account message a person only within 24 hours of
 * their last message, so that window is shown per person.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Contact {
  id: string;
  account: string;
  userId: string;
  username: string | null;
  tags: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastInboundAt: string | null;
  lastCommentAt: string | null;
  interactions: number;
  canMessage: boolean;
}

interface AccountOption {
  id: string;
  username: string;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

const inputClass =
  "rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export default function ContactsPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [openWindow, setOpenWindow] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  // Fixed per load, so the remaining-window labels do not read the clock in render.
  const [loadedAt, setLoadedAt] = useState(0);

  const filters = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams(extra);
      if (accountId) params.set("accountId", accountId);
      if (tag) params.set("tag", tag);
      if (query.trim()) params.set("q", query.trim());
      if (openOnly) params.set("window", "open");
      return params;
    },
    [accountId, tag, query, openOnly]
  );

  const load = useCallback(
    async (cursor?: string) => {
      const res = await fetch(`/api/contacts?${filters(cursor ? { cursor } : {})}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setContacts((prev) => (cursor ? [...prev, ...data.data.contacts] : data.data.contacts));
        setTags(data.data.tags);
        setTotal(data.data.total);
        setOpenWindow(data.data.openWindow);
        setNextCursor(data.data.nextCursor);
        setLoadedAt(Date.now());
      }
      setLoading(false);
    },
    [filters]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/instagram/accounts")
        .then((r) => r.json())
        .then((data) => {
          if (data?.success) setAccounts(data.data.instagramAccounts ?? []);
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Typing in the search box waits a moment before asking the server.
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveTags(contact: Contact) {
    const next = tagDraft
      .split(/[,，、\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const res = await fetch(`/api/contacts?id=${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    });
    const data = await res.json().catch(() => null);
    if (data?.success) {
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, tags: next } : c)));
      setEditing(null);
    }
  }

  const ago = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const windowLeft = (iso: string | null) => {
    if (!iso || !loadedAt) return null;
    const left = WINDOW_MS - (loadedAt - new Date(iso).getTime());
    return left > 0 ? Math.max(1, Math.floor(left / 3_600_000)) : null;
  };

  if (loading) return <div className="panel h-40 rounded" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1 text-sm text-muted">
          <p>{t("Everyone who commented on a campaign post, messaged you, tapped a button or mentioned you in a story.")}</p>
          <p className="text-xs">
            {t("Instagram lets you message a person only within 24 hours of their last message to you. {count} people can be messaged right now.", { count: openWindow })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/broadcasts"
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t("New broadcast")}
          </Link>
          <a
            href={`/api/contacts?${filters({ format: "csv" })}`}
            className="rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            {t("Export CSV")}
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            <option value="">{t("All accounts")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                @{account.username}
              </option>
            ))}
          </select>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search username")}
          className={`${inputClass} w-48`}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          {t("Can message now")}
        </label>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTag("")}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${tag ? "border-border text-muted" : "border-accent bg-accent/10 text-foreground"}`}
          >
            {t("All")}
          </button>
          {tags.map((item) => (
            <button
              key={item.tag}
              onClick={() => setTag(item.tag === tag ? "" : item.tag)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                item.tag === tag ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted"
              }`}
            >
              {item.tag} · {item.count}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">{t("{count} contacts", { count: total })}</p>

      {contacts.length === 0 ? (
        <div className="panel rounded p-8 text-center text-sm text-muted">
          {t("No contacts yet. People appear here once they comment on a campaign post or message you.")}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const hours = windowLeft(contact.lastInboundAt);
            return (
              <div key={contact.id} className="panel flex flex-col gap-2 rounded p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {contact.username ? (
                      <a
                        href={`https://www.instagram.com/${encodeURIComponent(contact.username)}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-semibold text-foreground hover:underline"
                      >
                        @{contact.username}
                      </a>
                    ) : (
                      <span className="text-sm font-semibold text-muted">{t("(name unknown)")}</span>
                    )}
                    {accounts.length > 1 && <span className="text-xs text-muted">→ @{contact.account}</span>}
                    {hours !== null && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        {t("Can message · {count} h left", { count: hours })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {t("Last message")}: {ago(contact.lastInboundAt)} · {t("Last comment")}: {ago(contact.lastCommentAt)} ·{" "}
                    {t("{count} interactions", { count: contact.interactions })}
                  </p>
                  {editing === contact.id ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        placeholder={t("e.g. 梅西系列, VIP")}
                        className={`${inputClass} flex-1 py-1 text-xs`}
                        autoFocus
                      />
                      <button
                        onClick={() => void saveTags(contact)}
                        className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white"
                      >
                        {t("Save")}
                      </button>
                      <button onClick={() => setEditing(null)} className="text-xs text-muted">
                        {t("Cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {contact.tags.map((value) => (
                        <span key={value} className="rounded-md border border-accent/10 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                          {value}
                        </span>
                      ))}
                      <button
                        onClick={() => {
                          setEditing(contact.id);
                          setTagDraft(contact.tags.join(", "));
                        }}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        {contact.tags.length ? t("Edit tags") : t("+ Add tags")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {nextCursor && (
            <button
              onClick={() => void load(nextCursor)}
              className="w-full rounded border border-border py-2 text-sm text-muted hover:text-foreground"
            >
              {t("Load more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
