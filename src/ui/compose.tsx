import { render } from "ink";
import { Composer, type ComposeResult, type Parent } from "./Composer.js";

export type { ComposeResult, Parent };

/** Shows the composer until the reply is sent or cancelled. Ink owns the terminal until then, and gives it back after. */
export async function compose(props: { replyTo: string; parent?: Parent; initial: string; dryRun: boolean }): Promise<ComposeResult> {
  let result: ComposeResult = { kind: "cancel" };

  const app = render(<Composer {...props} onDone={(done) => (result = done)} />, { exitOnCtrlC: false });
  await app.waitUntilExit();

  return result;
}
