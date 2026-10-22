import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NullboxError, sanitize } from "./errors.js";
import { request } from "./http.js";

const run = promisify(execFile);

const KEY_TYPES = /^(ssh-ed25519|ssh-rsa) /;

export interface KeyOptions {
  /** Where to look for key pairs. Defaults to ~/.ssh. */
  sshDir?: string;
  /** Whether to ask the SSH agent for its keys. Defaults to true. */
  useAgent?: boolean;
}

/** "<type> <base64>", without the comment. */
export function keyId(line: string): string {
  const [type = "", base64 = ""] = line.trim().split(/\s+/);
  return `${type} ${base64}`;
}

export async function agentKeys(): Promise<string[]> {
  try {
    const { stdout } = await run("ssh-add", ["-L"]);
    return stdout.split("\n").filter((line) => KEY_TYPES.test(line)).map(keyId);
  } catch {
    return [];
  }
}

/** Public keys in sshDir that have their private key next to them, as [publicKeyId, privateKeyPath]. */
async function fileKeys(sshDir: string): Promise<Array<[string, string]>> {
  let names: string[];
  try {
    names = await readdir(sshDir);
  } catch {
    return [];
  }

  const keys: Array<[string, string]> = [];
  for (const name of names.filter((name) => name.endsWith(".pub")).sort()) {
    const privatePath = join(sshDir, name.slice(0, -4));
    if (!existsSync(privatePath)) continue;

    const line = (await readFile(join(sshDir, name), "utf8")).split("\n")[0] ?? "";
    if (KEY_TYPES.test(line)) keys.push([keyId(line), privatePath]);
  }
  return keys;
}

/** Every Ed25519 or RSA public key we could sign with: the agent's first, then ~/.ssh's. */
export async function candidateKeys({ sshDir = join(homedir(), ".ssh"), useAgent = true }: KeyOptions = {}): Promise<string[]> {
  const keys = [...(useAgent ? await agentKeys() : []), ...(await fileKeys(sshDir)).map(([id]) => id)];
  return [...new Set(keys)];
}

/**
 * Asks /dev/null which of our public keys is on the GitHub account of one of its users. Only public keys are sent,
 * and GitHub publishes those anyway. Whatever /dev/null answers, we only ever sign with one of our own keys.
 */
export async function lookupKey(baseUrl: string, candidates: string[]): Promise<string> {
  const { body } = await request(`${baseUrl}/api/cli/key-lookups`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: candidates.join("\n") + "\n",
  });

  const key = keyId(body.split("\n")[0] ?? "");
  if (!candidates.includes(key)) {
    throw new NullboxError(`Unexpected answer from ${new URL(baseUrl).origin}.`);
  }
  return key;
}

/**
 * Signs a payload with `ssh-keygen -Y sign` under a /dev/null namespace, so the signature can't be used for git
 * commits or to log in anywhere. The agent signs when it holds the key; otherwise ssh-keygen uses the private key file
 * and asks for its passphrase on the terminal. We never read the private key ourselves.
 *
 * Everything happens in a fresh private temporary directory, whose files are deleted one by one, by name.
 */
export async function sign(payload: string, namespace: string, key: string, options: KeyOptions = {}): Promise<string> {
  const { sshDir = join(homedir(), ".ssh"), useAgent = true } = options;

  const dir = await mkdtemp(join(tmpdir(), "nullbox-"));
  const files = ["payload", "payload.sig", "key.pub"].map((name) => join(dir, name));
  const [payloadPath = "", sigPath = "", agentKeyPath = ""] = files;

  try {
    let signingKey: string | undefined;
    if (useAgent && (await agentKeys()).includes(key)) {
      await writeFile(agentKeyPath, key + "\n", { mode: 0o600 });
      signingKey = agentKeyPath;
    } else {
      signingKey = (await fileKeys(sshDir)).find(([id]) => id === key)?.[1];
    }
    if (signingKey === undefined) throw new NullboxError(`Could not find the private key of ${key}.`);

    await writeFile(payloadPath, payload, { mode: 0o600 });

    // stdin is closed so ssh-keygen asks for any passphrase on /dev/tty, which it does by itself.
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ssh-keygen", ["-Y", "sign", "-n", namespace, "-f", signingKey, payloadPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let output = "";
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.on("error", () => reject(new NullboxError("ssh-keygen is required.")));
      child.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new NullboxError(`${sanitize(output).trim()}\nCould not sign with ${signingKey}.`.trim()));
      });
    });

    const signature = (await readFile(sigPath, "utf8"))
      .split("\n")
      .filter((line) => !line.startsWith("-----"))
      .join("");

    if (!/^[A-Za-z0-9+/=]+$/.test(signature)) throw new NullboxError("ssh-keygen produced an unexpected signature.");
    return signature;
  } finally {
    for (const file of files) await rm(file, { force: true });
    await rmdir(dir).catch(() => {});
  }
}
