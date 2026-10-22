import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { age, rank, type ApiCommit } from "../src/inbox.js";
import { loadConfig, loadState, saveConfig, saveState, type State } from "../src/store.js";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const empty = (): State => ({ seenReplies: {}, done: {} });

let n = 0;
function commit(fields: Partial<ApiCommit> & { author: string }): ApiCommit {
  n++;
  const { author, ...rest } = fields;
  return {
    id: `id-${n}`,
    short_hash: `h${n}`,
    body: "hello",
    parent_id: null,
    html_url: `https://dev-null.sh/@${author}/commits/id-${n}`,
    created_at: hoursAgo(1),
    replies_count: 0,
    author: { username: author },
    ...rest,
  };
}

describe("rank", () => {
  it("puts new replies on your commits first, then mentions, questions, active threads, and the rest", () => {
    const items = rank(
      {
        me: "ascendaone-com",
        mine: [commit({ author: "ascendaone-com", replies_count: 2 })],
        theirs: [
          commit({ author: "a", body: "just shipped" }),
          commit({ author: "b", body: "busy thread", replies_count: 5 }),
          commit({ author: "c", body: "how do you all review agent code?" }),
          commit({ author: "d", body: "@ascendaone-com thoughts?" }),
        ],
      },
      empty(),
      NOW,
    );
    expect(items.map((item) => item.reason)).toEqual(["replies", "mention", "question", "active", "following"]);
    expect(items[0]?.newReplies).toBe(2);
  });

  it("only brings your commits back for replies you haven't seen", () => {
    const mine = [commit({ author: "me", replies_count: 3 })];
    const id = mine[0]!.id;
    expect(rank({ me: "me", mine, theirs: [] }, { seenReplies: { [id]: 3 }, done: {} }, NOW)).toEqual([]);
    expect(rank({ me: "me", mine, theirs: [] }, { seenReplies: { [id]: 1 }, done: {} }, NOW)[0]?.newReplies).toBe(2);
  });

  it("skips what you've dealt with, old commits, and other people's replies that don't mention you", () => {
    const done = commit({ author: "a", body: "answered?" });
    const items = rank(
      {
        me: "me",
        mine: [],
        theirs: [
          done,
          commit({ author: "b", body: "old news?", created_at: hoursAgo(100) }),
          commit({ author: "c", body: "a reply elsewhere", parent_id: "x" }),
          commit({ author: "d", body: "a reply to @me", parent_id: "y" }),
        ],
      },
      { seenReplies: {}, done: { [done.id]: "2026-10-23T00:00:00Z" } },
      NOW,
    );
    expect(items.map((item) => item.author)).toEqual(["d"]);
  });

  it("doesn't take a longer handle for a mention of you", () => {
    const items = rank({ me: "tom", mine: [], theirs: [commit({ author: "a", body: "cc @tommy" })] }, empty(), NOW);
    expect(items[0]?.reason).toBe("following");
  });

  it("prefers recent over old for the same kind of item, and keeps ten", () => {
    const theirs = Array.from({ length: 15 }, (_, i) => commit({ author: `u${i}`, body: "a question?", created_at: hoursAgo(i) }));
    const items = rank({ me: "me", mine: [], theirs }, empty(), NOW);
    expect(items).toHaveLength(10);
    expect(items.map((item) => item.author).slice(0, 3)).toEqual(["u0", "u1", "u2"]);
  });
});

describe("age", () => {
  it("is short, like /dev/null's", () => {
    expect(age(hoursAgo(0.5), NOW)).toBe("30m");
    expect(age(hoursAgo(3), NOW)).toBe("3h");
    expect(age(hoursAgo(50), NOW)).toBe("2d");
  });
});

describe("store", () => {
  it("round-trips config and state, and starts empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nullbox-store-"));
    try {
      expect(await loadConfig(dir)).toEqual({});
      expect(await loadState(dir)).toEqual(empty());
      await saveConfig({ username: "me" }, dir);
      await saveState({ seenReplies: { a: 1 }, done: { b: "t" } }, dir);
      expect(await loadConfig(dir)).toEqual({ username: "me" });
      expect(await loadState(dir)).toEqual({ seenReplies: { a: 1 }, done: { b: "t" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
