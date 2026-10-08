import { z } from "zod";

/**
 * Opening hours for one account. DM rules can answer only inside them
 * (`hoursMode: OPEN`) or only outside them (`CLOSED`, an away message).
 */
export const businessHoursSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    // 0 = Sunday … 6 = Saturday, like Date#getDay.
    days: z.array(z.number().int().min(0).max(6)).max(7),
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((h) => h.open !== h.close, { message: "Opening and closing time must differ" })
  .refine((h) => isValidTimeZone(h.timezone), { message: "Unknown time zone" });

export type BusinessHours = z.infer<typeof businessHoursSchema>;
export type HoursMode = "ALWAYS" | "OPEN" | "CLOSED";
export const HOURS_MODES: HoursMode[] = ["ALWAYS", "OPEN", "CLOSED"];

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Stored hours, or null when none are set (or the stored value is corrupt). */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  const parsed = businessHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Weekday and minute of the day at `at` in the given time zone. */
function localClock(at: Date, timeZone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: WEEKDAYS.indexOf(get("weekday")),
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/**
 * Whether the account is open at `at`. Hours that pass midnight (open 20:00,
 * close 02:00) belong to the day they start on.
 */
export function isOpenAt(hours: BusinessHours, at: Date): boolean {
  const { day, minute } = localClock(at, hours.timezone);
  const open = minutesOf(hours.open);
  const close = minutesOf(hours.close);
  if (open < close) return hours.days.includes(day) && minute >= open && minute < close;
  const yesterday = (day + 6) % 7;
  return (hours.days.includes(day) && minute >= open) || (hours.days.includes(yesterday) && minute < close);
}

/**
 * Whether a rule with this hours mode may answer now. Without hours set the
 * account counts as always open, so CLOSED rules stay quiet.
 */
export function hoursAllow(mode: string, stored: unknown, at: Date): boolean {
  if (mode !== "OPEN" && mode !== "CLOSED") return true;
  const hours = parseBusinessHours(stored);
  const open = hours ? isOpenAt(hours, at) : true;
  return mode === "OPEN" ? open : !open;
}
