import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => ({
  sendPrivateReplyWithCards: vi.fn(),
  sendDirectMessageWithCards: vi.fn(),
  sendPrivateReplyWithLinkButton: vi.fn(),
  sendDirectMessageWithLinkButton: vi.fn(),
  sendPrivateReply: vi.fn(),
  sendDirectMessage: vi.fn(),
}));
vi.mock("@/lib/instagram/provider", async () => {
  const client = await vi.importActual<typeof import("@/lib/meta/client")>("@/lib/meta/client");
  class CardsUnsupportedError extends Error {}
  return {
    ...send,
    CardsUnsupportedError,
    MetaApiError: client.MetaApiError,
    PermissionError: client.PermissionError,
    RateLimitError: client.RateLimitError,
    TokenExpiredError: client.TokenExpiredError,
  };
});

import { PermissionError, RateLimitError } from "@/lib/meta/client";
import { desiredModuleLinks } from "@/lib/modules/links";
import {
  buildCardElements,
  buildCardsPlainText,
  buildFirstCardButtons,
  moduleLinkUrl,
} from "@/lib/modules/render";
import {
  moduleInputSchema,
  parseStoredCards,
  slotTerm,
  withUtm,
  type ModuleCard,
} from "@/lib/modules/schema";
import {
  isCardsRejection,
  sendModuleAsDirectMessage,
  sendModuleAsPrivateReply,
} from "@/lib/modules/send";
import { summarizeModuleClicks } from "@/lib/modules/stats";

const card = (overrides: Partial<ModuleCard> = {}): ModuleCard => ({
  imageUrl: "https://cdn.example.com/1.png",
  title: "Messi #256",
  subtitle: "1 張 NT$499",
  imageLinkUrl: "https://shop.example.com/p/256",
  buttons: [{ label: "選擇張數", url: "https://shop.example.com/p/256", moduleId: null }],
  ...overrides,
});

const ctx = { baseUrl: "https://reply.example.com", automationId: "auto1", recipientToken: "r".repeat(22) };

describe("module input validation", () => {
  it("accepts a carousel and fills the UTM defaults", () => {
    const parsed = moduleInputSchema.parse({ name: "Messi", cards: [card()] });
    expect(parsed.utmSource).toBe("paklab");
    expect(parsed.utmMedium).toBe("dm");
    expect(parsed.utmCampaign).toBeNull();
  });

  it("rejects plain http links, a title-only card and more than 10 cards", () => {
    expect(moduleInputSchema.safeParse({ name: "x", cards: [card({ imageUrl: "http://a.b/c.png" })] }).success).toBe(false);
    expect(
      moduleInputSchema.safeParse({
        name: "x",
        cards: [{ title: "only", imageUrl: null, subtitle: null, imageLinkUrl: null, buttons: [] }],
      }).success
    ).toBe(false);
    expect(moduleInputSchema.safeParse({ name: "x", cards: Array.from({ length: 11 }, () => card()) }).success).toBe(false);
  });

  it("caps buttons at three and labels at Meta's 20 characters", () => {
    const four = Array.from({ length: 4 }, () => ({ label: "Buy", url: "https://a.b", moduleId: null }));
    expect(moduleInputSchema.safeParse({ name: "x", cards: [card({ buttons: four })] }).success).toBe(false);
    expect(
      moduleInputSchema.safeParse({ name: "x", cards: [card({ buttons: [{ label: "x".repeat(21), url: "https://a.b", moduleId: null }] })] }).success
    ).toBe(false);
  });

  it("drops stored cards that no longer validate instead of sending them", () => {
    expect(parseStoredCards([card(), { title: "" }, "junk"])).toHaveLength(1);
    expect(parseStoredCards(null)).toEqual([]);
  });
});

describe("UTM tagging", () => {
  it("names slots like the DM tracking SOP", () => {
    expect(slotTerm(3, "img")).toBe("c3img");
    expect(slotTerm(3, "btn1")).toBe("c3btn");
    expect(slotTerm(3, "btn2")).toBe("c3btn2");
  });

  it("adds missing parameters and never overwrites hand-tagged ones", () => {
    const url = withUtm("https://shop.example.com/p?utm_source=manual&x=1", {
      source: "openreply",
      medium: "dm",
      campaign: "messi256",
      term: "c1img",
    });
    const params = new URL(url).searchParams;
    expect(params.get("utm_source")).toBe("manual");
    expect(params.get("utm_medium")).toBe("dm");
    expect(params.get("utm_campaign")).toBe("messi256");
    expect(params.get("utm_term")).toBe("c1img");
    expect(params.get("x")).toBe("1");
  });

  it("builds one tracked link per card image and button", () => {
    const links = desiredModuleLinks(
      [card(), card({ imageLinkUrl: null, buttons: [{ label: "A", url: "https://a.b/1", moduleId: null }, { label: "B", url: "https://a.b/2", moduleId: null }] })],
      { utmSource: "openreply", utmMedium: "dm", utmCampaign: "messi256" }
    );
    expect(links.map((l) => `${l.card}:${l.slot}`)).toEqual(["1:img", "1:btn1", "2:btn1", "2:btn2"]);
    expect(new URL(links[3].destinationUrl).searchParams.get("utm_term")).toBe("c2btn2");
  });
});

