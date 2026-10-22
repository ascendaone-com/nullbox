import { NullboxError, sanitize } from "./errors.js";

export interface Response {
  status: number;
  body: string;
}

/**
 * Sends a request to /dev/null and fails with its answer (always plain text for the CLI endpoints) unless it
 * succeeded. Redirects are never followed, so a request can't be bounced somewhere else.
 */
export async function request(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const origin = new URL(url).origin;

  let response: globalThis.Response;
  try {
    response = await fetch(url, { ...rest, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new NullboxError(`Could not reach ${origin}.`);
  }

  const body = sanitize(await response.text()).trim();

  if (response.status < 200 || response.status > 299) {
    throw new NullboxError(body !== "" ? body : `Unexpected answer from ${origin} (HTTP ${response.status}).`);
  }

  return { status: response.status, body };
}
