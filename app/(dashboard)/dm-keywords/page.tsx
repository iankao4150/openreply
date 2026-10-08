"use client";

/**
 * DM keyword rules: when someone sends a DM (or a story reply) containing one
 * of the words, answer with a message module or a text. Stored as campaigns
 * with dmOnly set, so sending, rate limits and DM logs are shared with them.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Conflict {
  otherId: string;
  otherName: string;
  kind: "comment" | "dm";
}

interface Rule {
  id: string;
  name: string;
  keywords: string[];
  dmOnly: boolean;
  dmMessage: string;
  isActive: boolean;
  instagramAccountId: string;
  instagramAccount: { username: string };
  messageModule: { id: string; name: string } | null;
  analytics: { sent: number; failed: number; clicks: number };
  conflicts?: Conflict[];
}

interface ModuleOption {
  id: string;
  name: string;
  cardCount: number;
}

interface AccountOption {
  id: string;
  username: string;
}

type ReplyMode = "module" | "text";

const inputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export default function DmKeywordsPage() {
  const { t } = useI18n();
  const [rules, setRules] = useState<Rule[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [replyMode, setReplyMode] = useState<ReplyMode>("module");
  const [moduleId, setModuleId] = useState("");
  const [dmText, setDmText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Conflict[]>([]);

  const load = useCallback(async () => {
    const [ruleRes, moduleRes, accountRes] = await Promise.all([
      fetch("/api/automations", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/modules", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/instagram/accounts").then((r) => r.json()).catch(() => null),
    ]);
    if (ruleRes?.success) setRules((ruleRes.data as Rule[]).filter((rule) => rule.dmOnly));
    if (moduleRes?.success) setModules(moduleRes.data);
    if (accountRes?.success) {
      const list: AccountOption[] = accountRes.data.instagramAccounts ?? [];
      setAccounts(list);
      setAccountId((current) => current || accountRes.data.selectedInstagramAccountId || list[0]?.id || "");
    }
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

  const keywords = useMemo(
    () =>
      keywordText
        .split(/[,，、\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordText]
  );

  function openNew() {
    setEditingId(null);
    setName("");
    setKeywordText("");
    setReplyMode(modules.length > 0 ? "module" : "text");
    setModuleId(modules[0]?.id ?? "");
    setDmText("");
    setError(null);
    setWarnings([]);
    setFormOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id);
    setName(rule.name);
    setKeywordText(rule.keywords.join(", "));
    setReplyMode(rule.messageModule ? "module" : "text");
    setModuleId(rule.messageModule?.id ?? modules[0]?.id ?? "");
    setDmText(rule.messageModule ? "" : rule.dmMessage);
    setAccountId(rule.instagramAccountId);
    setError(null);
    setWarnings([]);
    setFormOpen(true);
  }

  async function save() {
    setError(null);
    if (keywords.length === 0) return setError(t("Add at least one keyword."));
    if (keywords.length > 10) return setError(t("Up to 10 keywords per rule."));
    if (replyMode === "module" && !moduleId) return setError(t("Choose a message module."));
    if (replyMode === "text" && !dmText.trim()) return setError(t("Write the reply text."));
    setSaving(true);
    const payload = {
      name: name.trim() || keywords.join(" / ").slice(0, 100),
      keywords,
      messageModuleId: replyMode === "module" ? moduleId : null,
      dmMessage: replyMode === "text" ? dmText.trim() : "",
    };
    try {
      const res = editingId
        ? await fetch(`/api/automations?id=${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/automations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, dmOnly: true, instagramAccountId: accountId || null, isActive: true }),
          });
      const data = await res.json();
      if (!data.success) {
        setError(t("Could not save the rule."));
        return;
      }
      const found: Conflict[] = (data.warnings ?? []).filter((w: Conflict) => w.kind === "dm");
      setWarnings(found);
      if (found.length === 0) setFormOpen(false);
      void load();
    } catch {
      setError(t("Could not save the rule."));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: Rule) {
    await fetch(`/api/automations?id=${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    void load();
  }

  async function remove(rule: Rule) {
    if (!confirm(t("Delete this rule? This cannot be undone."))) return;
    await fetch(`/api/automations?id=${rule.id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  if (loading) return <div className="panel h-40 rounded" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-xl text-sm text-muted">
          {t("When someone DMs or replies to a story with one of these words, they get the reply right away. Matching ignores case, and a word inside a longer message still counts.")}
        </p>
        <button
          onClick={openNew}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t("New rule")}
        </button>
      </div>

      {formOpen && (
        <section className="panel space-y-4 rounded p-5">
          <h3 className="text-sm font-semibold">{editingId ? t("Edit rule") : t("New rule")}</h3>
          {accounts.length > 1 && !editingId && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{t("Instagram account")}</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t("Keywords (separate with commas)")}</span>
            <input
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={t("e.g. 梅西, messi, 256")}
              className={inputClass}
            />
            {keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span key={k} className="rounded-md border border-accent/10 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </label>
          <div className="space-y-2">
            <span className="block text-xs text-muted">{t("Reply with")}</span>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={replyMode === "module"} onChange={() => setReplyMode("module")} />
                {t("a message module")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={replyMode === "text"} onChange={() => setReplyMode("text")} />
                {t("a text message")}
              </label>
            </div>
            {replyMode === "module" ? (
              modules.length === 0 ? (
                <p className="text-sm text-muted">
                  {t("No modules yet.")}{" "}
                  <Link href="/modules/new" className="text-accent hover:underline">
                    {t("Create one")}
                  </Link>
                </p>
              ) : (
                <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={inputClass}>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {t("{count} cards", { count: m.cardCount })}
                    </option>
                  ))}
                </select>
              )
            ) : (
              <textarea
                value={dmText}
                onChange={(e) => setDmText(e.target.value)}
                maxLength={1000}
                rows={3}
                className={inputClass}
              />
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Rule name")} <span className="text-muted">{t("(optional)")}</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
          </label>

          {error && <p className="text-sm text-error">{error}</p>}
          {warnings.length > 0 && (
            <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("Saved, but these also answer the same words in DMs, so people would get more than one reply:")}{" "}
              {warnings.map((w) => w.otherName).join("、")}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setFormOpen(false)}
              className="rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              {warnings.length > 0 ? t("Close") : t("Cancel")}
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? t("Saving…") : t("Save")}
            </button>
          </div>
        </section>
      )}

      {rules.length === 0 && !formOpen ? (
        <div className="panel rounded p-8 text-center text-sm text-muted">
          {t("No DM keyword rules yet.")}
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const dmConflicts = (rule.conflicts ?? []).filter((c) => c.kind === "dm");
            return (
              <div key={rule.id} className="panel flex flex-wrap items-start gap-4 rounded p-4">
                <div className="min-w-[12rem] flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{rule.name}</h3>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      @{rule.instagramAccount.username}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.isActive ? "bg-success/10 text-success" : "bg-zinc-500/10 text-muted"
                      }`}
                    >
                      {rule.isActive ? t("Active") : t("Paused")}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {rule.keywords.map((k) => (
                      <span key={k} className="rounded-md border border-accent/10 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {rule.messageModule ? (
                      <>
                        {t("Module")}:{" "}
                        <Link href={`/modules/${rule.messageModule.id}`} className="text-accent hover:underline">
                          {rule.messageModule.name}
                        </Link>
                      </>
                    ) : (
                      <>&ldquo;{rule.dmMessage}&rdquo;</>
                    )}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {rule.analytics.sent} {t("sent")} · {rule.analytics.failed} {t("failed")} · {rule.analytics.clicks} {t("clicks")}
                  </p>
                  {dmConflicts.length > 0 && (
                    <p className="mt-2 text-xs text-warning">
                      ⚠ {t("Same words as:")} {dmConflicts.map((c) => c.otherName).join("、")}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => void toggle(rule)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
                  >
                    {rule.isActive ? t("Pause") : t("Resume")}
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
                  >
                    {t("Edit")}
                  </button>
                  <button
                    onClick={() => void remove(rule)}
                    className="rounded-full border border-error/20 px-3 py-1 text-xs font-medium text-error hover:bg-error/10"
                  >
                    {t("Delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
