import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
  };
});
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => redis }));

import { hoursAllow, isOpenAt, parseBusinessHours } from "@/lib/ops/business-hours";
import { isHumanHandling, markAutomatedSend, recordEcho, rememberSentMid } from "@/lib/ops/human-pause";
import { fitUtf8 } from "@/lib/utils/utf8";
import { normalizeTags } from "@/lib/contacts/record";
import { findConflicts, type ConflictCandidate } from "@/lib/campaigns/conflicts";
import { ensureCardIds, moduleInputSchema } from "@/lib/modules/schema";

describe("business hours", () => {
  const weekdays = { timezone: "Asia/Taipei", days: [1, 2, 3, 4, 5], open: "10:00", close: "19:00" };
  // 2026-10-09 is a Friday. 02:00Z = 10:00 in Taipei.
  it("opens and closes in the account's time zone", () => {
    expect(isOpenAt(weekdays, new Date("2026-10-09T02:00:00Z"))).toBe(true);
    expect(isOpenAt(weekdays, new Date("2026-10-09T01:59:00Z"))).toBe(false);
    expect(isOpenAt(weekdays, new Date("2026-10-09T11:00:00Z"))).toBe(false); // 19:00
    expect(isOpenAt(weekdays, new Date("2026-10-10T04:00:00Z"))).toBe(false); // Saturday noon
  });

  it("keeps hours past midnight with the day they start on", () => {
    const late = { timezone: "Asia/Taipei", days: [5], open: "20:00", close: "02:00" };
    expect(isOpenAt(late, new Date("2026-10-09T13:00:00Z"))).toBe(true); // Fri 21:00
    expect(isOpenAt(late, new Date("2026-10-09T17:30:00Z"))).toBe(true); // Sat 01:30
    expect(isOpenAt(late, new Date("2026-10-10T13:00:00Z"))).toBe(false); // Sat 21:00
  });

  it("lets OPEN rules answer inside hours and CLOSED rules outside them", () => {
    const friday10 = new Date("2026-10-09T02:30:00Z");
    const saturday = new Date("2026-10-10T04:00:00Z");
    expect(hoursAllow("OPEN", weekdays, friday10)).toBe(true);
    expect(hoursAllow("CLOSED", weekdays, friday10)).toBe(false);
    expect(hoursAllow("CLOSED", weekdays, saturday)).toBe(true);
    expect(hoursAllow("ALWAYS", weekdays, saturday)).toBe(true);
  });

  it("counts an account without hours as always open", () => {
    expect(hoursAllow("CLOSED", {}, new Date())).toBe(false);
    expect(hoursAllow("OPEN", {}, new Date())).toBe(true);
    expect(parseBusinessHours({ timezone: "Mars/Olympus", days: [1], open: "09:00", close: "18:00" })).toBeNull();
    expect(parseBusinessHours({ timezone: "Asia/Taipei", days: [1], open: "25:00", close: "18:00" })).toBeNull();
  });
});

describe("telling our own echoes from a person's", () => {
  beforeEach(() => redis.store.clear());

  it("recognises a late or re-delivered echo of an automated send by its id", async () => {
    await rememberSentMid("mid-auto");
    // The short in-flight mark is long gone; the id still matches.
    expect(await recordEcho("biz", "u1", 30, "mid-auto")).toBe("automated");
    expect(await isHumanHandling("biz", "u1")).toBe(false);
  });

  it("pauses for a manual reply even right after an automated send finished", async () => {
    await rememberSentMid("mid-auto");
    expect(await recordEcho("biz", "u1", 30, "mid-by-staff")).toBe("human");
    expect(await isHumanHandling("biz", "u1")).toBe(true);
  });

  it("covers an echo that arrives before the send returned its id", async () => {
    await markAutomatedSend("biz", "u1");
    expect(await recordEcho("biz", "u1", 30, "mid-not-yet-known")).toBe("automated");
    expect(redis.set).toHaveBeenCalledWith("openreply:automated:biz:u1", expect.any(String), "EX", 30);
  });
});

describe("text length", () => {
  it("cuts by UTF-8 bytes on a character boundary", () => {
    const chinese = "梅".repeat(400); // 1200 bytes
    const cut = fitUtf8(chinese);
    expect(new TextEncoder().encode(cut).length).toBeLessThanOrEqual(1000);
    expect(cut.endsWith("…")).toBe(true);
    expect(fitUtf8("short")).toBe("short");
    const emoji = "😀".repeat(300); // 4 bytes each
    expect(fitUtf8(emoji)).not.toContain("�");
  });
});

describe("tags", () => {
  it("trims, de-duplicates ignoring case, and caps length", () => {
    expect(normalizeTags([" VIP ", "vip", "梅西", "", "x".repeat(40)])).toEqual(["VIP", "梅西", "x".repeat(30)]);
  });
});

describe("conflicts with schedules, hours and default replies", () => {
  const base: ConflictCandidate = {
    id: "a",
    name: "A",
    instagramAccountId: "acct",
    isActive: true,
    dmOnly: true,
    dmRuleType: "KEYWORD",
    postId: null,
    matchAnyPost: false,
    matchAnyWord: false,
    keywords: ["價格"],
    dmTriggerEnabled: true,
  };
  it("ignores rules that are never live at the same time", () => {
    const october = { ...base, startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-31T00:00:00Z" };
    const november = { ...base, id: "b", name: "B", startsAt: "2026-11-01T00:00:00Z", endsAt: null };
    expect(findConflicts(october, [november])).toEqual([]);
    expect(findConflicts({ ...base, hoursMode: "OPEN" }, [{ ...base, id: "b", hoursMode: "CLOSED" }])).toEqual([]);
    expect(findConflicts(base, [{ ...base, id: "b", name: "B" }])).toHaveLength(1);
  });

  it("flags two default replies but not a default reply against keyword rules", () => {
    const fallback = { ...base, dmRuleType: "DEFAULT", keywords: [] };
    expect(findConflicts(fallback, [{ ...fallback, id: "b", name: "B" }])).toEqual([
      { otherId: "b", otherName: "B", kind: "default" },
    ]);
    expect(findConflicts(fallback, [{ ...base, id: "c" }])).toEqual([]);
  });
});

describe("stable card ids", () => {
  const card = { imageUrl: null, title: "t", subtitle: "s", imageLinkUrl: null, buttons: [] };
  it("assigns ids, keeps existing ones and renews a duplicated one", () => {
    const [first, copy, fresh] = ensureCardIds([
      { ...card, id: "abc123" },
      { ...card, id: "abc123" },
      card,
    ]);
    expect(first.id).toBe("abc123");
    expect(copy.id).not.toBe("abc123");
    expect(fresh.id).toMatch(/^[a-f0-9]{12}$/);
  });

  it("gives every saved card an id", () => {
    const parsed = moduleInputSchema.parse({ name: "m", cards: [card, card] });
    expect(parsed.cards.every((c) => c.id)).toBe(true);
    expect(new Set(parsed.cards.map((c) => c.id)).size).toBe(2);
  });
});
