"use client";

/**
 * Broadcasts: send a message module to the contacts who messaged the account
 * in the last 24 hours, optionally only those with a tag. Instagram allows no
 * other recipients for automated messages, so the audience is always that.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Broadcast {
  id: string;
  name: string;
  status: "QUEUED" | "SENDING" | "DONE" | "CANCELLED";
  tags: string[];
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  createdAt: string;
  instagramAccount: { username: string };
  messageModule: { id: string; name: string } | null;
}

interface Option {
  id: string;
  name?: string;
  username?: string;
}

const inputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export default function BroadcastsPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [modules, setModules] = useState<Option[]>([]);
  const [tagOptions, setTagOptions] = useState<{ tag: string; count: number }[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  const [accountId, setAccountId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<{ recipients: number; capped: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/broadcasts", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.success) setBroadcasts(data.data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        fetch("/api/instagram/accounts").then((r) => r.json()).catch(() => null),
        fetch("/api/modules", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        loadHistory(),
      ]).then(([accountRes, moduleRes]) => {
        if (accountRes?.success) {
          const list: Option[] = accountRes.data.instagramAccounts ?? [];
          setAccounts(list);
          setAccountId((current) => current || list[0]?.id || "");
        }
        if (moduleRes?.success) {
          setModules(moduleRes.data);
          setModuleId((current) => current || moduleRes.data[0]?.id || "");
        }
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  // Tags of the chosen account's contacts.
  useEffect(() => {
    if (!accountId) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/contacts?accountId=${accountId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success) setTagOptions(data.data.tags);
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountId]);

  // Refresh progress while something is sending.
  useEffect(() => {
    if (!broadcasts.some((b) => b.status === "QUEUED" || b.status === "SENDING")) return;
    const timer = window.setInterval(() => void loadHistory(), 5000);
    return () => window.clearInterval(timer);
  }, [broadcasts, loadHistory]);

  const body = (preview: boolean) =>
    JSON.stringify({
      instagramAccountId: accountId || null,
      messageModuleId: moduleId,
      name: name.trim() || t("Broadcast {date}", { date: new Date().toLocaleDateString(locale) }),
      tags,
      preview,
    });

  async function countAudience() {
    setMessage(null);
    setAudience(null);
    if (!moduleId) return setMessage(t("Choose a message module."));
    setBusy(true);
    const res = await fetch("/api/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(true) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.success) setAudience(data.data);
    else setMessage(t("Could not count the recipients."));
  }

  async function send() {
    if (!audience || audience.recipients === 0) return;
    if (!confirm(t("Send this module to {count} people now?", { count: audience.recipients }))) return;
    setBusy(true);
    const res = await fetch("/api/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(false) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.success) {
      setAudience(null);
      setName("");
      setMessage(t("Sending. Progress shows below."));
      void loadHistory();
    } else {
      setMessage(
        data?.error === "Nobody can be messaged right now"
          ? t("Nobody can be messaged right now.")
          : t("Could not start the broadcast.")
      );
    }
  }

  async function cancel(broadcast: Broadcast) {
    if (!confirm(t("Stop this broadcast? People who already got it keep it."))) return;
    await fetch(`/api/broadcasts?id=${broadcast.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel: true }),
    });
    void loadHistory();
  }

  const statusLabel = (status: Broadcast["status"]) =>
    status === "QUEUED" ? t("Queued") : status === "SENDING" ? t("Sending") : status === "DONE" ? t("Done") : t("Cancelled");

  if (loading) return <div className="panel h-40 rounded" />;

  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-1 text-sm text-muted">
        <p>{t("Send a message module to people who messaged you in the last 24 hours.")}</p>
        <p className="text-xs">
          {t("Instagram only allows automated messages within 24 hours of a person's last message, so nobody else can be reached. People who sent STOP, or who are chatting with your team, are skipped.")}
        </p>
      </div>

      <section className="panel space-y-4 rounded p-5">
        <h3 className="text-sm font-semibold">{t("New broadcast")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{t("Instagram account")}</span>
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setTags([]);
                  setAudience(null);
                }}
                className={inputClass}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t("Message module")}</span>
            {modules.length === 0 ? (
              <p className="text-sm text-muted">
                {t("No modules yet.")}{" "}
                <Link href="/modules/new" className="text-accent hover:underline">
                  {t("Create one")}
                </Link>
              </p>
            ) : (
              <select
                value={moduleId}
                onChange={(e) => {
                  setModuleId(e.target.value);
                  setAudience(null);
                }}
                className={inputClass}
              >
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Name")} {t("(optional)")}
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-xs text-muted">{t("Only people tagged (any of these; none = everyone)")}</span>
          {tagOptions.length === 0 ? (
            <p className="text-xs text-muted">{t("No tags yet. Campaigns and DM rules can tag the people they answer.")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((item) => {
                const on = tags.includes(item.tag);
                return (
                  <button
                    key={item.tag}
                    onClick={() => {
                      setTags((prev) => (on ? prev.filter((x) => x !== item.tag) : [...prev, item.tag].slice(0, 10)));
                      setAudience(null);
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      on ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted"
                    }`}
                  >
                    {item.tag} · {item.count}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void countAudience()}
            disabled={busy}
            className="rounded border border-border px-4 py-2 text-sm text-foreground hover:bg-surface disabled:opacity-50"
          >
            {t("Count recipients")}
          </button>
          {audience && (
            <>
              <span className="text-sm text-muted">
                {t("{count} people can get it now", { count: audience.recipients })}
                {audience.capped && ` · ${t("capped at 5,000 per broadcast")}`}
              </span>
              <button
                onClick={() => void send()}
                disabled={busy || audience.recipients === 0}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t("Send to {count} people", { count: audience.recipients })}
              </button>
            </>
          )}
        </div>
        {message && <p className="text-sm text-muted">{message}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("Past broadcasts")}</h3>
        {broadcasts.length === 0 ? (
          <div className="panel rounded p-6 text-center text-sm text-muted">{t("No broadcasts yet.")}</div>
        ) : (
          broadcasts.map((b) => (
            <div key={b.id} className="panel flex flex-wrap items-center gap-3 rounded p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">{b.name}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{statusLabel(b.status)}</span>
                  {b.tags.length > 0 && <span className="text-xs text-muted">🏷 {b.tags.join(", ")}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {new Date(b.createdAt).toLocaleString(locale)} · @{b.instagramAccount.username} ·{" "}
                  {b.messageModule?.name ?? t("(module deleted)")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("{sent} sent · {failed} failed · {skipped} skipped · {pending} waiting, of {total}", {
                    sent: b.sent,
                    failed: b.failed,
                    skipped: b.skipped,
                    pending: b.pending,
                    total: b.recipients,
                  })}
                </p>
              </div>
              {(b.status === "QUEUED" || b.status === "SENDING") && (
                <button
                  onClick={() => void cancel(b)}
                  className="rounded-full border border-error/20 px-3 py-1 text-xs font-medium text-error hover:bg-error/10"
                >
                  {t("Stop sending")}
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
