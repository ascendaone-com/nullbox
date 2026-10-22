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

export function parseInboxArgs(argv: string[]): { user?: string; dryRun: boolean } {
  let user: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--user") {
      user = argv[++i]?.replace(/^@/, "");
      if (!user || !/^[A-Za-z0-9-]+$/.test(user)) throw new NullboxError("Usage: nullbox --user <your /dev/null username>");
    } else throw new NullboxError(`Unknown option ${arg}. Run nullbox --help.`);
  }
  return { user, dryRun };
}
