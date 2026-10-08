import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prisma: {
    instagramAccount: { findFirst: vi.fn() },
    automation: { findFirst: vi.fn(), findMany: vi.fn() },
    messageModule: { findFirst: vi.fn() },
    dmLog: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
  },
  sendModuleAsDirectMessage: vi.fn(),
  isHumanHandling: vi.fn(),
  markAutomatedSend: vi.fn(),
}));

vi.mock("@/lib/ops/opt-out", () => ({
  isOptedOut: vi.fn().mockResolvedValue(false),
  setOptOut: vi.fn(),
  optOutCommand: vi.fn().mockReturnValue(null),
  OPT_OUT_CONFIRMATION: "stopped",
  OPT_IN_CONFIRMATION: "started",
}));
vi.mock("@/lib/ops/pending-reply", () => ({
  setPendingModule: vi.fn(),
  takePendingModule: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db/client", () => ({ prisma: h.prisma }));
vi.mock("@/lib/modules/send", () => ({
  sendModuleAsDirectMessage: h.sendModuleAsDirectMessage,
  sendModuleAsPrivateReply: vi.fn(),
}));
vi.mock("@/lib/ops/human-pause", () => ({
  isHumanHandling: h.isHumanHandling,
  markAutomatedSend: h.markAutomatedSend,
  recordEcho: vi.fn(),
}));
vi.mock("@/lib/instagram/provider", async () => {
  const client = await vi.importActual<typeof import("@/lib/meta/client")>("@/lib/meta/client");
  return {
    MetaApiError: client.MetaApiError,
    RateLimitError: client.RateLimitError,
    TokenExpiredError: client.TokenExpiredError,
    PermissionError: client.PermissionError,
    createInstagramContext: vi.fn(async () => ({ provider: "META", accessToken: "t" })),
    hasInstagramCredentials: () => true,
    getUserFollowStatus: vi.fn(),
    sendCommentReply: vi.fn(),
    sendDirectMessage: vi.fn(),
    sendDirectMessageWithButton: vi.fn(),
    sendDirectMessageWithLinkButton: vi.fn(),
    sendPrivateReply: vi.fn(),
    sendPrivateReplyWithButton: vi.fn(),
    sendPrivateReplyWithLinkButton: vi.fn(),
  };
});
vi.mock("@/lib/utils/rate-limiter", () => ({ reserveDMSlot: vi.fn(), releaseDMSlot: vi.fn() }));
vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: vi.fn(async () => ({ allowed: true, periodStart: new Date() })),
  releaseWorkspaceDMReservation: vi.fn(),
}));
vi.mock("@/lib/ops/worker-health", () => ({ recordWorkerAlert: vi.fn() }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: vi.fn() }),
  getRedisConnection: vi.fn(),
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
  DM_ACTION_JOB_NAME: "process-dm-action",
}));
vi.mock("bullmq", () => ({
  Worker: function MockWorker(_name: string, processor: unknown) {
    (global as Record<string, unknown>).__dmActionProcessor = processor;
    return { on: vi.fn(), close: vi.fn() };
  },
  UnrecoverableError: class extends Error {},
}));

import { createDMWorker } from "../lib/queue/dm-worker";
import { isOptedOut, optOutCommand, setOptOut } from "@/lib/ops/opt-out";
import { setPendingModule, takePendingModule } from "@/lib/ops/pending-reply";
import { sendDirectMessage } from "@/lib/instagram/provider";

const account = { id: "acct", workspaceId: "ws1", instagramId: "biz", provider: "META", accessToken: "enc" };
const moduleRecord = { id: "modulehoodie123", name: "帽T", introText: null, cards: [], quickReplies: [], links: [] };
const rule = {
  id: "automation1234",
  workspaceId: "ws1",
  instagramAccountId: "acct",
  name: "Shipping",
  iceBreakerQuestion: "運費多少？",
  cooldownMinutes: 0,
  oncePerUser: false,
  dmMessage: "fallback",
  linkButtonLabel: null,
  trackedLinks: [],
  messageModule: moduleRecord,
  instagramAccount: account,
};

function run(data: Record<string, unknown>) {
  createDMWorker();
  const processor = (global as Record<string, unknown>).__dmActionProcessor as (job: unknown) => Promise<void>;
  return processor({ name: "process-dm-action", id: "job1", attemptsMade: 0, data });
}

