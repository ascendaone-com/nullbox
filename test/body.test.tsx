import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { Body, layout } from "../src/ui/Body.js";

const text = (body: string, width: number, maxLines?: number) =>
  (render(<Body text={body} width={width} maxLines={maxLines} />).lastFrame() ?? "").split("\n").map((line) => line.trimEnd());

describe("Body", () => {
  it("frames a code block with its language, between wrapped prose", () => {
    expect(text("Here is how I do it in a few lines:\n\n```ts\nconst x = 1;\n```\n\nThoughts?", 24)).toEqual([
      "Here is how I do it in a",
      "few lines:",
      "┌─ ts",
      "│ const x = 1;",
      "└─",
      "Thoughts?",
    ]);
  });

  it("cuts long code lines instead of wrapping them, and keeps indentation", () => {
    expect(text("```go\nfunc main() {\n\tfmt.Println(\"a very long line of code\")\n}\n```", 24)).toEqual([
      "┌─ go",
      "│ func main() {",
      '│   fmt.Println("a very…',
      "│ }",
      "└─",
    ]);
  });

  it("stops at maxLines with a …", () => {
    expect(text("one\ntwo\nthree\nfour", 20, 2)).toEqual(["one", "two …"]);
  });

  it("collapses runs of blank lines in prose", () => {
    expect(layout("a\n\n\n\nb", 20).lines.filter((line) => line.kind === "prose")).toHaveLength(3);
  });
});
