"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/** Set or change your own sign-in password. */
export default function PasswordSettings() {
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<{ email: string | null; hasPassword: boolean; updatedAt: string | null } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/account/password", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success) setInfo(data.data);
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (next !== confirm) return setMessage({ ok: false, text: t("The two new passwords do not match.") });
    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current || undefined, newPassword: next }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.success) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setInfo((prev) => (prev ? { ...prev, hasPassword: true, updatedAt: new Date().toISOString() } : prev));
      setMessage({ ok: true, text: t("Password saved. You can now sign in with your email and this password.") });
      return;
    }
    const code = data?.error;
    setMessage({
      ok: false,
      text:
        code === "too_short"
          ? t("Use at least 8 characters.")
          : code === "too_simple"
            ? t("That password is too easy to guess.")
            : code === "wrong_current"
              ? t("The current password is wrong.")
              : t("Could not save the password."),
    });
  }

  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-foreground/40 focus:outline-none";

  return (
    <section className="panel space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">{t("Sign-in password")}</h2>
          <p className="mt-1 text-sm text-muted">
            {info?.hasPassword
              ? t("You sign in as {email}. Password last changed {date}.", {
                  email: info.email ?? "",
                  date: info.updatedAt ? new Date(info.updatedAt).toLocaleDateString(locale) : "—",
                })
              : t("Set a password to sign in with your email and password instead of a sign-in link.")}
          </p>
        </div>
      </div>
      <form onSubmit={save} className="grid gap-3 sm:max-w-md">
        {/* Lets password managers file the password under the right account. */}
        <input type="email" autoComplete="username" value={info?.email ?? ""} readOnly hidden />
        {info?.hasPassword && (
          <label className="block space-y-1.5">
            <span className="block text-xs text-muted">{t("Current password")}</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={input} />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted">{t("New password (at least 8 characters)")}</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs text-muted">{t("New password again")}</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required className={input} />
        </label>
        {message && (
          <p className={`rounded-md px-3 py-2 text-xs ${message.ok ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>{message.text}</p>
        )}
        <div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? t("Saving…") : info?.hasPassword ? t("Change password") : t("Set password")}
          </button>
        </div>
      </form>
    </section>
  );
}
