"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Email + password sign-in, with the emailed sign-in link as a second option
 * where the deployment can send email.
 */
export default function LoginForm({
  callbackUrl,
  emailLinkEnabled,
  sendMagicLink,
}: {
  callbackUrl: string;
  emailLinkEnabled: boolean;
  sendMagicLink: (formData: FormData) => Promise<void>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only ever continue to a page of this site.
  const next = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard";

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        window.location.assign(next);
        return;
      }
      setError(
        data?.error === "locked"
          ? t("Too many attempts. Try again in 15 minutes.")
          : t("Wrong email or password. If you have not set a password yet, sign in with a link first and set one in Settings.")
      );
    } catch {
      setError(t("Could not sign in. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-foreground/40 focus:outline-none";

  return (
    <div className="space-y-5">
      {emailLinkEnabled && (
        <div className="grid grid-cols-2 rounded-lg bg-surface-hover p-[3px] text-sm" role="tablist">
          {(["password", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium ${
                mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "password" ? <KeyRound className="h-4 w-4" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
              {m === "password" ? t("Password") : t("Email link")}
            </button>
          ))}
        </div>
      )}

      {mode === "password" ? (
        <form onSubmit={signIn} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-muted">{t("Email")}</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={input}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-muted">{t("Password")}</span>
            <span className="relative block">
              <input
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${input} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
                aria-label={show ? t("Hide password") : t("Show password")}
              >
                {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </span>
          </label>
          {error && <p className="rounded-md bg-error-bg px-3 py-2 text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? t("Signing in…") : t("Sign in")}
          </button>
        </form>
      ) : (
        <form action={sendMagicLink} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-muted">{t("Work email")}</span>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className={input} />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {t("Email me a magic link")}
          </button>
        </form>
      )}
    </div>
  );
}
