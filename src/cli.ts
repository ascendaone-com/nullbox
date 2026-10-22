#!/usr/bin/env node
import { createRequire } from "node:module";
import { styleText } from "node:util";
import { parseInboxArgs, parseReplyArgs } from "./args.js";
import { commit, commitIdFromLink } from "./commit.js";
import { devnullUrl } from "./config.js";
import { NullboxError, sanitize } from "./errors.js";
import { request } from "./http.js";
import { fetchInbox } from "./inbox.js";
import { openInBrowser } from "./open.js";
import { loadConfig, loadState, saveConfig, saveState } from "./store.js";
import { askUsername, compose, inbox, type Parent } from "./ui/app.js";
import { glyphs } from "./ui/theme.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `nullbox ${version} — your /dev/null inbox, in the terminal

Usage:
  nullbox [--user <name>] [--dry-run]   Your top 10 conversations, ready to reply to
  nullbox reply <hash|link> [message]   Reply to one commit
  nullbox --help | --version

Options:
  --user <name>   Your /dev/null username (asked once, then remembered)
  --dry-run       Find your key and sign replies, but don't send them
  --              End options, for a message that starts with --

The inbox:
  1-0 or enter  reply          o  open in your browser
  ↑ ↓           move           d  done (hide it)
  r             refresh        q  quit

Writing a reply:
  enter         send
  \\ + enter     new line (option+enter and ctrl+j work too)
  esc           cancel (twice if you've typed something)

Your reply is signed with the SSH key on your GitHub account, the same way
https://dev-null.sh/commit does it. To find that key, nullbox sends your
*public* keys to /dev/null. Private keys never leave ssh-keygen or your agent.

Until /dev/null lets a CLI read notifications, the inbox is built from public
data: new replies on your commits, commits that mention you, and recent
conversations from people you follow.
`;

const dim = (text: string) => styleText("dim", text);

function step(text: string): void {
  console.log(`  ${dim(glyphs.step)} ${text}`);
}

/** Who and what the reply is to, when the target is a link the public API can show. Best effort only. */
async function fetchParent(baseUrl: string, replyTo: string): Promise<Parent | undefined> {
  const id = commitIdFromLink(replyTo);
  if (id === undefined) return undefined;

  try {
    const { body } = await request(`${baseUrl}/api/v1/commits/${id}`, { headers: { Accept: "application/json" }, timeoutMs: 10_000 });
    const json = JSON.parse(body) as { data?: ApiCommit } & ApiCommit;
    const commit = json.data ?? json;
    return {
      username: commit.author?.username && sanitize(commit.author.username),
      shortHash: commit.short_hash && sanitize(commit.short_hash),
      body: commit.body && sanitize(commit.body),
    };
  } catch {
    return undefined;
  }
}

interface ApiCommit {
  short_hash?: string;
  body?: string;
  author?: { username?: string };
}

/** "ssh-ed25519 AAAA…x9Qz", enough to recognise a key without filling the line. */
function shortKey(key: string): string {
  const [type = "", base64 = ""] = key.split(" ");
  return `${type} ${base64.slice(0, 8)}…${base64.slice(-4)}`;
}

async function reply(argv: string[]): Promise<void> {
  const baseUrl = devnullUrl();
  const args = parseReplyArgs(argv);

  requireTerminal();

  const parent = await fetchParent(baseUrl, args.replyTo);
  console.log();
  const result = await compose({ replyTo: args.replyTo, parent, initial: args.message, dryRun: args.dryRun });

  if (result.kind === "cancel") {
    console.log(`\n  ${dim("Cancelled. Nothing was sent.")}`);
    process.exitCode = 130;
    return;
  }

  console.log(`\n  ${await send(baseUrl, args.replyTo, result.text, args.dryRun)}`);
}

/** Signs and sends a reply, showing each step, and returns the line that says how it went. */
async function send(baseUrl: string, replyTo: string, message: string, dryRun: boolean): Promise<string> {
  console.log();
  const sent = await commit({
    baseUrl,
    replyTo,
    message,
    dryRun,
    onStep: (name, detail) => {
      if (name === "lookup") step("Finding your GitHub SSH key…");
      if (name === "sign") step(`Signing with ${shortKey(detail ?? "")}`);
      if (name === "send") step(`Sending to ${new URL(baseUrl).host}…`);
    },
  });

  if (dryRun) {
    console.log(`\n  ${styleText(["yellow", "bold"], "Dry run:")} signed and not sent. The signed payload was:`);
    for (const line of sanitize(sent.payload).split("\n")) console.log(`  ${dim(glyphs.quote)} ${line}`);
    return `${glyphs.ok} Dry run signed, nothing sent.`;
  }

  return `${glyphs.ok} ${sent.response ?? "Sent."}`;
}

function requireTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new NullboxError("nullbox needs an interactive terminal, so you can check every reply before it goes.");
  }
}

/**
 * The inbox loop: the list, then the composer for whatever you pick, then the list again with how it went. What you
 * reply to, open or mark done is remembered, so it doesn't come back.
 */
async function inboxLoop(argv: string[]): Promise<void> {
  const baseUrl = devnullUrl();
  const args = parseInboxArgs(argv);
  requireTerminal();

  const config = await loadConfig();
  if (args.user && args.user !== config.username) await saveConfig({ ...config, username: args.user });
  const username = args.user ?? config.username ?? (await askUsername());
  if (!username) return;
  if (!config.username && !args.user) await saveConfig({ ...config, username });

  const state = await loadState();
  const markHandled = async (item: { id: string; reason: string; replies: number }) => {
    if (item.reason === "replies") state.seenReplies[item.id] = item.replies;
    else state.done[item.id] = new Date().toISOString();
    await saveState(state);
  };

  let flash: string | undefined;
  for (;;) {
    console.log();
    const action = await inbox({
      username,
      flash,
      load: () => fetchInbox(baseUrl, username, state),
      onOpen: (item) => {
        if (item.reason === "replies") void markHandled(item);
        return openInBrowser(item.url, baseUrl);
      },
      onDismiss: (item) => void markHandled(item),
    });
    flash = undefined;
    if (action.kind === "quit") return;

    const { item } = action;
    console.log();
    const result = await compose({
      replyTo: item.url,
      parent: { username: item.author, shortHash: item.shortHash, body: item.body },
      initial: "",
      dryRun: args.dryRun,
    });
    if (result.kind === "cancel") continue;

    try {
      flash = await send(baseUrl, item.url, result.text, args.dryRun);
      if (!args.dryRun) await markHandled(item);
    } catch (error) {
      if (!(error instanceof NullboxError)) throw error;
      flash = `${glyphs.fail} ${sanitize(error.message)}`;
    }
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "reply":
        await reply(rest);
        return typeof process.exitCode === "number" ? process.exitCode : 0;
      case "-v":
      case "--version":
        console.log(version);
        return 0;
      case undefined:
      case "inbox":
        await inboxLoop(rest);
        return 0;
      case "-h":
      case "--help":
      case "help":
        process.stdout.write(HELP);
        return 0;
      default:
        if (command.startsWith("--")) {
          await inboxLoop(argv);
          return 0;
        }
        throw new NullboxError(`Unknown command ${command}. Run nullbox --help.`);
    }
  } catch (error) {
    if (error instanceof NullboxError) {
      console.error(`\n  ${styleText("red", glyphs.fail)} ${sanitize(error.message)}`);
      return 1;
    }
    throw error;
  }
}

process.exitCode = await main(process.argv.slice(2));
