import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { editorCommand } from "../src/prompt.js";
import { Composer, type ComposeResult } from "../src/ui/Composer.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

async function type(stdin: { write: (data: string) => void }, ...chunks: string[]) {
  for (const chunk of chunks) {
    stdin.write(chunk);
    await tick();
  }
}

function setup(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const results: ComposeResult[] = [];
  const app = render(
    <Composer
      replyTo="0be0130"
      parent={{ username: "engineer42", shortHash: "0be0130", body: "Reviewing AI code takes longer." }}
      initial=""
      dryRun={false}
      onDone={(result) => results.push(result)}
      {...props}
    />,
  );
  return { ...app, results };
}

describe("Composer", () => {
  it("shows who you're replying to, what they said, and the keys", async () => {
    const { lastFrame } = setup();
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("replying to @engineer42");
    expect(frame).toContain("Reviewing AI code takes longer.");
    expect(frame).toContain("Write your reply…");
    expect(frame).toContain("enter send");
  });

  it("sends what you typed on enter", async () => {
    const { stdin, results } = setup();
    await tick();
    await type(stdin, "Agreed", "!", "\r");
    expect(results).toEqual([{ kind: "send", text: "Agreed!" }]);
  });

  it("turns backslash + enter and option + enter into new lines", async () => {
    const { stdin, results, lastFrame } = setup();
    await tick();
    await type(stdin, "one", "\\", "\r", "two", "\u001b\r", "three");
    expect(results).toEqual([]);
    expect(lastFrame()).toContain("two");
    await type(stdin, "\r");
    expect(results).toEqual([{ kind: "send", text: "one\ntwo\nthree" }]);
  });

  it("doesn't send an empty reply", async () => {
    const { stdin, results } = setup();
    await tick();
    await type(stdin, "\r");
    expect(results).toEqual([]);
  });

  it("starts from the message given on the command line, and edits it", async () => {
    const { stdin, results } = setup({ initial: "Hello" });
    await tick();
    await type(stdin, "\u007f", "\u007f", "p!", "\r");
    expect(results).toEqual([{ kind: "send", text: "Help!" }]);
  });

  it("asks before discarding a typed reply, and cancels on a second esc", async () => {
    const { stdin, results, lastFrame } = setup({ initial: "draft" });
    await tick();
    await type(stdin, "\u001b");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(lastFrame()).toContain("Press esc again");
    expect(results).toEqual([]);
    await type(stdin, "\u001b");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(results).toEqual([{ kind: "cancel" }]);
  });

  it("cancels at once when nothing is typed", async () => {
    const { stdin, results } = setup();
    await tick();
    await type(stdin, "\u0003");
    expect(results).toEqual([{ kind: "cancel" }]);
  });

  it("marks a dry run", async () => {
    const { lastFrame } = setup({ dryRun: true });
    await tick();
    expect(lastFrame()).toContain("DRY RUN");
    expect(lastFrame()).toContain("enter sign (dry run)");
  });
});

describe("editorCommand", () => {
  it("prefers $VISUAL, then $EDITOR, then nano, then vi", () => {
    expect(editorCommand({ VISUAL: "code -w", EDITOR: "vim" }, () => true)).toBe("code -w");
    expect(editorCommand({ EDITOR: "vim" }, () => true)).toBe("vim");
    expect(editorCommand({}, () => true)).toBe("nano");
    expect(editorCommand({}, () => false)).toBe("vi");
  });
});
