import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commit, NAMESPACE } from "../src/commit.js";
import { HttpError } from "../src/errors.js";
import { candidateKeys, keyId, sign } from "../src/ssh.js";

/** A throwaway ~/.ssh with one Ed25519 key, and a fake /dev/null that verifies signatures like the real one. */
let dir: string;
let sshDir: string;
let publicKey: string;
let server: Server;
let baseUrl: string;
const received: Array<{ payload: string; verified: boolean }> = [];

function armor(signature: string): string {
  return `-----BEGIN SSH SIGNATURE-----\n${signature.match(/.{1,70}/g)?.join("\n")}\n-----END SSH SIGNATURE-----\n`;
}

/** What /dev/null does with the signature: ssh-keygen -Y verify against the user's known key, in our namespace. */
function verify(payload: string, signature: string, namespace = NAMESPACE): boolean {
  const signers = join(dir, "allowed_signers");
  const sig = join(dir, "check.sig");
  writeFileSync(signers, `test@nullbox ${publicKey}\n`);
  writeFileSync(sig, armor(signature));
  const result = spawnSync("ssh-keygen", ["-Y", "verify", "-f", signers, "-I", "test@nullbox", "-n", namespace, "-s", sig], {
    input: payload,
  });
  return result.status === 0;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "nullbox-test-"));
  sshDir = join(dir, "ssh");
  execFileSync("mkdir", ["-p", sshDir]);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "test@nullbox", "-f", join(sshDir, "id_ed25519")]);
  publicKey = keyId(readFileSync(join(sshDir, "id_ed25519.pub"), "utf8"));

  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      if (req.url === "/api/cli/key-lookups") {
        const known = body.split("\n").find((line) => line === publicKey);
        res.writeHead(known ? 200 : 404, { "Content-Type": "text/plain" }).end(known ? known + "\n" : "None of your keys is on GitHub.\n");
        return;
      }
      if (req.url === "/api/cli/commits") {
        const verified = verify(body, String(req.headers["x-ssh-signature"] ?? ""));
        received.push({ payload: body, verified });
        if (!verified) return void res.writeHead(401).end("Invalid signature.\n");
        res.writeHead(201, { "Content-Type": "text/plain" }).end("Committed: https://dev-null.sh/@test/commits/abc\u001b[31m\n");
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("ssh", () => {
  it("finds key pairs in the ssh directory", async () => {
    expect(await candidateKeys({ sshDir, useAgent: false })).toEqual([publicKey]);
  });

  it("signs in the devnull-commit namespace only", async () => {
    const signature = await sign("hello", NAMESPACE, publicKey, { sshDir, useAgent: false });
    expect(verify("hello", signature)).toBe(true);
    expect(verify("hello", signature, "git")).toBe(false);
    expect(verify("tampered", signature)).toBe(false);
  });
});

describe("commit", () => {
  it("sends a reply /dev/null can verify", async () => {
    const result = await commit({ baseUrl, sshDir, useAgent: false, replyTo: "0be0130", message: "Agreed!\nSecond line." });

    expect(result.response).toBe("Committed: https://dev-null.sh/@test/commits/abc[31m");
    const last = received.at(-1);
    expect(last?.verified).toBe(true);
    expect(last?.payload.split("\n").slice(2)).toEqual(["0be0130", "Agreed!", "Second line."]);
  });

  it("signs but sends nothing on a dry run", async () => {
    const before = received.length;
    const result = await commit({ baseUrl, sshDir, useAgent: false, replyTo: "0be0130", message: "hi", dryRun: true });

    expect(received.length).toBe(before);
    expect(result.response).toBeUndefined();
    expect(verify(result.payload, result.signature)).toBe(true);
  });

  it("fails with /dev/null's own words when no key is on GitHub", async () => {
    const otherDir = join(dir, "other");
    execFileSync("mkdir", ["-p", otherDir]);
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(otherDir, "id_ed25519")]);

    const failure = commit({ baseUrl, sshDir: otherDir, useAgent: false, replyTo: "0be0130", message: "hi" });
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await expect(failure).rejects.toMatchObject({ status: 404, message: "None of your keys is on GitHub." });
  });
});
