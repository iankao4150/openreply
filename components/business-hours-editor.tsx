"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Hours {
  timezone: string;
  days: number[];
  open: string;
  close: string;
}

const ZONES = [
  "Asia/Taipei",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "UTC",
];

function parseHours(value: unknown): Hours | null {
  if (!value || typeof value !== "object") return null;
  const h = value as Partial<Hours>;
  if (typeof h.timezone !== "string" || !Array.isArray(h.days) || !h.open || !h.close) return null;
  return { timezone: h.timezone, days: h.days, open: h.open, close: h.close };
}

/**
 * Opening hours for one account. DM rules can answer only inside them or only
 * outside them (an away message).
 */
export default function BusinessHoursEditor({ accountId, initial }: { accountId: string; initial: unknown }) {
  const { t, locale } = useI18n();
  const stored = parseHours(initial);
  const [enabled, setEnabled] = useState(Boolean(stored));
  const [hours, setHours] = useState<Hours>(
    stored ?? { timezone: "Asia/Taipei", days: [1, 2, 3, 4, 5], open: "10:00", close: "19:00" }
  );
  const [status, setStatus] = useState<string | null>(null);

  // Sunday-first labels in the reader's language (2026-10-04 was a Sunday).
  const dayNames = Array.from({ length: 7 }, (_, day) =>
    new Date(Date.UTC(2026, 9, 4 + day)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" })
  );
  const zones = ZONES.includes(hours.timezone) ? ZONES : [hours.timezone, ...ZONES];

  async function save(next: Hours | null) {
    setStatus(null);
    if (next && (next.days.length === 0 || next.open === next.close)) {
      setStatus(t("Pick at least one day and different opening and closing times."));
      return;
    }
    const res = await fetch(`/api/instagram/accounts?id=${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessHours: next }),
    });
    const data = await res.json().catch(() => null);
    setStatus(data?.success ? t("Changes saved") : t("Could not save the hours."));
  }

  const input =
    "rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-accent/40 focus:outline-none";

  return (
    <div className="mt-3 space-y-2 rounded border border-border p-3">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) void save(null);
          }}
        />
        {t("Business hours")}
      </label>
      <p className="text-xs text-muted">
        {t("DM rules can answer only during these hours, or only outside them as an away message.")}
      </p>
      {enabled && (
        <>
          <div className="flex flex-wrap gap-1">
            {dayNames.map((name, day) => {
              const on = hours.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setHours((h) => ({ ...h, days: on ? h.days.filter((d) => d !== day) : [...h.days, day].sort() }))
                  }
                  className={`rounded border px-2 py-1 text-xs ${
                    on ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted"
                  }`}
                  aria-pressed={on}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <input
              type="time"
              value={hours.open}
              onChange={(e) => setHours((h) => ({ ...h, open: e.target.value }))}
              className={input}
              aria-label={t("Opens")}
            />
            –
            <input
              type="time"
              value={hours.close}
              onChange={(e) => setHours((h) => ({ ...h, close: e.target.value }))}
              className={input}
              aria-label={t("Closes")}
            />
            <select
              value={hours.timezone}
              onChange={(e) => setHours((h) => ({ ...h, timezone: e.target.value }))}
              className={input}
              aria-label={t("Time zone")}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void save(hours)}
              className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover"
            >
              {t("Save hours")}
            </button>
          </div>
        </>
      )}
      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}
