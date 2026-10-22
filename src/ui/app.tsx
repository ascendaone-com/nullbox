import { render } from "ink";
import type { ReactElement } from "react";
import { AskUsername } from "./AskUsername.js";
import { Composer, type ComposeResult, type Parent } from "./Composer.js";
import { Inbox, type InboxAction, type InboxProps } from "./Inbox.js";

export type { ComposeResult, InboxAction, Parent };

/**
 * Each screen is its own Ink app: it owns the terminal until it's done, then gives it back, so what follows (signing,
 * with a possible passphrase prompt) has the terminal to itself.
 */
async function run<T>(fallback: T, screen: (done: (result: T) => void) => ReactElement): Promise<T> {
  let result = fallback;
  const app = render(screen((done) => (result = done)), { exitOnCtrlC: false });
  await app.waitUntilExit();
  return result;
}

export function compose(props: { replyTo: string; parent?: Parent; initial: string; dryRun: boolean }): Promise<ComposeResult> {
  return run<ComposeResult>({ kind: "cancel" }, (onDone) => <Composer {...props} onDone={onDone} />);
}

export function inbox(props: Omit<InboxProps, "onDone">): Promise<InboxAction> {
  return run<InboxAction>({ kind: "quit" }, (onDone) => <Inbox {...props} onDone={onDone} />);
}

export function askUsername(): Promise<string | undefined> {
  return run<string | undefined>(undefined, (onDone) => <AskUsername onDone={onDone} />);
}
