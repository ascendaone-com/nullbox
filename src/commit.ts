import { randomBytes } from "node:crypto";
import { NullboxError } from "./errors.js";
import { request } from "./http.js";
import { candidateKeys, lookupKey, sign, type KeyOptions } from "./ssh.js";

export const NAMESPACE = "devnull-commit";

/** A commit hash (as shown on /dev/null) or a commit link. It goes on its own line of the signed payload. */
export function validateReplyTo(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed === "" || !/^[A-Za-z0-9:/._@-]+$/.test(trimmed)) {
    throw new NullboxError("Reply to a commit hash (like 0be0130) or a commit link.");
  }
  return trimmed;
}

export function validateMessage(message: string): string {
  if (message.trim() === "") throw new NullboxError("Nothing to send: the reply is empty.");
  return message;
}

/** "<unix timestamp>\n<nonce>\n<commit to reply to, or empty>\n<body>", the format /dev/null verifies. */
export function buildPayload({ timestamp, nonce, replyTo, message }: { timestamp: number; nonce: string; replyTo: string; message: string }): string {
  return `${timestamp}\n${nonce}\n${replyTo}\n${message}`;
}

/** The commit ID inside a commit link, which the public API can show. A bare hash has none. */
export function commitIdFromLink(ref: string): string | undefined {
  return /\/commits\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(ref)?.[1];
}

export interface CommitOptions extends KeyOptions {
  baseUrl: string;
  replyTo: string;
  message: string;
  /** Find the key and sign, but don't send. */
  dryRun?: boolean;
  /** Called as each step starts, so the UI can say what is happening (and why a passphrase prompt appears). */
  onStep?: (step: "lookup" | "sign" | "send", detail?: string) => void;
}

export interface CommitResult {
  key: string;
  payload: string;
  signature: string;
  /** What /dev/null answered, such as "Committed: <link>". Absent on a dry run. */
  response?: string;
}

export async function commit({ baseUrl, replyTo, message, dryRun = false, onStep, ...keyOptions }: CommitOptions): Promise<CommitResult> {
  onStep?.("lookup");
  const candidates = await candidateKeys(keyOptions);
  if (candidates.length === 0) throw new NullboxError("No Ed25519 or RSA SSH key found in your SSH agent or in ~/.ssh.");

  const key = await lookupKey(baseUrl, candidates);

  const payload = buildPayload({
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString("hex"),
    replyTo: validateReplyTo(replyTo),
    message: validateMessage(message),
  });
  onStep?.("sign", key);
  const signature = await sign(payload, NAMESPACE, key, keyOptions);

  if (dryRun) return { key, payload, signature };

  onStep?.("send");
  const { body } = await request(`${baseUrl}/api/cli/commits`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-SSH-Signature": signature },
    body: payload,
  });

  return { key, payload, signature, response: body };
}
