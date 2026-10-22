/** An error whose message is safe and meant to be shown to the user as is. */
export class NullboxError extends Error {
  override name = "NullboxError";
}

/** The user backed out. Nothing was sent. */
export class Cancelled extends Error {
  override name = "Cancelled";
}

/**
 * Removes control characters (such as terminal escape sequences) from text we print, keeping tabs and newlines, as
 * the official commit script does. Anything the server or a commit body says goes through this first.
 */
export function sanitize(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}
