import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import type { Item, Reason } from "../src/inbox.js";
import { Inbox, type InboxAction } from "../src/ui/Inbox.js";

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function item(i: number, reason: Reason, author: string, body: string): Item {
  return {
    id: `id-${i}`,
    shortHash: `abc${i}def`.slice(0, 7),
    url: `https://dev-null.sh/@${author}/commits/id-${i}`,
    author,
    body,
    createdAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    replies: reason === "active" ? 20 : 1,
    newReplies: reason === "replies" ? 1 : 0,
    reason,
    score: 100 - i,
  };
}

const ITEMS: Item[] = [
  item(0, "replies", "ascendaone-com", "Thanks @nunomaduro for creating this!"),
  item(1, "mention", "a-much-longer-username-than-fits", "@ascendaone-com what do you think? 🚀 emoji"),
  item(2, "question", "b", "who wants the ability of upload 1 min videos to this app? not reels or shorts, just regular posts with max 1 minute videos, which is long"),
  item(3, "active", "c", "curate your timeline"),
  ...Array.from({ length: 6 }, (_, i) => item(4 + i, "following", `user${i}`, `post ${i}`)),
];

function setup(items = ITEMS) {
  const actions: InboxAction[] = [];
  const dismissed: string[] = [];
  const app = render(
    <Inbox
      username="ascendaone-com"
      load={async () => items}
      onOpen={() => true}
      onDismiss={(dismissedItem) => dismissed.push(dismissedItem.id)}
      onDone={(action) => actions.push(action)}
    />,
  );
  return { ...app, actions, dismissed };
}

describe("Inbox", () => {
  it("lists ten items with their columns lined up", async () => {
    const { lastFrame } = setup();
    await tick();
    const rows = (lastFrame() ?? "").split("\n").filter((line) => /^.\s?[0-9] @/.test(line));
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((row) => row.indexOf("@")))).toHaveProperty("size", 1);
    expect(new Set(rows.map((row) => row.trimEnd().length))).toHaveProperty("size", 1);
    expect((lastFrame() ?? "").split("\n").filter((line) => line.trim() === "reply" || line.trim() === "replies")).toEqual([]);
    expect(lastFrame()).toContain("1 new reply · 1 mention · 1 question");
    expect(lastFrame()).toContain("@a-much-longer-…");
  });

  it("replies to an item by its number, with 0 for the tenth", async () => {
    const { stdin, actions } = setup();
    await tick();
    stdin.write("0");
    await tick();
    expect(actions).toEqual([{ kind: "reply", item: ITEMS[9] }]);
  });

  it("moves with the arrows and replies to the selected item on enter", async () => {
    const { stdin, actions, lastFrame } = setup();
    await tick();
    stdin.write("\u001b[B");
    await tick();
    expect(lastFrame()).toContain("› 2 @a-much");
    stdin.write("\r");
    await tick();
    expect(actions).toEqual([{ kind: "reply", item: ITEMS[1] }]);
  });

  it("marks the selected item done and drops it from the list", async () => {
    const { stdin, dismissed, lastFrame } = setup();
    await tick();
    stdin.write("d");
    await tick();
    expect(dismissed).toEqual(["id-0"]);
    expect(lastFrame()).not.toContain("Thanks @nunomaduro");
  });

  it("says when there's nothing to do, and quits on q", async () => {
    const { stdin, actions, lastFrame } = setup([]);
    await tick();
    expect(lastFrame()).toContain("All caught up");
    stdin.write("q");
    await tick();
    expect(actions).toEqual([{ kind: "quit" }]);
  });
});