describe("DM actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.instagramAccount.findFirst.mockResolvedValue(account);
    h.prisma.dmLog.findUnique.mockResolvedValue(null);
    h.prisma.dmLog.findFirst.mockResolvedValue(null);
    h.isHumanHandling.mockResolvedValue(false);
  });

  it("answers a module button with that module, scoped to the account's workspace", async () => {
    h.prisma.messageModule.findFirst.mockResolvedValue(moduleRecord);
    h.prisma.automation.findFirst.mockResolvedValue(rule);
    await run({ instagramAccountId: "biz", userId: "u1", kind: "tap", payload: "mod:modulehoodie123:automation1234", mid: "m1" });

    expect(h.prisma.messageModule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "modulehoodie123", workspaceId: "ws1" } })
    );
    expect(h.sendModuleAsDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({ module: moduleRecord, automationId: "automation1234", userId: "u1" })
    );
    expect(h.prisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "SENT", commentId: "tap:m1" }) })
    );
  });

  it("ignores a module that is not in the account's workspace", async () => {
    h.prisma.messageModule.findFirst.mockResolvedValue(null);
    await run({ instagramAccountId: "biz", userId: "u1", kind: "tap", payload: "mod:modulehoodie123:automation1234", mid: "m1" });
    expect(h.sendModuleAsDirectMessage).not.toHaveBeenCalled();
  });

  it("ignores malformed payloads", async () => {
    await run({ instagramAccountId: "biz", userId: "u1", kind: "tap", payload: "rule:not valid!", mid: "m1" });
    expect(h.prisma.automation.findFirst).not.toHaveBeenCalled();
  });

  it("answers an ice-breaker tap with its rule's reply, even while staff handle the chat", async () => {
    h.isHumanHandling.mockResolvedValue(true);
    h.prisma.automation.findFirst.mockResolvedValue(rule);
    await run({ instagramAccountId: "biz", userId: "u1", kind: "tap", payload: "rule:automation1234", mid: "m2" });
    expect(h.sendModuleAsDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("does not answer the same tap twice", async () => {
    h.prisma.automation.findFirst.mockResolvedValue(rule);
    h.prisma.dmLog.findUnique.mockResolvedValue({ status: "SENT" });
    await run({ instagramAccountId: "biz", userId: "u1", kind: "tap", payload: "rule:automation1234", mid: "m2" });
    expect(h.sendModuleAsDirectMessage).not.toHaveBeenCalled();
  });

  it("stays quiet on a story mention while a person handles the chat", async () => {
    h.isHumanHandling.mockResolvedValue(true);
    await run({ instagramAccountId: "biz", userId: "u1", kind: "story", mid: "m3" });
    expect(h.prisma.automation.findFirst).not.toHaveBeenCalled();
    expect(h.sendModuleAsDirectMessage).not.toHaveBeenCalled();
  });

  it("answers each person's story mentions at most once a day by default", async () => {
    h.prisma.automation.findFirst.mockResolvedValue({ ...rule, iceBreakerQuestion: null });
    h.prisma.dmLog.findFirst.mockResolvedValueOnce({ id: "recent" });
    await run({ instagramAccountId: "biz", userId: "u1", kind: "story", mid: "m4" });
    expect(h.sendModuleAsDirectMessage).not.toHaveBeenCalled();
    expect(h.prisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "SKIPPED_DEDUP", commentId: "story:m4" }),
      })
    );
    const window = h.prisma.dmLog.findFirst.mock.calls[0][0].where.createdAt.gt as Date;
    expect(Date.now() - window.getTime()).toBeGreaterThan(23 * 3_600_000);
  });

  it("answers a first story mention", async () => {
    h.prisma.automation.findFirst.mockResolvedValue({ ...rule, iceBreakerQuestion: null });
    await run({ instagramAccountId: "biz", userId: "u1", kind: "story", mid: "m5" });
    expect(h.sendModuleAsDirectMessage).toHaveBeenCalledTimes(1);
    expect(h.prisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ commentText: "[Story mention]", status: "SENT" }) })
    );
  });
});

function runMessage(text: string) {
  createDMWorker();
  const processor = (global as Record<string, unknown>).__dmActionProcessor as (job: unknown) => Promise<void>;
  return processor({
    name: "process-message",
    id: "job2",
    attemptsMade: 0,
    data: { instagramAccountId: "biz", messageId: "mid9", messageText: text, senderId: "u1" },
  });
}

describe("inbound DMs: opt-out and text-first follow-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.prisma.instagramAccount.findFirst.mockResolvedValue(account);
    h.prisma.automation.findMany.mockResolvedValue([]);
    h.prisma.dmLog.findFirst.mockResolvedValue(null);
    vi.mocked(optOutCommand).mockReturnValue(null);
    vi.mocked(isOptedOut).mockResolvedValue(false);
    vi.mocked(takePendingModule).mockResolvedValue(null);
  });

  it("opts a person out on STOP, confirms, and answers nothing else", async () => {
    vi.mocked(optOutCommand).mockReturnValue("stop");
    await runMessage("STOP");
    expect(setOptOut).toHaveBeenCalledWith("acct", "u1", true);
    expect(sendDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", message: "stopped" }));
    expect(h.prisma.automation.findMany).not.toHaveBeenCalled();
  });

  it("stays silent to someone who opted out", async () => {
    vi.mocked(isOptedOut).mockResolvedValue(true);
    await runMessage("梅西");
    expect(h.prisma.automation.findMany).not.toHaveBeenCalled();
    expect(sendDirectMessage).not.toHaveBeenCalled();
  });

  it("delivers the promised cards on the reply after a text-first comment answer", async () => {
    vi.mocked(takePendingModule).mockResolvedValue("automation1234");
    h.prisma.automation.findFirst.mockResolvedValue(rule);
    await runMessage("好");
    expect(h.sendModuleAsDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ module: moduleRecord, userId: "u1" }));
    expect(h.prisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "SENT", commentId: "dm:mid9" }) })
    );
    // The promise is used up; keyword rules do not also answer this message.
    expect(h.prisma.automation.findMany).not.toHaveBeenCalled();
  });

  it("keeps the promise when delivering fails, for the job's retry", async () => {
    vi.mocked(takePendingModule).mockResolvedValue("automation1234");
    h.prisma.automation.findFirst.mockResolvedValue(rule);
    h.sendModuleAsDirectMessage.mockRejectedValueOnce(new Error("network"));
    await expect(runMessage("好")).rejects.toThrow("network");
    expect(setPendingModule).toHaveBeenCalledWith("biz", "u1", "automation1234");
  });
});
