"use client";

import { AlertTriangle, MessageCircleQuestion, Tag } from "lucide-react";
/**
 * DM auto-replies, four kinds of rule:
 * - KEYWORD: a DM or story reply containing one of the words;
 * - DEFAULT: any DM no keyword rule answered (a welcome or away message);
 * - STORY_MENTION: someone mentions the account in their story;
 * - ICE_BREAKER: a tap on one of up to four questions Instagram shows when
 *   someone opens a new conversation.
 * Each answers with a message module or a text. Stored as campaigns with
 * dmOnly set, so sending, rate limits and DM logs are shared with them.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { scheduleState } from "@/lib/campaigns/schedule";

type RuleType = "KEYWORD" | "DEFAULT" | "STORY_MENTION" | "ICE_BREAKER";
type HoursMode = "ALWAYS" | "OPEN" | "CLOSED";

interface Conflict {
  otherId: string;
  otherName: string;
  kind: "comment" | "dm" | "story" | "default";
}

interface Rule {
  id: string;
  name: string;
  keywords: string[];
  dmOnly: boolean;
  dmRuleType: RuleType;
  iceBreakerQuestion: string | null;
  dmMessage: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  oncePerUser: boolean;
  cooldownMinutes: number;
  hoursMode: HoursMode;
  addTags: string[];
  instagramAccountId: string;
  instagramAccount: { username: string };
  messageModule: { id: string; name: string } | null;
  analytics: { sent: number; failed: number; skipped: number; clicks: number };
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

const COOLDOWN_CHOICES = [0, 10, 30, 60, 180, 720, 1440];
// Default replies and story mentions answer a person once a day unless a
// cooldown is chosen, so "no limit" is not offered for them.
const usesDailyDefault = (type: RuleType) => type === "DEFAULT" || type === "STORY_MENTION";

function splitList(text: string): string[] {
  return text
    .split(/[,，、\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

const inputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

/** "2026-10-09T15:30" in the browser's zone for a datetime-local input. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export default function DmKeywordsPage() {
  const { t, locale } = useI18n();
  // Captured once per visit for the schedule badges.
  const [now] = useState(() => Date.now());
  const [rules, setRules] = useState<Rule[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>("KEYWORD");
  const [name, setName] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const [question, setQuestion] = useState("");
  const [replyMode, setReplyMode] = useState<ReplyMode>("module");
  const [moduleId, setModuleId] = useState("");
  const [dmText, setDmText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [cooldownMinutes, setCooldownMinutes] = useState(30);
  const [oncePerUser, setOncePerUser] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [hoursMode, setHoursMode] = useState<HoursMode>("ALWAYS");
  const [tagText, setTagText] = useState("");
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

  const keywords = useMemo(() => splitList(keywordText), [keywordText]);
  const tags = useMemo(() => splitList(tagText), [tagText]);

  const activeIceBreakers = rules.filter((r) => r.dmRuleType === "ICE_BREAKER" && r.isActive).length;

  function resetForm(type: RuleType) {
    setRuleType(type);
    setName("");
    setKeywordText("");
    setQuestion("");
    setReplyMode(modules.length > 0 ? "module" : "text");
    setModuleId(modules[0]?.id ?? "");
    setDmText("");
    setCooldownMinutes(usesDailyDefault(type) ? 1440 : type === "KEYWORD" ? 30 : 0);
    setOncePerUser(false);
    setStartsAt("");
    setEndsAt("");
    setHoursMode("ALWAYS");
    setTagText("");
    setError(null);
    setWarnings([]);
  }

  function openNew() {
    setEditingId(null);
    resetForm("KEYWORD");
    setFormOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id);
    setRuleType(rule.dmRuleType);
    setName(rule.name);
    setKeywordText(rule.keywords.join(", "));
    setQuestion(rule.iceBreakerQuestion ?? "");
    setReplyMode(rule.messageModule ? "module" : "text");
    setModuleId(rule.messageModule?.id ?? modules[0]?.id ?? "");
    setDmText(rule.messageModule ? "" : rule.dmMessage);
    setAccountId(rule.instagramAccountId);
    setCooldownMinutes(rule.cooldownMinutes);
    setOncePerUser(rule.oncePerUser);
    setStartsAt(toLocalInput(rule.startsAt));
    setEndsAt(toLocalInput(rule.endsAt));
    setHoursMode(rule.hoursMode ?? "ALWAYS");
    setTagText((rule.addTags ?? []).join(", "));
    setError(null);
    setWarnings([]);
    setFormOpen(true);
  }

  async function save() {
    setError(null);
    if (ruleType === "KEYWORD") {
      if (keywords.length === 0) return setError(t("Add at least one keyword."));
      if (keywords.length > 10) return setError(t("Up to 10 keywords per rule."));
    }
    if (ruleType === "ICE_BREAKER" && !question.trim()) return setError(t("Write the question people will tap."));
    if (replyMode === "module" && !moduleId) return setError(t("Choose a message module."));
    if (replyMode === "text" && !dmText.trim()) return setError(t("Write the reply text."));
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
      return setError(t("The end must be after the start."));
    if (tags.length > 10 || tags.some((tag) => tag.length > 30))
      return setError(t("Up to 10 tags, 30 characters each."));
    setSaving(true);

    const defaultName =
      ruleType === "KEYWORD"
        ? keywords.join(" / ")
        : ruleType === "ICE_BREAKER"
          ? question.trim()
          : ruleType === "DEFAULT"
            ? t("Default reply")
            : t("Story mention reply");
    const payload = {
      name: (name.trim() || defaultName).slice(0, 100),
      keywords: ruleType === "KEYWORD" ? keywords : [],
      iceBreakerQuestion: ruleType === "ICE_BREAKER" ? question.trim() : null,
      messageModuleId: replyMode === "module" ? moduleId : null,
      dmMessage: replyMode === "text" ? dmText.trim() : "",
      cooldownMinutes,
      oncePerUser,
      startsAt: ruleType === "ICE_BREAKER" ? null : fromLocalInput(startsAt),
      endsAt: ruleType === "ICE_BREAKER" ? null : fromLocalInput(endsAt),
      hoursMode: ruleType === "ICE_BREAKER" ? "ALWAYS" : hoursMode,
      addTags: tags,
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
            body: JSON.stringify({
              ...payload,
              dmOnly: true,
              dmRuleType: ruleType,
              instagramAccountId: accountId || null,
              isActive: true,
            }),
          });
      const data = await res.json();
      if (!data.success) {
        setError(
          typeof data.error === "string" && data.error.includes("4 ice breakers")
            ? t("Instagram shows at most 4 questions. Pause one first.")
            : t("Could not save the rule.")
        );
        return;
      }
      if (data.iceBreakerError) setNotice(t("Saved, but Instagram did not accept the questions yet. Try saving again in a minute."));
      const found: Conflict[] = (data.warnings ?? []).filter((w: Conflict) => w.kind !== "comment");
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
    const res = await fetch(`/api/automations?id=${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    const data = await res.json().catch(() => null);
    if (data && !data.success && typeof data.error === "string" && data.error.includes("4 ice breakers")) {
      setNotice(t("Instagram shows at most 4 questions. Pause one first."));
    }
    void load();
  }

  async function remove(rule: Rule) {
    if (!confirm(t("Delete this rule? This cannot be undone."))) return;
    await fetch(`/api/automations?id=${rule.id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  const typeLabel = (type: RuleType) =>
    type === "KEYWORD"
      ? t("Keyword")
      : type === "DEFAULT"
        ? t("Default reply")
        : type === "STORY_MENTION"
          ? t("Story mention")
          : t("Ice breaker");

  const hoursLabel = (mode: HoursMode) =>
    mode === "OPEN" ? t("During business hours") : mode === "CLOSED" ? t("Outside business hours") : t("Any time");

  const cooldownLabel = (minutes: number) =>
    minutes === 0
      ? t("No limit")
      : minutes < 60
        ? t("{count} minutes", { count: minutes })
        : minutes < 1440
          ? t("{count} hours", { count: minutes / 60 })
          : t("{count} days", { count: minutes / 1440 });

  if (loading) return <div className="panel h-40 rounded" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1 text-sm text-muted">
          <p>{t("Reply automatically when someone DMs a keyword, sends anything else (default reply), mentions you in their story, or taps one of your conversation-starter questions.")}</p>
          <p className="text-xs">
            {t("Keywords ignore case and count anywhere in the message. When a person on your team replies by hand, automatic replies to that conversation pause for a while (change it in Settings).")}
          </p>
        </div>
        <button
          onClick={openNew}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t("New rule")}
        </button>
      </div>

      {notice && (
        <div className="rounded border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{notice}</div>
      )}

      {formOpen && (
        <section className="panel space-y-4 rounded p-5">
          <h3 className="text-sm font-semibold">{editingId ? t("Edit rule") : t("New rule")}</h3>

          {!editingId && (
            <div className="space-y-2">
              <span className="block text-xs text-muted">{t("Reply when")}</span>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["KEYWORD", "DEFAULT", "STORY_MENTION", "ICE_BREAKER"] as RuleType[]).map((type) => (
                  <label key={type} className="flex items-center gap-2">
                    <input type="radio" checked={ruleType === type} onChange={() => resetForm(type)} />
                    {type === "KEYWORD"
                      ? t("someone DMs a keyword")
                      : type === "DEFAULT"
                        ? t("someone DMs anything no keyword rule answers")
                        : type === "STORY_MENTION"
                          ? t("someone mentions me in their story")
                          : t("someone taps a conversation-starter question")}
                  </label>
                ))}
              </div>
            </div>
          )}

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

          {ruleType === "KEYWORD" && (
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
          )}

          {ruleType === "DEFAULT" && (
            <p className="rounded border border-border bg-surface px-3 py-2 text-xs text-muted">
              {t("Answers any DM that no keyword rule matched: a welcome message, or an away message if you limit it to outside business hours. Each person gets it at most once per cooldown (once a day by default), and it stays quiet while someone on your team is chatting.")}
            </p>
          )}

          {ruleType === "STORY_MENTION" && (
            <p className="rounded border border-border bg-surface px-3 py-2 text-xs text-muted">
              {t("When someone tags your account in their story, they get this reply as a DM. To avoid repeating yourself to people who tag you often, each person gets it at most once per cooldown.")}
            </p>
          )}

          {ruleType === "ICE_BREAKER" && (
            <label className="block">
              <span className="mb-1 flex justify-between text-xs text-muted">
                <span>{t("Question shown in a new conversation")}</span>
                <span>{question.length}/80</span>
              </span>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={80}
                placeholder={t("e.g. How long does shipping take?")}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {t("Instagram shows up to 4 questions when someone opens a chat with you for the first time. {count} of 4 in use.", { count: activeIceBreakers })}
              </span>
            </label>
          )}

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

          {ruleType !== "ICE_BREAKER" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">{t("Same person can trigger it again after")}</span>
                <select
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                  className={inputClass}
                  disabled={oncePerUser}
                >
                  {COOLDOWN_CHOICES.filter((minutes) => minutes > 0 || !usesDailyDefault(ruleType)).map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {cooldownLabel(minutes)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-5 text-sm">
                <input type="checkbox" checked={oncePerUser} onChange={(e) => setOncePerUser(e.target.checked)} />
                {t("Reply to each person only once")}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">{t("Starts (optional)")}</span>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">{t("Ends (optional)")}</span>
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-muted">{t("Answer")}</span>
                <select value={hoursMode} onChange={(e) => setHoursMode(e.target.value as HoursMode)} className={inputClass}>
                  {(["ALWAYS", "OPEN", "CLOSED"] as HoursMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {hoursLabel(mode)}
                    </option>
                  ))}
                </select>
                {hoursMode !== "ALWAYS" && (
                  <span className="mt-1 block text-xs text-muted">
                    {t("Uses the business hours set for the account in")}{" "}
                    <Link href="/settings" className="text-accent hover:underline">
                      {t("Settings")}
                    </Link>
                    {t(". Without hours, the account counts as always open.")}
                  </span>
                )}
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Tag the people it answers")} <span className="text-muted">{t("(optional)")}</span>
            </span>
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder={t("e.g. 梅西系列, VIP")}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted">
              {t("Tags show on Contacts, where you can send a module to everyone with a tag.")}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Rule name")} <span className="text-muted">{t("(optional)")}</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
          </label>

          {error && <p className="text-sm text-error">{error}</p>}
          {warnings.length > 0 && (
            <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("Saved, but these answer the same DMs, and only the oldest one replies:")}{" "}
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
        <div className="panel rounded p-8 text-center text-sm text-muted">{t("No DM keyword rules yet.")}</div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const conflicts = (rule.conflicts ?? []).filter((c) => c.kind !== "comment");
            const schedule = scheduleState(rule.startsAt, rule.endsAt, now);
            return (
              <div key={rule.id} className="panel flex flex-wrap items-start gap-4 rounded p-4">
                <div className="min-w-[12rem] flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{rule.name}</h3>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {typeLabel(rule.dmRuleType)}
                    </span>
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
                    {schedule === "scheduled" && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {t("Starts {date}", { date: new Date(rule.startsAt as string).toLocaleString(locale) })}
                      </span>
                    )}
                    {schedule === "ended" && (
                      <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-muted">
                        {t("Ended")}
                      </span>
                    )}
                  </div>
                  {rule.dmRuleType === "KEYWORD" && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {rule.keywords.map((k) => (
                        <span key={k} className="rounded-md border border-accent/10 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {rule.dmRuleType === "ICE_BREAKER" && (
                    <p className="mb-2 flex items-center gap-1.5 text-sm"><MessageCircleQuestion className="h-4 w-4 shrink-0 text-muted" aria-hidden />{rule.iceBreakerQuestion}</p>
                  )}
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
                    {rule.analytics.sent} {t("sent")} · {rule.analytics.skipped} {t("skipped")} · {rule.analytics.failed}{" "}
                    {t("failed")} · {rule.analytics.clicks} {t("clicks")}
                    {rule.dmRuleType !== "ICE_BREAKER" && (
                      <>
                        {" · "}
                        {rule.oncePerUser
                          ? t("Once per person")
                          : t("Cooldown: {value}", {
                              value: cooldownLabel(
                                rule.cooldownMinutes === 0 && usesDailyDefault(rule.dmRuleType) ? 1440 : rule.cooldownMinutes
                              ),
                            })}
                      </>
                    )}
                    {rule.hoursMode && rule.hoursMode !== "ALWAYS" && <> · {hoursLabel(rule.hoursMode)}</>}
                    {(rule.addTags ?? []).length > 0 && <> · <Tag className="inline h-3 w-3 align-[-1px]" aria-hidden /> {rule.addTags.join(", ")}</>}
                  </p>
                  {conflicts.length > 0 && (
                    <p className="mt-2 text-xs text-warning">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />{t("Overlaps with (only the oldest replies):")} {conflicts.map((c) => c.otherName).join("、")}
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
