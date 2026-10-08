import { describe, expect, it } from "vitest";
import { findConflicts, type ConflictCandidate } from "@/lib/campaigns/conflicts";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

const campaign = (overrides: Partial<ConflictCandidate>): ConflictCandidate => ({
  id: "a",
  name: "A",
  instagramAccountId: "ig",
  isActive: true,
  dmOnly: false,
  dmRuleType: "KEYWORD",
  postId: "post1",
  matchAnyPost: false,
  matchAnyWord: false,
  keywords: ["梅西"],
  dmTriggerEnabled: false,
  ...overrides,
});

describe("campaign conflicts", () => {
  it("flags two campaigns answering the same comments on one post", () => {
    const conflicts = findConflicts(campaign({}), [campaign({ id: "b", name: "B", keywords: ["梅西卡"] })]);
    expect(conflicts).toEqual([{ otherId: "b", otherName: "B", kind: "comment" }]);
  });

  it("treats any-post and any-word campaigns as overlapping everything", () => {
    expect(findConflicts(campaign({}), [campaign({ id: "b", postId: null, matchAnyPost: true, keywords: [], matchAnyWord: true })])).toHaveLength(1);
  });

  it("ignores different posts, different words, paused campaigns and other accounts", () => {
    const target = campaign({});
    expect(findConflicts(target, [campaign({ id: "b", postId: "post2" })])).toEqual([]);
    expect(findConflicts(target, [campaign({ id: "b", keywords: ["LINK"] })])).toEqual([]);
    expect(findConflicts(target, [campaign({ id: "b", isActive: false })])).toEqual([]);
    expect(findConflicts(target, [campaign({ id: "b", instagramAccountId: "other" })])).toEqual([]);
  });

  it("flags DM keyword rules sharing a word, whatever their posts", () => {
    const rule = campaign({ dmOnly: true, postId: null, keywords: ["TEST"] });
    const other = campaign({ id: "b", name: "B", postId: "post9", keywords: ["test"], dmTriggerEnabled: true });
    expect(findConflicts(rule, [other])).toEqual([{ otherId: "b", otherName: "B", kind: "dm" }]);
  });
});

describe("story mention and ice breaker rules", () => {
  it("flags a second story-mention rule but never keyword-matches them", () => {
    const story = campaign({ dmOnly: true, dmRuleType: "STORY_MENTION", postId: null, keywords: [] });
    expect(findConflicts(story, [{ ...story, id: "b", name: "B" }])).toEqual([{ otherId: "b", otherName: "B", kind: "story" }]);
    const keywordRule = campaign({ id: "k", dmOnly: true, postId: null, keywords: ["梅西"] });
    expect(findConflicts(keywordRule, [{ ...story, id: "s" }])).toEqual([]);
  });

  it("does not treat ice breaker rules as keyword rules", () => {
    const ice = campaign({ dmOnly: true, dmRuleType: "ICE_BREAKER", postId: null, keywords: [], matchAnyWord: false });
    const keywordRule = campaign({ id: "k", dmOnly: true, postId: null, keywords: ["梅西"], matchAnyWord: true });
    expect(findConflicts(keywordRule, [{ ...ice, id: "i" }])).toEqual([]);
  });
});

describe("keywords in scripts written without spaces", () => {
  it("matches a Chinese keyword inside a sentence even in whole-word mode", () => {
    expect(matchKeywords("我要梅西", ["梅西"], true).matched).toBe(true);
    expect(matchKeywords("梅西退休了！", ["退休"], true).matched).toBe(true);
    expect(matchKeywords("我要C羅", ["梅西"], true).matched).toBe(false);
  });

  it("matches Japanese, Korean and Thai the same way", () => {
    expect(matchKeywords("これください", ["ください"], true).matched).toBe(true);
    expect(matchKeywords("가격알려주세요", ["가격"], true).matched).toBe(true);
    expect(matchKeywords("ขอราคาครับ", ["ราคา"], true).matched).toBe(true);
  });

  it("keeps whole-word matching for spaced scripts", () => {
    expect(matchKeywords("linking", ["link"], true).matched).toBe(false);
    expect(matchKeywords("send link pls", ["link"], true).matched).toBe(true);
  });
});
