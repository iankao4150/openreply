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

import { liveAt, scheduleState } from "@/lib/campaigns/schedule";
import {
  parseEchoEvents,
  parseMessageEvents,
  parseQuickReplyEvents,
  parseStoryMentionEvents,
} from "@/lib/meta/webhook";
import { isHumanHandling, markAutomatedSend, recordEcho } from "@/lib/ops/human-pause";
import {
  cardSlots,
  moduleButtonSchema,
  moduleInputSchema,
  parseDmActionPayload,
  referencedModuleIds,
  type ModuleCard,
} from "@/lib/modules/schema";

const webhook = (messaging: object[]) => ({
  object: "instagram",
  entry: [{ id: "biz", time: 1, messaging }],
});

describe("webhook parsing for DM actions", () => {
  it("routes our quick-reply taps as actions and keeps them out of keyword matching", () => {
    const payload = webhook([
      { sender: { id: "u1" }, recipient: { id: "biz" }, message: { mid: "m1", text: "看帽T", quick_reply: { payload: "mod:modulehoodie123:automation1234" } } },
      { sender: { id: "u2" }, recipient: { id: "biz" }, message: { mid: "m2", text: "梅西" } },
    ]);
    expect(parseQuickReplyEvents(payload)).toEqual([
      { instagramAccountId: "biz", userId: "u1", payload: "mod:modulehoodie123:automation1234", mid: "m1" },
    ]);
    expect(parseMessageEvents(payload).map((e) => e.messageId)).toEqual(["m2"]);
  });

  it("leaves quick replies from other tools to keyword matching", () => {
    const payload = webhook([
      { sender: { id: "u1" }, recipient: { id: "biz" }, message: { mid: "m1", text: "yes", quick_reply: { payload: "OTHER_TOOL" } } },
    ]);
    expect(parseQuickReplyEvents(payload)).toEqual([]);
    expect(parseMessageEvents(payload)).toHaveLength(1);
  });

  it("detects story mentions", () => {
    const payload = webhook([
      { sender: { id: "u1" }, recipient: { id: "biz" }, message: { mid: "m1", attachments: [{ type: "story_mention", payload: { url: "https://cdn" } }] } },
      { sender: { id: "u2" }, recipient: { id: "biz" }, message: { mid: "m2", attachments: [{ type: "image" }] } },
    ]);
    expect(parseStoryMentionEvents(payload)).toEqual([{ instagramAccountId: "biz", userId: "u1", mid: "m1" }]);
  });

  it("reads echoes as messages the account sent to a person", () => {
    const payload = webhook([
      { sender: { id: "biz" }, recipient: { id: "u1" }, message: { mid: "m1", text: "hi", is_echo: true } },
      { sender: { id: "u2" }, recipient: { id: "biz" }, message: { mid: "m2", text: "hello" } },
    ]);
    expect(parseEchoEvents(payload)).toEqual([{ instagramAccountId: "biz", userId: "u1", mid: "m1" }]);
    expect(parseMessageEvents(payload).map((e) => e.messageId)).toEqual(["m2"]);
  });
});

describe("pausing for a person replying by hand", () => {
  beforeEach(() => redis.store.clear());

  it("treats an echo right after our own send as automated", async () => {
    await markAutomatedSend("biz", "u1");
    expect(await recordEcho("biz", "u1", 30)).toBe("automated");
    expect(await isHumanHandling("biz", "u1")).toBe(false);
  });

  it("pauses when an echo arrives without our mark", async () => {
    expect(await recordEcho("biz", "u1", 30)).toBe("human");
    expect(await isHumanHandling("biz", "u1")).toBe(true);
    expect(redis.set).toHaveBeenLastCalledWith("openreply:human:biz:u1", "1", "EX", 1800);
    expect(await isHumanHandling("biz", "u2")).toBe(false);
  });

  it("does nothing when the pause is turned off", async () => {
    expect(await recordEcho("biz", "u1", 0)).toBe("ignored");
    expect(await isHumanHandling("biz", "u1")).toBe(false);
  });
});

