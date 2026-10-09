"use client";

import { MessageCircle, Trophy } from "lucide-react";
/**
 * Comment giveaway: pick winners at random among a post's commenters, with
 * optional rules (a keyword, tagging friends, one entry per person). Every
 * draw is kept, so the result can be shown later.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Post {
  id: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type: string;
  permalink?: string;
  comments_count?: number;
  timestamp: string;
}

interface Winner {
  username: string;
  commentId: string;
  text: string;
}

interface Draw {
  id: string;
  mediaId: string;
  permalink: string | null;
  entrants: number;
  winners: Winner[];
  settings: { keyword: string | null; minMentions: number; uniquePerUser: boolean; commentsRead?: number };
  createdAt: string;
  instagramAccount?: { username: string };
}

const inputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export default function GiveawayPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<{ id: string; username: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [winners, setWinners] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [minMentions, setMinMentions] = useState(0);
  const [uniquePerUser, setUniquePerUser] = useState(true);
  const [exclude, setExclude] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Draw | null>(null);
  const [history, setHistory] = useState<Draw[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/giveaways", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (data?.success) setHistory(data.data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/instagram/accounts")
        .then((r) => r.json())
        .then((data) => {
          if (data?.success) {
            const list = data.data.instagramAccounts ?? [];
            setAccounts(list);
            setAccountId((current) => current || list[0]?.id || "");
          }
        })
        .catch(() => {});
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    if (!accountId) return;
    const timer = window.setTimeout(() => {
      setPostsLoading(true);
      void fetch(`/api/instagram/posts?all=true&instagramAccountId=${accountId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.success) setPosts(data.data);
        })
        .catch(() => {})
        .finally(() => setPostsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountId]);

  async function draw() {
    if (!post) return setError(t("Choose a post."));
    if (!confirm(t("Draw {count} winner(s) now? Every draw is kept on record.", { count: winners }))) return;
    setError(null);
    setResult(null);
    setDrawing(true);
    const res = await fetch("/api/giveaways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagramAccountId: accountId || null,
        mediaId: post.id,
        permalink: post.permalink ?? null,
        winners,
        keyword: keyword.trim() || null,
        minMentions,
        uniquePerUser,
        excludeUsernames: exclude
          .split(/[,，、\s]+/)
          .map((name) => name.trim().replace(/^@/, ""))
          .filter(Boolean)
          .slice(0, 200),
      }),
    });
    const data = await res.json().catch(() => null);
    setDrawing(false);
    if (data?.error === "too_many_comments") {
      return setError(t("This post has too many comments to read in one go ({count} read), so no draw was made to keep it fair.", { count: data.commentsRead ?? 0 }));
    }
    if (!data?.success) return setError(t("Could not read the comments. Try again in a minute."));
    setResult(data.data);
    void loadHistory();
  }

  const thumb = (p: Post) => p.thumbnail_url || p.media_url;

  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-1 text-sm text-muted">
        <p>{t("Pick giveaway winners at random from a post's comments.")}</p>
        <p className="text-xs">
          {t("Instagram's rules for promotions: state the official rules and eligibility in the post, say the giveaway is not sponsored or run by Instagram, and don't ask people to tag themselves in content they are not in.")}
        </p>
      </div>

      <section className="panel space-y-4 rounded p-5">
        {accounts.length > 1 && (
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs text-muted">{t("Instagram account")}</span>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPost(null);
              }}
              className={inputClass}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  @{account.username}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="mb-2 block text-xs text-muted">{t("Post")}</span>
          {postsLoading ? (
            <div className="h-24 animate-pulse rounded bg-surface" />
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted">{t("No posts found. Check the Instagram connection in Settings.")}</p>
          ) : (
            <div className="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 overflow-y-auto">
              {posts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPost(p)}
                  className={`relative aspect-square min-w-0 overflow-hidden rounded border-2 ${
                    post?.id === p.id ? "border-accent" : "border-transparent"
                  }`}
                  title={p.caption?.slice(0, 80)}
                >
                  {thumb(p) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb(p)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="block h-full w-full bg-surface" />
                  )}
                  {typeof p.comments_count === "number" && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
                      <MessageCircle className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />{p.comments_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {post && (
            <p className="mt-2 truncate text-xs text-muted">
              {t("Selected")}: {post.caption?.slice(0, 80) || post.id}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t("Number of winners")}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={winners}
              onChange={(e) => setWinners(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Comment must contain")} {t("(optional)")}
            </span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} maxLength={50} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t("Must tag at least this many friends")}</span>
            <select value={minMentions} onChange={(e) => setMinMentions(Number(e.target.value))} className={inputClass}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t("No requirement") : t("{count} friends", { count: n })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {t("Leave out these accounts")} {t("(optional)")}
            </span>
            <input
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              placeholder={t("e.g. staff accounts, last month's winners")}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={uniquePerUser} onChange={(e) => setUniquePerUser(e.target.checked)} />
          {t("One entry per person (commenting more often does not raise the odds)")}
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void draw()}
            disabled={drawing || !post}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {drawing ? t("Reading comments…") : t("Draw winners")}
          </button>
          {error && <span className="text-sm text-error">{error}</span>}
        </div>

        {result && (
          <div className="rounded border border-accent/30 bg-accent/5 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-accent" aria-hidden />{t("Winners")}</p>
            <p className="mb-2 text-xs text-muted">
              {t("{entrants} eligible entries from {comments} comments", {
                entrants: result.entrants,
                comments: result.settings.commentsRead ?? result.entrants,
              })}
            </p>
            {result.winners.length === 0 ? (
              <p className="text-sm text-muted">{t("No comment met the rules.")}</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {result.winners.map((w) => (
                  <li key={w.commentId}>
                    <a
                      href={`https://www.instagram.com/${encodeURIComponent(w.username)}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold hover:underline"
                    >
                      @{w.username}
                    </a>
                    <span className="text-muted"> — {w.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("Past draws")}</h3>
        {history.length === 0 ? (
          <div className="panel rounded p-6 text-center text-sm text-muted">{t("No draws yet.")}</div>
        ) : (
          history.map((d) => (
            <div key={d.id} className="panel rounded p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{new Date(d.createdAt).toLocaleString(locale)}</span>
                {d.instagramAccount && <span>@{d.instagramAccount.username}</span>}
                {d.permalink && (
                  <a href={d.permalink} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {t("View post")}
                  </a>
                )}
                <span>{t("{count} eligible", { count: d.entrants })}</span>
              </div>
              <p className="mt-1">
                {d.winners.length ? d.winners.map((w) => `@${w.username}`).join("、") : t("No comment met the rules.")}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
