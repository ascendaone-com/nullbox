#!/usr/bin/env node
import { createRequire } from "node:module";
import { styleText } from "node:util";
import { parseReplyArgs } from "./args.js";
import { commit, commitIdFromLink } from "./commit.js";
import { devnullUrl } from "./config.js";
import { NullboxError, sanitize } from "./errors.js";
import { request } from "./http.js";
import { compose, type Parent } from "./ui/compose.js";
import { glyphs } from "./ui/theme.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `nullbox ${version} — your /dev/null inbox, in the terminal

Usage:
  nullbox reply <hash|link> [message]   Reply to a commit on /dev/null
  nullbox --version

Options for reply:
  --dry-run   Find your key and sign the reply, but don't send it
  --          End options, for a message that starts with --

Writing a reply:
  enter         send
  \\ + enter     new line (option+enter and ctrl+j work too)
  esc           cancel (twice if you've typed something)

Your reply is signed with the SSH key on your GitHub account, the same way
https://dev-null.sh/commit does it. To find that key, nullbox sends your
*public* keys to /dev/null. Private keys never leave ssh-keygen or your agent.

The inbox (nullbox with no arguments) lands in 0.2.
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

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new NullboxError("nullbox only sends from an interactive terminal, so you can check the reply before it goes.");
  }

  const parent = await fetchParent(baseUrl, args.replyTo);
  console.log();
  const result = await compose({ replyTo: args.replyTo, parent, initial: args.message, dryRun: args.dryRun });

  if (result.kind === "cancel") {
    console.log(`\n  ${dim("Cancelled. Nothing was sent.")}`);
    process.exitCode = 130;
    return;
  }

  console.log();
  const sent = await commit({
    baseUrl,
    replyTo: args.replyTo,
    message: result.text,
    dryRun: args.dryRun,
    onStep: (name, detail) => {
      if (name === "lookup") step("Finding your GitHub SSH key…");
      if (name === "sign") step(`Signing with ${shortKey(detail ?? "")}`);
      if (name === "send") step(`Sending to ${new URL(baseUrl).host}…`);
    },
  });

  if (args.dryRun) {
    console.log(`\n  ${styleText(["yellow", "bold"], "Dry run:")} signed and not sent. The signed payload was:`);
    for (const line of sanitize(sent.payload).split("\n")) console.log(`  ${dim(glyphs.quote)} ${line}`);
    return;
  }

  console.log(`\n  ${styleText("green", glyphs.ok)} ${sent.response ?? "Sent."}`);
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
      case "-h":
      case "--help":
      case "help":
        process.stdout.write(HELP);
        return 0;
      default:
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
