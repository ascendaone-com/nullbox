#!/usr/bin/env node
import { createRequire } from "node:module";
import { parseReplyArgs } from "./args.js";
import { commit, commitIdFromLink, validateMessage } from "./commit.js";
import { devnullUrl } from "./config.js";
import { Cancelled, NullboxError, sanitize } from "./errors.js";
import { request } from "./http.js";
import { ask, closePrompt, editInEditor } from "./prompt.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const HELP = `nullbox ${version} — your /dev/null inbox, in the terminal

Usage:
  nullbox reply <hash|link> [message]   Reply to a commit on /dev/null
  nullbox --version

Options for reply:
  --dry-run   Find your key and sign the reply, but don't send it
  --          End options, for a message that starts with --

Your reply is signed with the SSH key on your GitHub account, the same way
https://dev-null.sh/commit does it. To find that key, nullbox sends your
*public* keys to /dev/null. Private keys never leave ssh-keygen or your agent.

Nothing is sent until you press enter on the preview.

The inbox (nullbox with no arguments) lands in 0.2.
`;

/** "Replying to @someone: …" when the reply target is a link the public API can show. Best effort only. */
async function showParent(baseUrl: string, replyTo: string): Promise<void> {
  const id = commitIdFromLink(replyTo);
  if (id === undefined) {
    console.log(`\n  Replying to ${replyTo}`);
    return;
  }

  try {
    const { body } = await request(`${baseUrl}/api/v1/commits/${id}`, { headers: { Accept: "application/json" }, timeoutMs: 10_000 });
    const json = JSON.parse(body) as { data?: ParentCommit } & ParentCommit;
    const parent = json.data ?? json;
    console.log(`\n  Replying to @${sanitize(parent.author?.username ?? "?")} · ${sanitize(parent.short_hash ?? "")}`);
    console.log(indent(`"${sanitize(parent.body ?? "").trim()}"`, "  "));
  } catch {
    console.log(`\n  Replying to ${replyTo}`);
  }
}

interface ParentCommit {
  short_hash?: string;
  body?: string;
  author?: { username?: string };
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

async function reply(argv: string[]): Promise<void> {
  const baseUrl = devnullUrl();
  const args = parseReplyArgs(argv);

  if (!process.stdin.isTTY) {
    throw new NullboxError("nullbox only sends from an interactive terminal, so you can check the reply before it goes.");
  }

  await showParent(baseUrl, args.replyTo);

  let message = args.message;
  if (message.trim() === "") {
    message = await ask("\n  Your reply (leave empty to open your editor): ");
    if (message.trim() === "") message = await editInEditor("");
  }

  for (;;) {
    validateMessage(message);
    console.log(`\n  Your reply:\n${indent(message, "  │ ")}\n`);

    const choice = (await ask(`  [enter] ${args.dryRun ? "sign (dry run)" : "send"}   [e] edit   [c] cancel  `)).trim().toLowerCase();
    if (choice === "") break;
    if (choice === "e") {
      message = await editInEditor(message);
      continue;
    }
    throw new Cancelled();
  }

  const result = await commit({ baseUrl, replyTo: args.replyTo, message, dryRun: args.dryRun });

  if (args.dryRun) {
    console.log(`\n  Dry run: signed with ${result.key.slice(0, 40)}… and not sent.`);
    console.log(`  Signed payload:\n${indent(sanitize(result.payload), "  │ ")}`);
    return;
  }

  console.log(`\n  ${result.response ?? "Sent."}`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "reply":
        await reply(rest);
        return 0;
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
    if (error instanceof Cancelled) {
      console.error("  Cancelled. Nothing was sent.");
      return 130;
    }
    if (error instanceof NullboxError) {
      console.error(`nullbox: ${sanitize(error.message)}`);
      return 1;
    }
    throw error;
  } finally {
    closePrompt();
  }
}

process.exitCode = await main(process.argv.slice(2));
