import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    eval: vi.fn(async (_script: string, _n: number, key: string, owner: string) => {
      if (store.get(key) !== owner) return 0;
      store.delete(key);
      return 1;
    }),
  };
});
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => redis }));

import { claimCooldown, releaseCooldown } from "@/lib/ops/cooldown";
import { clearAutomatedMark, markAutomatedSend, recordEcho } from "@/lib/ops/human-pause";
import { findConflicts, type ConflictCandidate } from "@/lib/campaigns/conflicts";
import { getAllMediaComments } from "@/lib/meta/client";

beforeEach(() => redis.store.clear());

describe("cooldown claims", () => {
  it("lets one of several simultaneous triggers through, and the same one again on retry", async () => {
    const results = await Promise.all([
      claimCooldown("rule1", "u1", 1440, "dm:a"),
      claimCooldown("rule1", "u1", 1440, "dm:b"),
      claimCooldown("rule1", "u1", 1440, "dm:c"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimCooldown("rule1", "u1", 1440, "dm:a")).toBe(true);
    expect(await claimCooldown("rule1", "u2", 1440, "dm:b")).toBe(true);
  });

  it("frees the claim only for its owner", async () => {
    await claimCooldown("rule1", "u1", null, "dm:a");
    await releaseCooldown("rule1", "u1", "dm:b");
    expect(await claimCooldown("rule1", "u1", null, "dm:b")).toBe(false);
    await releaseCooldown("rule1", "u1", "dm:a");
    expect(await claimCooldown("rule1", "u1", null, "dm:b")).toBe(true);
  });
});

describe("in-flight marks", () => {
  it("are cleared once the send is known, so a manual reply right after pauses the bot", async () => {
    const token = await markAutomatedSend("biz", "u1");
    expect(token).toBeTruthy();
    await clearAutomatedMark("biz", "u1", token as string);
    expect(await recordEcho("biz", "u1", 30, "mid-typed-by-staff")).toBe("human");
  });

  it("are not cleared by an older send's token", async () => {
    const first = await markAutomatedSend("biz", "u1");
    await markAutomatedSend("biz", "u1");
    await clearAutomatedMark("biz", "u1", first as string);
    expect(await recordEcho("biz", "u1", 30, "mid-in-flight")).toBe("automated");
  });
});

describe("conflict checks", () => {
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
  const now = Date.parse("2026-10-09T12:00:00Z");

  it("ignores rules whose schedule has ended", () => {
    const ended = { ...base, id: "b", name: "B", endsAt: "2026-10-01T00:00:00Z" };
    expect(findConflicts(base, [ended], now)).toEqual([]);
  });

  it("warns that a default reply never answers next to an any-word DM campaign", () => {
    const fallback = { ...base, dmRuleType: "DEFAULT", keywords: [] };
    const anyWord = { ...base, id: "c", name: "C", dmOnly: false, matchAnyWord: true, keywords: [] };
    expect(findConflicts(fallback, [anyWord], now)).toEqual([{ otherId: "c", otherName: "C", kind: "default" }]);
  });
});

describe("reading every comment for a giveaway", () => {
  afterEach(() => vi.unstubAllGlobals());

  const page = (ids: string[], next?: string) =>
    new Response(JSON.stringify({ data: ids.map((id) => ({ id, text: "x", from: { id, username: id } })), paging: next ? { next } : {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("follows every page", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(page(["1", "2"], "https://graph/next")).mockResolvedValueOnce(page(["3"]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getAllMediaComments("token", "123456", { max: 100, deadline: Date.now() + 10_000 });
    expect(result.complete).toBe(true);
    expect(result.comments.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("reports an incomplete read instead of pretending it saw everything", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page(["1", "2"], "https://graph/next")));
    const capped = await getAllMediaComments("token", "123456", { max: 3, deadline: Date.now() + 10_000 });
    expect(capped.complete).toBe(false);
    const late = await getAllMediaComments("token", "123456", { max: 100, deadline: Date.now() - 1 });
    expect(late.complete).toBe(false);
  });
});
