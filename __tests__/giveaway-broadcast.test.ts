import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  contact: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { countMentions, eligibleEntries, pickWinners, type GiveawayComment } from "@/lib/giveaway/draw";
import { recordContacts, tagContact } from "@/lib/contacts/record";
import { windowStillOpen } from "@/lib/broadcasts/send";

const account = { instagramId: "biz", username: "ofsyd.co" };
const comment = (id: string, username: string, text: string, userId = `u-${username}`): GiveawayComment => ({
  id,
  text,
  from: { id: userId, username },
});

describe("giveaway entries", () => {
  const rules = { winners: 1, keyword: null, minMentions: 0, uniquePerUser: true, excludeUsernames: [] };

  it("counts distinct tagged friends, not the account itself", () => {
    expect(countMentions("@amy @bob @amy @ofsyd.co", "ofsyd.co")).toBe(2);
    expect(countMentions("no tags", "ofsyd.co")).toBe(0);
  });

  it("leaves out the account, excluded people and repeat entries", () => {
    const entries = eligibleEntries(
      [
        comment("1", "amy", "me!"),
        comment("2", "amy", "again"),
        comment("3", "ofsyd.co", "owner reply", "biz"),
        comment("4", "Staff_1", "test"),
        comment("5", "bob", "hi"),
      ],
      { ...rules, excludeUsernames: ["@staff_1"] },
      account
    );
    expect(entries.map((e) => e.commentId)).toEqual(["1", "5"]);
  });

  it("applies the keyword and the tag-friends rule", () => {
    const entries = eligibleEntries(
      [comment("1", "amy", "我要 梅西 @c1 @c2"), comment("2", "bob", "梅西 @c1"), comment("3", "cat", "@c1 @c2")],
      { ...rules, keyword: "梅西", minMentions: 2 },
      account
    );
    expect(entries.map((e) => e.username)).toEqual(["amy"]);
  });

  it("never picks the same person twice, even with several comments", () => {
    const entries = eligibleEntries(
      [comment("1", "amy", "a"), comment("2", "amy", "b"), comment("3", "bob", "c")],
      { ...rules, uniquePerUser: false },
      account
    );
    // A random source that always takes the first remaining entry.
    const winners = pickWinners(entries, 3, () => 0);
    expect(winners.map((w) => w.username)).toEqual(["amy", "bob"]);
  });
});

describe("broadcast window", () => {
  it("keeps a safety margin before the 24 hours run out", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(windowStillOpen(new Date(now - 60 * 60_000), now)).toBe(true);
    expect(windowStillOpen(new Date(now - (24 * 60 - 5) * 60_000), now)).toBe(false);
    expect(windowStillOpen(null, now)).toBe(false);
  });
});

describe("recording contacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the messaging window only for messages, not comments", async () => {
    const now = new Date("2026-10-09T12:00:00Z");
    await recordContacts(
      [
        { workspaceId: "ws", instagramAccountId: "acct", userId: "u1", username: "amy", kind: "comment" },
        { workspaceId: "ws", instagramAccountId: "acct", userId: "u2", kind: "inbound" },
      ],
      now
    );
    const [first, second] = db.contact.upsert.mock.calls.map((c) => c[0]);
    expect(first.create).toMatchObject({ userId: "u1", username: "amy", lastCommentAt: now });
    expect(first.create.lastInboundAt).toBeUndefined();
    expect(second.update).toMatchObject({ lastInboundAt: now });
  });

  it("falls back to an update when two webhooks race to create the same person", async () => {
    db.contact.upsert.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await recordContacts([{ workspaceId: "ws", instagramAccountId: "acct", userId: "u1", kind: "inbound" }]);
    expect(db.contact.update).toHaveBeenCalledTimes(1);
  });

  it("merges campaign tags into the existing ones", async () => {
    db.contact.findUnique.mockResolvedValueOnce({ tags: ["VIP"] });
    await tagContact({ workspaceId: "ws", instagramAccountId: "acct", addTags: ["vip", "梅西"] }, "u1");
    expect(db.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: ["VIP", "梅西"] } })
    );
  });

  it("does nothing for campaigns without tags", async () => {
    await tagContact({ workspaceId: "ws", instagramAccountId: "acct", addTags: [] }, "u1");
    expect(db.contact.findUnique).not.toHaveBeenCalled();
  });
});
