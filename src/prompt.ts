import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cancelled, NullboxError } from "./errors.js";

const EDITOR_HINT = "\n# Write your reply above. Lines starting with # are ignored.\n# Save an empty reply to cancel.\n";

function hasCommand(command: string): boolean {
  return spawnSync("sh", ["-c", 'command -v "$1"', "sh", command], { stdio: "ignore" }).status === 0;
}

/** $VISUAL, then $EDITOR, then nano when it is installed, and vi only as the last resort. */
export function editorCommand(env: NodeJS.ProcessEnv = process.env, exists = hasCommand): string {
  return env.VISUAL || env.EDITOR || (exists("nano") ? "nano" : "vi");
}

/** Opens the editor on the given text and returns what was saved, without the comment lines. */
export async function editInEditor(initial: string): Promise<string> {
  const editor = editorCommand();
  const [command = "vi", ...args] = editor.split(/\s+/).filter(Boolean);

  const dir = await mkdtemp(join(tmpdir(), "nullbox-"));
  const file = join(dir, "REPLY.md");

  try {
    await writeFile(file, initial + EDITOR_HINT, { mode: 0o600 });

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
