import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * nullbox's own files: who you are on /dev/null, and which items you've dealt with. They hold usernames, commit IDs,
 * counts and timestamps, never what anyone wrote.
 */
export interface Config {
  username?: string;
}

export interface State {
  /** How many replies a commit of yours had when you last looked, so only new ones bring it back. */
  seenReplies: Record<string, number>;
  /** Commits you replied to or dismissed, and when. */
  done: Record<string, string>;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "nullbox");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return { ...fallback, ...(JSON.parse(await readFile(path, "utf8")) as T) };
  } catch {
    return fallback;
  }
}

/** Written to a temporary file and renamed, so a crash never leaves half a file. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, path);
}

export const loadConfig = (dir = configDir()) => readJson<Config>(join(dir, "config.json"), {});
export const saveConfig = (config: Config, dir = configDir()) => writeJson(join(dir, "config.json"), config);

export const loadState = (dir = configDir()) => readJson<State>(join(dir, "state.json"), { seenReplies: {}, done: {} });
export const saveState = (state: State, dir = configDir()) => writeJson(join(dir, "state.json"), state);