describe("module buttons and action payloads", () => {
  const card = (buttons: ModuleCard["buttons"]): ModuleCard => ({
    imageUrl: null,
    title: "t",
    subtitle: "s",
    imageLinkUrl: "https://a.b/img",
    buttons,
  });

  it("requires exactly one of a link or a module", () => {
    expect(moduleButtonSchema.safeParse({ label: "x", url: "https://a.b" }).success).toBe(true);
    expect(moduleButtonSchema.safeParse({ label: "x", moduleId: "modulehoodie123" }).success).toBe(true);
    expect(moduleButtonSchema.safeParse({ label: "x" }).success).toBe(false);
    expect(moduleButtonSchema.safeParse({ label: "x", url: "https://a.b", moduleId: "modulehoodie123" }).success).toBe(false);
  });

  it("keeps link-button slots stable when a module button sits between them", () => {
    const slots = cardSlots(
      card([
        { label: "a", url: "https://a.b/1", moduleId: null },
        { label: "b", url: null, moduleId: "modulehoodie123" },
        { label: "c", url: "https://a.b/3", moduleId: null },
      ])
    );
    expect(slots.map((s) => s.slot)).toEqual(["img", "btn1", "btn3"]);
  });

  it("collects every referenced module once", () => {
    expect(
      referencedModuleIds({
        cards: [card([{ label: "b", url: null, moduleId: "moduleaaaa1111" }])],
        quickReplies: [
          { title: "x", moduleId: "moduleaaaa1111" },
          { title: "y", moduleId: "modulebbbb2222" },
        ],
      })
    ).toEqual(["moduleaaaa1111", "modulebbbb2222"]);
  });

  it("parses only well-formed payloads", () => {
    expect(parseDmActionPayload("mod:modulehoodie123:automation1234")).toEqual({
      type: "module",
      moduleId: "modulehoodie123",
      automationId: "automation1234",
    });
    expect(parseDmActionPayload("mod:modulehoodie123:-")).toEqual({
      type: "module",
      moduleId: "modulehoodie123",
      automationId: null,
    });
    expect(parseDmActionPayload("rule:automation1234")).toEqual({ type: "rule", automationId: "automation1234" });
    expect(parseDmActionPayload("rule:../../etc")).toBeNull();
    expect(parseDmActionPayload("reveal:automation1234")).toBeNull();
    expect(parseDmActionPayload("mod:x")).toBeNull();
  });

  it("limits quick replies to 13 with 20-character titles", () => {
    const base = { name: "m", cards: [card([])] };
    const many = Array.from({ length: 14 }, () => ({ title: "x", moduleId: "modulehoodie123" }));
    expect(moduleInputSchema.safeParse({ ...base, quickReplies: many }).success).toBe(false);
    expect(
      moduleInputSchema.safeParse({ ...base, quickReplies: [{ title: "x".repeat(21), moduleId: "modulehoodie123" }] }).success
    ).toBe(false);
  });
});

describe("schedules", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it("classifies start and end", () => {
    expect(scheduleState(null, null, now)).toBe("always");
    expect(scheduleState("2026-10-10T00:00:00Z", null, now)).toBe("scheduled");
    expect(scheduleState("2026-10-08T00:00:00Z", "2026-10-10T00:00:00Z", now)).toBe("live");
    expect(scheduleState(null, "2026-10-09T12:00:00Z", now)).toBe("ended");
  });

  it("builds a live-now filter on both ends", () => {
    const at = new Date(now);
    expect(liveAt(at)).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
    ]);
  });
});

import { optOutCommand } from "@/lib/ops/opt-out";
import { menuSchema, parseStoredMenu } from "@/lib/campaigns/persistent-menu";

describe("opting out of automated DMs", () => {
  it("recognises stop and start words exactly, ignoring case and punctuation", () => {
    expect(optOutCommand("STOP")).toBe("stop");
    expect(optOutCommand(" stop! ")).toBe("stop");
    expect(optOutCommand("停止")).toBe("stop");
    expect(optOutCommand("取消訂閱。")).toBe("stop");
    expect(optOutCommand("Start")).toBe("start");
    expect(optOutCommand("開始")).toBe("start");
  });

  it("does not treat ordinary messages that contain the word as a command", () => {
    expect(optOutCommand("can you stop by the store")).toBeNull();
    expect(optOutCommand("我想停止訂單")).toBeNull();
    expect(optOutCommand("梅西")).toBeNull();
  });
});

describe("persistent menu", () => {
  it("accepts up to five items that each open a link or send a module", () => {
    expect(
      menuSchema.safeParse([
        { title: "官網", url: "https://ofsyd.com" },
        { title: "梅西系列", moduleId: "modulehoodie123" },
      ]).success
    ).toBe(true);
    expect(menuSchema.safeParse(Array.from({ length: 6 }, () => ({ title: "x", url: "https://a.b" }))).success).toBe(false);
    expect(menuSchema.safeParse([{ title: "x" }]).success).toBe(false);
    expect(menuSchema.safeParse([{ title: "x", url: "http://insecure.example" }]).success).toBe(false);
    expect(menuSchema.safeParse([{ title: "x".repeat(31), url: "https://a.b" }]).success).toBe(false);
  });

  it("treats a corrupt stored menu as empty", () => {
    expect(parseStoredMenu("junk")).toEqual([]);
  });
});
