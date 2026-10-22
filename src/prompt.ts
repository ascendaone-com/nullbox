import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { Cancelled, NullboxError } from "./errors.js";

/**
 * One readline for the whole session, so input typed or pasted ahead of a prompt isn't lost between questions. It is
 * closed while an editor has the terminal, and by closePrompt() at the end.
 */
let rl: Interface | undefined;
let controller = new AbortController();

function prompt(): Interface {
  if (rl === undefined) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on("SIGINT", () => controller.abort());
    rl.on("close", () => controller.abort());
  }
  return rl;
}

export function closePrompt(): void {
  const current = rl;
  rl = undefined;
  current?.removeAllListeners("close");
  current?.close();
}

/** One line from the terminal. Ctrl-C or Ctrl-D cancels. */
export async function ask(question: string): Promise<string> {
  controller = new AbortController();
  try {
    return await prompt().question(question, { signal: controller.signal });
  } catch {
    process.stdout.write("\n");
    throw new Cancelled();
  }
}

const EDITOR_HINT = "\n# Write your reply above. Lines starting with # are ignored.\n# Save an empty reply to cancel.\n";

/** Opens $VISUAL or $EDITOR on the given text and returns what was saved, without the comment lines. */
export async function editInEditor(initial: string): Promise<string> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  const [command = "vi", ...args] = editor.split(/\s+/).filter(Boolean);

  const dir = await mkdtemp(join(tmpdir(), "nullbox-"));
  const file = join(dir, "REPLY.md");

  try {
    await writeFile(file, initial + EDITOR_HINT, { mode: 0o600 });

    closePrompt();
    const result = spawnSync(command, [...args, file], { stdio: "inherit" });
    if (result.error) throw new NullboxError(`Could not open ${editor}. Set $EDITOR to your editor.`);
    if (result.status !== 0) throw new Cancelled();

    const text = (await readFile(file, "utf8"))
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
      .trim();

    if (text === "") throw new Cancelled();
    return text;
  } finally {
    await rm(file, { force: true });
    await rmdir(dir).catch(() => {});
  }
}