describe("rendering cards", () => {
  const links = [
    { slug: "s-img", card: 1, slot: "img" },
    { slug: "s-btn", card: 1, slot: "btn1" },
  ];

  it("maps cards to generic template elements with tracked redirects", () => {
    const [element] = buildCardElements([card()], links, ctx);
    expect(element.title).toBe("Messi #256");
    expect(element.image_url).toBe("https://cdn.example.com/1.png");
    expect(element.default_action?.url).toBe(moduleLinkUrl("s-img", ctx));
    expect(element.buttons?.[0]).toEqual({ type: "web_url", title: "選擇張數", url: moduleLinkUrl("s-btn", ctx) });
    const button = element.buttons![0];
    const tracked = new URL(button.type === "web_url" ? button.url : "");
    expect(tracked.pathname).toBe("/m/s-btn");
    expect(tracked.searchParams.get("a")).toBe("auto1");
  });

  it("falls back to the raw link when a slot has no tracked record yet", () => {
    const [element] = buildCardElements([card()], [], ctx);
    expect(element.buttons?.[0]).toMatchObject({ url: "https://shop.example.com/p/256" });
  });

  it("turns a module button into a postback that names the module and campaign", () => {
    const [element] = buildCardElements(
      [card({ buttons: [{ label: "看帽T", url: null, moduleId: "modulehoodie123" }] })],
      [],
      ctx
    );
    expect(element.buttons?.[0]).toEqual({ type: "postback", title: "看帽T", payload: "mod:modulehoodie123:auto1" });
  });

  it("personalizes {username} in titles", () => {
    const [element] = buildCardElements([card({ title: "Hi {username}" })], [], { ...ctx, commenterName: "ian" });
    expect(element.title).toBe("Hi ian");
  });

  it("builds a button-message and a plain-text fallback", () => {
    expect(buildFirstCardButtons([card()], links, ctx)).toEqual({
      text: "Messi #256\n1 張 NT$499",
      buttons: [{ title: "選擇張數", url: moduleLinkUrl("s-btn", ctx) }],
    });
    const text = buildCardsPlainText([card(), card({ title: "Card 2" })], links, ctx, "看看這些");
    expect(text.startsWith("看看這些")).toBe(true);
    expect(text).toContain("Card 2");
  });
});

describe("sending a module", () => {
  const moduleRecord = {
    id: "m1",
    introText: "嗨 {username}",
    cards: [card()],
    links: [{ slug: "s-btn", card: 1, slot: "btn1" }],
  };
  const context = { provider: "META" as const, accessToken: "t" };
  const refusal = () => new PermissionError("Invalid parameter (/me/messages) [code=100 sub=- type=OAuthException trace=x]");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_URL", "https://reply.example.com");
  });

  it("answers a comment with the carousel as its one private reply", async () => {
    const result = await sendModuleAsPrivateReply({
      context, instagramAccountId: "ig", commentId: "c1", module: moduleRecord,
      automationId: "auto1", commenterId: "u1", commenterName: "ian", fallbackText: "fallback",
    });
    expect(result).toBe("cards");
    expect(send.sendPrivateReplyWithCards).toHaveBeenCalledTimes(1);
    // A private reply is one message: the intro is not sent separately.
    expect(send.sendPrivateReply).not.toHaveBeenCalled();
  });

  it("falls back to a button message when Meta refuses the carousel", async () => {
    send.sendPrivateReplyWithCards.mockRejectedValueOnce(refusal());
    const result = await sendModuleAsPrivateReply({
      context, instagramAccountId: "ig", commentId: "c1", module: moduleRecord,
      automationId: "auto1", commenterId: "u1", fallbackText: "fallback",
    });
    expect(result).toBe("button");
    expect(send.sendPrivateReplyWithLinkButton).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the conversation itself was refused", async () => {
    send.sendPrivateReplyWithCards.mockRejectedValueOnce(
      new PermissionError("The comment is invalid for a private reply [code=100 sub=- type=x trace=x]")
    );
    await expect(
      sendModuleAsPrivateReply({
        context, instagramAccountId: "ig", commentId: "c1", module: moduleRecord,
        automationId: "auto1", commenterId: "u1", fallbackText: "fallback",
      })
    ).rejects.toThrow(/invalid for a private reply/);
    expect(send.sendPrivateReplyWithLinkButton).not.toHaveBeenCalled();
  });

  it("sends the intro then the cards into an open conversation", async () => {
    const result = await sendModuleAsDirectMessage({
      context, instagramAccountId: "ig", userId: "u1", module: moduleRecord,
      automationId: "auto1", commenterName: "ian", fallbackText: "fallback",
    });
    expect(result).toBe("cards");
    expect(send.sendDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ message: "嗨 ian" }));
    expect(send.sendDirectMessageWithCards).toHaveBeenCalledTimes(1);
  });

  it("classifies only template refusals as worth a fallback", () => {
    expect(isCardsRejection(refusal())).toBe(true);
    expect(isCardsRejection(new RateLimitError("slow down [code=4 sub=- type=x trace=x]"))).toBe(false);
    expect(isCardsRejection(new Error("network"))).toBe(false);
  });
});

describe("click summary", () => {
  it("counts taps and distinct people per slot in card order", () => {
    const links = [
      { id: "b", card: 1, slot: "btn1", destinationUrl: "https://a.b/1" },
      { id: "i", card: 1, slot: "img", destinationUrl: "https://a.b/1" },
    ];
    const summary = summarizeModuleClicks(links, [
      { moduleLinkId: "b", recipientHash: "p1", ipHash: null },
      { moduleLinkId: "b", recipientHash: "p1", ipHash: null },
      { moduleLinkId: "b", recipientHash: null, ipHash: "ip2" },
      { moduleLinkId: "i", recipientHash: null, ipHash: null },
    ]);
    expect(summary.map((s) => s.slot)).toEqual(["img", "btn1"]);
    expect(summary[1]).toMatchObject({ clicks: 3, uniqueClicks: 2 });
    expect(summary[0]).toMatchObject({ clicks: 1, uniqueClicks: 1 });
  });
});
