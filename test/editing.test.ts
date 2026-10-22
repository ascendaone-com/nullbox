import { describe, expect, it } from "vitest";
import * as edit from "../src/ui/editing.js";
import type { EditState } from "../src/ui/editing.js";

/** "ab|c" means value "abc" with the cursor before "c". */
function s(marked: string): EditState {
  const cursor = marked.indexOf("|");
  return { value: marked.replace("|", ""), cursor };
}

function show({ value, cursor }: EditState): string {
  return value.slice(0, cursor) + "|" + value.slice(cursor);
}

describe("editing", () => {
  it("inserts at the cursor and cleans pasted text", () => {
    expect(show(edit.insert(s("a|c"), "b"))).toBe("ab|c");
    expect(show(edit.insert(s("|"), "one\r\ntwo\rthree\tx\u001b[31m"))).toBe("one\ntwo\nthree  x[31m|");
  });

  it("deletes backwards and forwards", () => {
    expect(show(edit.backspace(s("ab|c")))).toBe("a|c");
    expect(show(edit.backspace(s("|abc")))).toBe("|abc");
    expect(show(edit.deleteForward(s("a|bc")))).toBe("a|c");
  });

  it("moves within lines and between them, keeping the column", () => {
    expect(show(edit.home(s("one\ntw|o")))).toBe("one\n|two");
    expect(show(edit.end(s("o|ne\ntwo")))).toBe("one|\ntwo");
    expect(show(edit.vertical(s("one\ntw|o"), -1))).toBe("on|e\ntwo");
    expect(show(edit.vertical(s("longer|\nab"), 1))).toBe("longer\nab|");
    expect(show(edit.vertical(s("a|b\ncd"), -1))).toBe("a|b\ncd");
    expect(show(edit.vertical(s("ab\nc|d"), 1))).toBe("ab\nc|d");
  });

  it("kills to line start, line end, and the previous word", () => {
    expect(show(edit.killToLineStart(s("one\ntw|o")))).toBe("one\n|o");
    expect(show(edit.killToLineEnd(s("o|ne\ntwo")))).toBe("o|\ntwo");
    expect(show(edit.killWord(s("hello big |world")))).toBe("hello |world");
  });

  it("turns backslash + enter into a new line, and only sends non-empty text", () => {
    expect(edit.enter(s("line one\\|"))).toEqual({ state: s("line one\n|"), submit: false });
    expect(edit.enter(s("done|")).submit).toBe(true);
    expect(edit.enter(s("  |")).submit).toBe(false);
  });
});
