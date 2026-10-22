import { describe, expect, it } from "vitest";
import { parseReplyArgs } from "../src/args.js";
import { buildPayload, commitIdFromLink, validateMessage, validateReplyTo } from "../src/commit.js";
import { devnullUrl } from "../src/config.js";
import { NullboxError, sanitize } from "../src/errors.js";
import { keyId } from "../src/ssh.js";

describe("devnullUrl", () => {
  it("defaults to dev-null.sh", () => {
    expect(devnullUrl({})).toBe("https://dev-null.sh");
  });

  it("allows https and local http, without a trailing slash", () => {
    expect(devnullUrl({ DEVNULL_URL: "https://staging.example.com/" })).toBe("https://staging.example.com");
    expect(devnullUrl({ DEVNULL_URL: "http://127.0.0.1:8000" })).toBe("http://127.0.0.1:8000");
    expect(devnullUrl({ DEVNULL_URL: "http://localhost" })).toBe("http://localhost");
  });

  it("refuses plain http anywhere else", () => {
    expect(() => devnullUrl({ DEVNULL_URL: "http://dev-null.sh" })).toThrow(NullboxError);
    expect(() => devnullUrl({ DEVNULL_URL: "ftp://dev-null.sh" })).toThrow(NullboxError);
    expect(() => devnullUrl({ DEVNULL_URL: "not a url" })).toThrow(NullboxError);
  });
});

describe("validateReplyTo", () => {
  it("takes hashes and links", () => {
    expect(validateReplyTo(" 0be0130 ")).toBe("0be0130");
    const link = "https://dev-null.sh/@nunomaduro/commits/01a164a0-25fc-73e0-bc32-182aaf2c3ce7";
    expect(validateReplyTo(link)).toBe(link);
  });

  it("rejects anything that could break out of its payload line", () => {
    expect(() => validateReplyTo("0be0130\nforged body")).toThrow(NullboxError);
    expect(() => validateReplyTo("abc def")).toThrow(NullboxError);
    expect(() => validateReplyTo("")).toThrow(NullboxError);
  });
});

describe("validateMessage", () => {
  it("rejects empty and whitespace-only replies", () => {
    expect(() => validateMessage("")).toThrow(NullboxError);
    expect(() => validateMessage(" \n ")).toThrow(NullboxError);
    expect(validateMessage("Agreed!")).toBe("Agreed!");
  });
});

describe("buildPayload", () => {
  it("matches the format /dev/null verifies, with multi-line bodies intact", () => {
    expect(buildPayload({ timestamp: 1700000000, nonce: "ab", replyTo: "0be0130", message: "one\ntwo" })).toBe(
      "1700000000\nab\n0be0130\none\ntwo",
    );
  });
});

describe("commitIdFromLink", () => {
  it("finds the commit ID in a link, not in a bare hash", () => {
    expect(commitIdFromLink("https://dev-null.sh/@x/commits/01a164a0-25fc-73e0-bc32-182aaf2c3ce7")).toBe(
      "01a164a0-25fc-73e0-bc32-182aaf2c3ce7",
    );
    expect(commitIdFromLink("0be0130")).toBeUndefined();
  });
});

describe("parseReplyArgs", () => {
  it("reads the target, the message and --dry-run", () => {
    expect(parseReplyArgs(["0be0130", "Agreed", "fully"])).toEqual({ replyTo: "0be0130", message: "Agreed fully", dryRun: false });
    expect(parseReplyArgs(["--dry-run", "0be0130"])).toEqual({ replyTo: "0be0130", message: "", dryRun: true });
  });

  it("keeps a message that starts with -- after a --", () => {
    expect(parseReplyArgs(["0be0130", "--", "--dry-run", "is a flag"]).message).toBe("--dry-run is a flag");
  });

  it("rejects unknown options and a missing target", () => {
    expect(() => parseReplyArgs(["--yes", "0be0130"])).toThrow(NullboxError);
    expect(() => parseReplyArgs([])).toThrow(NullboxError);
  });
});

describe("sanitize", () => {
  it("strips terminal escapes but keeps newlines and tabs", () => {
    expect(sanitize("a\u001b[31mred\u0007\tb\nc\u007f")).toBe("a[31mred\tb\nc");
  });
});

describe("keyId", () => {
  it("drops the comment", () => {
    expect(keyId("ssh-ed25519 AAAAC3Nza me@laptop\n")).toBe("ssh-ed25519 AAAAC3Nza");
  });
});
