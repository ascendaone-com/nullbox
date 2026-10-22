import { NullboxError } from "./errors.js";

export const DEFAULT_URL = "https://dev-null.sh";

/**
 * The /dev/null to talk to: https only, or plain http to this machine for local development, the same rule the
 * official commit script enforces. DEVNULL_URL overrides it.
 */
export function devnullUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.DEVNULL_URL ?? DEFAULT_URL).replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NullboxError(`Refusing to send anything to ${raw}: it is not a URL.`);
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
    return raw;
  }

  throw new NullboxError(`Refusing to send anything to ${raw}: it is not an https:// URL.`);
}
