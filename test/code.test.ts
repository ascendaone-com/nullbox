import { describe, expect, it } from "vitest";
import { analyze, type Style } from "../src/code.js";

/** The text of every run of characters with the given style. */
function runs(text: string, styles: Style[], match: (style: Style) => boolean): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    if (match(styles[i] as Style)) current += text[i];
    else if (current !== "") {
      out.push(current);
      current = "";
    }
  }
  if (current !== "") out.push(current);
  return out;
}

describe("analyze", () => {
  it("finds a fenced block with its language, and highlights it", () => {
    const text = "Try this:\n```ts\nconst x = 1;\n```\nthanks";
    const { styles, blocks } = analyze(text);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ language: "ts", closed: true });
    expect(text.slice(blocks[0]!.codeStart, blocks[0]!.codeEnd)).toBe("const x = 1;");
    expect(runs(text, styles, (s) => s === "mark")).toEqual(["```ts\n", "\n```"]);
    expect(runs(text, styles, (s) => s === "tok:keyword")).toEqual(["const"]);
    expect(runs(text, styles, (s) => s === "tok:number")).toEqual(["1"]);
    expect(runs(text, styles, (s) => s === "text").join("")).toBe("Try this:\n\nthanks");
  });

  it("keeps an unknown or missing language as plain code", () => {
    const text = "```\nplain\n```";
    const { styles, blocks } = analyze(text);
    expect(blocks[0]?.language).toBeUndefined();
    expect(runs(text, styles, (s) => s === "code")).toEqual(["plain"]);
    expect(analyze("```nope\nx\n```").blocks[0]?.language).toBe("nope");
  });

  it("marks inline code and its backticks, and @mentions in prose only", () => {
    const text = "ask @nunomaduro about `npm i` — not me@example.com";
    const { styles } = analyze(text);
    expect(runs(text, styles, (s) => s === "inline")).toEqual(["npm i"]);
    expect(runs(text, styles, (s) => s === "mention")).toEqual(["@nunomaduro"]);
  });

  it("only treats a fence at the start of a line as one, like /dev/null", () => {
    expect(analyze("not ```js\nx\n``` a block").blocks).toEqual([]);
  });

  it("colours a block you haven't closed yet only while typing", () => {
    const text = "here:\n```go\nfunc main() {";
    expect(analyze(text).blocks).toEqual([]);
    const live = analyze(text, { live: true });
    expect(live.blocks[0]).toMatchObject({ language: "go", closed: false });
    expect(runs(text, live.styles, (s) => s === "tok:keyword")).toEqual(["func"]);
  });

  it("keeps blank lines and tabs inside code", () => {
    const text = "```go\nfunc a() {\n\n\treturn\n}\n```";
    const { blocks } = analyze(text);
    expect(text.slice(blocks[0]!.codeStart, blocks[0]!.codeEnd)).toBe("func a() {\n\n\treturn\n}");
  });
});
