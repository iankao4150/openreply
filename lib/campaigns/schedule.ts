/**
 * Prisma filter for campaigns live at `now`: no start or started, and no end
 * or not yet ended. Used for new comments and DMs; taps on replies already
 * sent keep working after a campaign ends.
 */
export function liveAt(now: Date) {
  return [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ];
}

export type ScheduleState = "always" | "scheduled" | "live" | "ended";

export function scheduleState(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  now = Date.now()
): ScheduleState {
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;
  if (start === null && end === null) return "always";
  if (end !== null && now >= end) return "ended";
  if (start !== null && now < start) return "scheduled";
  return "live";
}
