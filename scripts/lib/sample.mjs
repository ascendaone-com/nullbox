// The sample inbox the README's screenshots and demo are made from. The handles and posts are made up, so the README
// never shows real people's commits.

import { render } from "ink-testing-library";
import React from "react";
import { Composer } from "../../dist/ui/Composer.js";
import { Inbox } from "../../dist/ui/Inbox.js";

export { Composer, Inbox, render };

export const COLUMNS = 92;
export const h = React.createElement;
export const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

// Ink reads the width from stdout, which ink-testing-library fixes at 100.
const probe = render(h(React.Fragment));
Object.defineProperty(Object.getPrototypeOf(probe.stdout), "columns", { get: () => COLUMNS });
probe.unmount();

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000 + 5_000).toISOString();
const hashes = ["b06d99e", "0be0130", "f2c3ce7", "8edc1f4", "7e91958", "c7c6ed0", "a41f0c2", "5ad0532", "e1188ba", "9c3d7aa"];
let next = 0;
const item = (author, reason, body, minutes, extra = {}) => ({
  id: `sample-${next}`,
  shortHash: hashes[next++],
  url: "https://dev-null.sh/",
  author,
  body,
  createdAt: minutesAgo(minutes),
  replies: 1,
  newReplies: 0,
  reason,
  score: 0,
  ...extra,
});

export const mention = "@you how do you cap concurrency? I tried this:\n```ts\nconst limit = pLimit(4);\nawait Promise.all(jobs.map((j) => limit(run, j)));\n```\nbut the review queue still explodes.";
export const items = [
  item("you", "replies", "Reviewing agent output takes longer than writing the code myself some days.", 70, { newReplies: 2, replies: 2 }),
  item("engineer42", "mention", mention, 42),
  item("devlin", "question", "How are people managing five agents at once?", 125),
  item("mara-k", "question", "Anyone else batching reviews instead of watching each agent?", 190),
  item("tamsin", "active", "Hot take: the bottleneck moved from typing to reading.", 260, { replies: 14 }),
  item("oskar", "question", "What's your terminal setup for long agent runs?", 300),
  item("priya", "question", "Do you keep agents on separate branches or one?", 340),
  item("lee", "following", "Shipped a tiny CLI for tailing agent logs today.", 400),
  item("ren", "following", "Rails autoscaling on CPU and response time, not guesswork", 470),
  item("noor", "following", "OpenTelemetry tracing without touching your infrastructure", 520),
];

export async function inboxFrame() {
  const app = render(h(Inbox, { username: "you", load: async () => items, onOpen: () => true, onDismiss() {}, onDone() {} }));
  await tick();
  app.stdin.write("\u001b[B");
  await tick();
  const frame = app.lastFrame();
  app.unmount();
  return frame;
}

export async function replyFrame() {
  const parent = { username: "engineer42", shortHash: "0be0130", body: mention };
  const app = render(h(Composer, { replyTo: "0be0130", parent, initial: "", dryRun: false, onDone() {} }));
  await tick();
  for (const keys of ["Cap the review side too. I gate merges, not runs:", "\\", "\r", "```ts", "\r", "const reviews = pLimit(2);", "\r", "```"]) {
    app.stdin.write(keys);
    await tick();
  }
  const frame = app.lastFrame();
  app.unmount();
  return frame;
}

