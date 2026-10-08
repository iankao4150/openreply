import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // No pause between sends in tests (read when the module loads).
  process.env.BROADCAST_PAUSE_MS = "0";
  const recipients: { id: string; userId: string; status: string; error?: string | null }[] = [];
  return {
    recipients,
    broadcastStatus: { value: "QUEUED" },
    send: vi.fn(),
    add: vi.fn(),
    optedOut: new Set<string>(),
    lastInbound: new Map<string, Date | null>(),
  };
});

vi.mock("@/lib/db/client", () => ({
  prisma: {
    broadcast: {
      findUnique: vi.fn(async (args: { include?: unknown }) =>
        args.include
          ? {
              id: "b1",
              workspaceId: "ws",
              status: h.broadcastStatus.value,
              instagramAccount: { id: "acct", instagramId: "biz", provider: "META", accessToken: "enc" },
              messageModule: { id: "mod1", name: "帽T", introText: null, cards: [], quickReplies: [], quickReplyPrompt: null, links: [] },
            }
          : { status: h.broadcastStatus.value }
      ),
      update: vi.fn(async ({ data }: { data: { status?: string } }) => {
        if (data.status) h.broadcastStatus.value = data.status;
      }),
    },
    broadcastRecipient: {
      findMany: vi.fn(async () => h.recipients.filter((r) => r.status === "PENDING").slice(0, 25)),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; status: string }; data: { status: string; error?: string } }) => {
        let count = 0;
        for (const r of h.recipients) {
          if ((where.id ? r.id === where.id : true) && r.status === where.status) {
            Object.assign(r, data);
            count++;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) =>
        Object.assign(h.recipients.find((r) => r.id === where.id)!, data)
      ),
      groupBy: vi.fn(async () => {
        const counts = new Map<string, number>();
        for (const r of h.recipients) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
        return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
      }),
    },
    contact: {
      findUnique: vi.fn(async ({ where }: { where: { instagramAccountId_userId: { userId: string } } }) => ({
        lastInboundAt: h.lastInbound.get(where.instagramAccountId_userId.userId) ?? null,
        username: null,
      })),
    },
  },
}));
vi.mock("@/lib/queue/client", () => ({
  BROADCAST_JOB_NAME: "process-broadcast",
  getDMQueue: () => ({ add: h.add }),
  getRedisConnection: vi.fn(),
}));
vi.mock("@/lib/ops/opt-out", () => ({ isOptedOut: vi.fn(async (_ig: string, user: string) => h.optedOut.has(user)) }));
vi.mock("@/lib/ops/human-pause", () => ({ isHumanHandling: vi.fn(async () => false) }));
vi.mock("@/lib/modules/send", () => ({ sendModuleAsDirectMessage: h.send }));
vi.mock("@/lib/instagram/provider", () => ({
  createInstagramContext: vi.fn(async () => ({ provider: "META", accessToken: "t" })),
  hasInstagramCredentials: () => true,
}));
vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: vi.fn(async () => ({ allowed: true, periodStart: new Date() })),
  releaseWorkspaceDMReservation: vi.fn(),
}));

import { processBroadcast } from "@/lib/broadcasts/send";

const job = { data: { broadcastId: "b1", instagramAccountId: "biz" } } as Parameters<typeof processBroadcast>[0];

describe("sending a broadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.recipients.length = 0;
    h.broadcastStatus.value = "QUEUED";
    h.optedOut.clear();
    h.lastInbound.clear();
  });

  const person = (userId: string, hoursAgo: number) => {
    h.recipients.push({ id: `r-${userId}`, userId, status: "PENDING" });
    h.lastInbound.set(userId, new Date(Date.now() - hoursAgo * 3_600_000));
  };

  it("sends inside the window and skips closed windows and opt-outs", async () => {
    person("open", 2);
    person("closed", 23.95);
    person("stopped", 1);
    h.optedOut.add("stopped");

    await processBroadcast(job);

    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ userId: "open", automationId: "" }));
    expect(Object.fromEntries(h.recipients.map((r) => [r.userId, r.status]))).toEqual({
      open: "SENT",
      closed: "SKIPPED",
      stopped: "SKIPPED",
    });
    expect(h.broadcastStatus.value).toBe("DONE");
  });

  it("never sends to someone another run already claimed", async () => {
    person("a", 1);
    h.recipients[0].status = "SENDING";
    await processBroadcast(job);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("does not retry a person whose send failed", async () => {
    person("a", 1);
    h.send.mockRejectedValueOnce(new Error("socket hang up"));
    await processBroadcast(job);
    expect(h.recipients[0].status).toBe("FAILED");
    await processBroadcast(job);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("queues the next batch when more people are waiting", async () => {
    for (let i = 0; i < 30; i++) person(`p${i}`, 1);
    await processBroadcast(job);
    expect(h.send).toHaveBeenCalledTimes(25);
    expect(h.add).toHaveBeenCalledWith("process-broadcast", expect.objectContaining({ broadcastId: "b1" }), expect.anything());
  });

  it("stops and skips the rest once cancelled", async () => {
    person("a", 1);
    person("b", 1);
    h.broadcastStatus.value = "CANCELLED";
    await processBroadcast(job);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.recipients.every((r) => r.status === "SKIPPED")).toBe(true);
  });
});
