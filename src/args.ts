import { validateReplyTo } from "./commit.js";
import { NullboxError } from "./errors.js";

export interface ReplyArgs {
  replyTo: string;
  message: string;
  dryRun: boolean;
}

export function parseReplyArgs(argv: string[]): ReplyArgs {
  let dryRun = false;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--") && rest.length === 0) throw new NullboxError(`Unknown option ${arg}.`);
    else rest.push(arg);
  }

  const [replyTo, ...words] = rest;
  if (replyTo === undefined) throw new NullboxError("Usage: nullbox reply <hash|link> [message]");

  return { replyTo: validateReplyTo(replyTo), message: words.join(" "), dryRun };
}
