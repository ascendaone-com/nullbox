import { HttpError, NullboxError, sanitize } from "./errors.js";
import { request } from "./http.js";
import type { State } from "./store.js";

/**
 * The inbox from public data, until /dev/null lets a CLI sign in for notifications: replies piling up on your own
 * commits, commits that mention you, and conversations from people you follow. One request for who you follow, one
 * per person: well inside the API's 60 a minute.
 */

export interface ApiCommit {
  id: string;
  short_hash: string;
  body: string;
  parent_id: string | null;
  html_url: string;
  created_at: string;
  stars_count?: number;
  replies_count?: number;
  author?: { username?: string };
}

export type Reason = "replies" | "mention" | "question" | "active" | "following";

export interface Item {
  id: string;
  shortHash: string;
  url: string;
  author: string;
  body: string;
  createdAt: string;
  replies: number;
  /** New replies since you last looked, for your own commits. */
  newReplies: number;
  reason: Reason;
  score: number;
}

const MAX_AGE_HOURS = 72;
const MAX_FOLLOWING = 30;
const CONCURRENCY = 5;
/** How long the commits of people you follow are reused, so a refresh right after a reply costs 2 requests, not 20. */
const FOLLOWING_TTL_MS = 60_000;

async function getJson<T>(url: string): Promise<T> {
  try {
    const { body } = await request(url, { headers: { Accept: "application/json" }, timeoutMs: 15_000 });
    return JSON.parse(body) as T;
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      throw new HttpError(`${new URL(url).host} is limiting how often nullbox can ask. Give it a minute, then press r.`, 429);
    }
    throw error;
  }
}

export async function userCommits(baseUrl: string, username: string): Promise<ApiCommit[]> {
  return (await getJson<{ data: ApiCommit[] }>(`${baseUrl}/api/v1/users/${encodeURIComponent(username)}/commits`)).data;
}

export async function following(baseUrl: string, username: string): Promise<string[]> {
  const { data } = await getJson<{ data: Array<{ username: string }> }>(`${baseUrl}/api/v1/users/${encodeURIComponent(username)}/following`);
  return data.map((user) => user.username).slice(0, MAX_FOLLOWING);
}

/**
 * Runs fn over items a few at a time. A person whose commits can't be read is skipped, but being rate limited stops
 * the lot: a half-loaded inbox would look complete when it isn't.
 */
async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index] as T).catch((error: unknown) => {
          if (error instanceof HttpError && error.status === 429) throw error;
          return undefined;
        });
      }
    }),
  );
  return results;
}

const BASE: Record<Reason, number> = { replies: 100, mention: 80, question: 40, active: 25, following: 10 };

function hoursSince(iso: string, now: number): number {
  return Math.max(0, (now - Date.parse(iso)) / 3_600_000);
}

function mentions(body: string, username: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9-])@${username.replace(/[^A-Za-z0-9-]/g, "")}(?![A-Za-z0-9-])`, "i").test(body);
}

/**
 * Scores commits into inbox items: what kind of attention each asks for, times how recent it is. Pure, so ranking can
 * be tested without the network. Your own commits only show while they have replies you haven't seen.
 */
export function rank(
  { me, mine, theirs }: { me: string; mine: ApiCommit[]; theirs: ApiCommit[] },
  state: State,
  now = Date.now(),
  limit = 10,
): Item[] {
  const items: Item[] = [];

  for (const commit of mine) {
    const replies = commit.replies_count ?? 0;
    const newReplies = replies - (state.seenReplies[commit.id] ?? 0);
    if (newReplies <= 0) continue;
    items.push(toItem(commit, "replies", BASE.replies + Math.min(newReplies, 10) * 2, newReplies));
  }

  for (const commit of theirs) {
    if (state.done[commit.id] !== undefined) continue;
    const age = hoursSince(commit.created_at, now);
    if (age > MAX_AGE_HOURS) continue;

    const replies = commit.replies_count ?? 0;
    const isMention = mentions(commit.body, me);
    // Someone else's reply in a thread you're not in is noise; one that mentions you isn't.
    if (commit.parent_id !== null && !isMention) continue;

    const asks = /\?\s*$|\?\s/m.test(commit.body);
    const reason: Reason = isMention ? "mention" : asks ? "question" : replies >= 3 ? "active" : "following";
    const base = BASE[reason] + (isMention && asks ? 20 : 0) + Math.min(replies, 20);
    items.push(toItem(commit, reason, base * Math.exp(-age / 24), 0));
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

function toItem(commit: ApiCommit, reason: Reason, score: number, newReplies: number): Item {
  return {
    id: commit.id,
    shortHash: sanitize(commit.short_hash),
    url: commit.html_url,
    author: sanitize(commit.author?.username ?? "?"),
    body: sanitize(commit.body).trim(),
    createdAt: commit.created_at,
    replies: commit.replies_count ?? 0,
    newReplies,
    reason,
    score,
  };
}

let cache: { key: string; at: number; theirs: ApiCommit[] } | undefined;

export async function fetchInbox(baseUrl: string, me: string, state: State): Promise<Item[]> {
  let mine: ApiCommit[];
  let people: string[];
  try {
    [mine, people] = await Promise.all([userCommits(baseUrl, me), following(baseUrl, me)]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new NullboxError(`There's no /dev/null user called @${me}. Run nullbox --user <username> to change it.`);
    }
    throw error;
  }

  const key = `${baseUrl} ${people.join(",")}`;
  if (cache?.key !== key || Date.now() - cache.at > FOLLOWING_TTL_MS) {
    const theirs = (await mapLimited(people, (person) => userCommits(baseUrl, person))).flatMap((commits) => commits ?? []);
    cache = { key, at: Date.now(), theirs };
  }
  return rank({ me, mine, theirs: cache.theirs }, state);
}

/** "40m", "3h", "2d": the same short ages /dev/null shows. */
export function age(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
