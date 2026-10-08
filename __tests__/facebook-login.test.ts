import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCodeForToken, getAuthorizationUrl } from "../lib/meta/oauth";
import {
  getConversations,
  getInstagramLinkedPages,
  getUserInfo,
  getUserMedia,
  sendPrivateReply,
  subscribeInstagramAccountToWebhooks,
} from "../lib/meta/client";

const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}
function calledUrl(index = 0): URL {
  return new URL(String(fetchMock.mock.calls[index][0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
  vi.stubEnv("INSTAGRAM_APP_ID", "1318");
  vi.stubEnv("INSTAGRAM_APP_SECRET", "app-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("META_LOGIN_MODE=facebook", () => {
  beforeEach(() => vi.stubEnv("META_LOGIN_MODE", "facebook"));

  it("authorizes on the Facebook dialog with Page and Instagram scopes", () => {
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "st"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1318");
    const scope = url.searchParams.get("scope")!.split(",");
    expect(scope).toEqual(
      expect.arrayContaining(["instagram_manage_messages", "pages_messaging", "pages_manage_metadata"])
    );
  });

  it("uses a Facebook Login for Business configuration instead of scopes when set", () => {
    vi.stubEnv("META_FB_LOGIN_CONFIG_ID", "cfg_1");
    const url = new URL(getAuthorizationUrl("https://app.test/cb", "st"));
    expect(url.searchParams.get("config_id")).toBe("cfg_1");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("exchanges the code on graph.facebook.com", async () => {
    respond({ access_token: "user-token" });
    await expect(exchangeCodeForToken("abc", "https://app.test/cb")).resolves.toEqual({
      accessToken: "user-token",
      userId: "",
    });
    const url = calledUrl();
    expect(url.host).toBe("graph.facebook.com");
    expect(url.pathname).toBe("/v25.0/oauth/access_token");
    expect(url.searchParams.get("code")).toBe("abc");
  });

  it("sends private replies through the Page (me) on graph.facebook.com", async () => {
    respond({ recipient_id: "r", message_id: "m" });
    await sendPrivateReply("page-token", "17841", "comment_1", "hi");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://graph.facebook.com/v25.0/me/messages"
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      recipient: { comment_id: "comment_1" },
      message: { text: "hi" },
    });
  });

  it("reads the inbox from the Page's Instagram conversations", async () => {
    respond({ data: [{ id: "c1" }] });
    await getConversations("page-token", "17841");
    const url = calledUrl();
    expect(url.pathname).toBe("/v25.0/me/conversations");
    expect(url.searchParams.get("platform")).toBe("instagram");
  });

  it("maps the Page's linked Instagram account to the /me profile shape", async () => {
    respond({
      instagram_business_account: { id: "17841", username: "ofsyd.co", followers_count: 10 },
    });
    await expect(getUserInfo("page-token-a")).resolves.toEqual({
      id: "17841",
      user_id: "17841",
      username: "ofsyd.co",
      followers_count: 10,
    });
    expect(calledUrl().searchParams.get("fields")).toContain("instagram_business_account");
  });

  it("explains a Page with no linked Instagram account", async () => {
    respond({ id: "page" });
    await expect(getUserInfo("page-token-b")).rejects.toThrow(/no Instagram professional account/);
  });

  it("lists media on the linked account rather than me/media", async () => {
    respond({ instagram_business_account: { id: "17841", username: "ofsyd.co" } });
    respond({ data: [] });
    await getUserMedia("page-token-c", 5);
    expect(calledUrl(1).pathname).toBe("/v25.0/17841/media");
  });

  it("keeps only Pages with a linked Instagram account and follows paging", async () => {
    respond({
      data: [
        { id: "p1", name: "OFSYD", access_token: "pt1", instagram_business_account: { id: "17841", username: "ofsyd.co" } },
        { id: "p2", name: "No IG", access_token: "pt2" },
      ],
      paging: { next: "https://graph.facebook.com/v25.0/me/accounts?after=x" },
    });
    respond({ data: [] });
    const pages = await getInstagramLinkedPages("user-token");
    expect(pages).toEqual([
      {
        pageId: "p1",
        pageName: "OFSYD",
        pageAccessToken: "pt1",
        instagram: { id: "17841", user_id: "17841", username: "ofsyd.co" },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("subscribes the app to the Page for webhooks", async () => {
    respond({ success: true });
    await subscribeInstagramAccountToWebhooks("17841", "page-token");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://graph.facebook.com/v25.0/me/subscribed_apps"
    );
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("subscribed_fields=messages");
  });
});

describe("default Instagram Login mode is unchanged", () => {
  it("still authorizes on instagram.com and sends from the account node", async () => {
    expect(new URL(getAuthorizationUrl("https://app.test/cb", "st")).host).toBe(
      "www.instagram.com"
    );
    respond({ recipient_id: "r", message_id: "m" });
    await sendPrivateReply("ig-token", "17841", "comment_1", "hi");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://graph.instagram.com/v25.0/17841/messages"
    );
  });
});
