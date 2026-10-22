/**
 * The text and cursor of a multi-line input, and the edits a key can make to it. Pure, so it can be tested without a
 * terminal; the TextArea component only maps keys to these.
 */
export interface EditState {
  value: string;
  /** An index into value, from 0 to value.length. */
  cursor: number;
}

export const empty = (value = ""): EditState => ({ value, cursor: value.length });

/** Pasted or typed text, with line endings made \n, tabs made spaces, and every other control character dropped. */
export function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}

export function insert(state: EditState, text: string): EditState {
  const cleaned = clean(text);
  if (cleaned === "") return state;
  const { value, cursor } = state;
  return { value: value.slice(0, cursor) + cleaned + value.slice(cursor), cursor: cursor + cleaned.length };
}

export function backspace({ value, cursor }: EditState): EditState {
  if (cursor === 0) return { value, cursor };
  return { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 };
}

export function deleteForward({ value, cursor }: EditState): EditState {
  return { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor };
}

export const left = ({ value, cursor }: EditState): EditState => ({ value, cursor: Math.max(0, cursor - 1) });
export const right = ({ value, cursor }: EditState): EditState => ({ value, cursor: Math.min(value.length, cursor + 1) });

function lineStart(value: string, cursor: number): number {
  return value.lastIndexOf("\n", cursor - 1) + 1;
}

function lineEnd(value: string, cursor: number): number {
  const end = value.indexOf("\n", cursor);
  return end === -1 ? value.length : end;
}

export const home = ({ value, cursor }: EditState): EditState => ({ value, cursor: lineStart(value, cursor) });
export const end = ({ value, cursor }: EditState): EditState => ({ value, cursor: lineEnd(value, cursor) });

/** Moves a line up or down, keeping the column where the line is long enough. Stays put on the first or last line. */
export function vertical({ value, cursor }: EditState, direction: -1 | 1): EditState {
  const start = lineStart(value, cursor);
  const column = cursor - start;

  if (direction === -1) {
    if (start === 0) return { value, cursor };
    const previousStart = lineStart(value, start - 1);
    return { value, cursor: Math.min(previousStart + column, start - 1) };
  }

  const endOfLine = lineEnd(value, cursor);
  if (endOfLine === value.length) return { value, cursor };
  const nextStart = endOfLine + 1;
  return { value, cursor: Math.min(nextStart + column, lineEnd(value, nextStart)) };
}

/** Ctrl+U: deletes back to the start of the line. */
export function killToLineStart({ value, cursor }: EditState): EditState {
  const start = lineStart(value, cursor);
  return { value: value.slice(0, start) + value.slice(cursor), cursor: start };
}

/** Ctrl+K: deletes to the end of the line. */
export function killToLineEnd({ value, cursor }: EditState): EditState {
  return { value: value.slice(0, cursor) + value.slice(lineEnd(value, cursor)), cursor };
}

/** Ctrl+W: deletes the word before the cursor, and the spaces after it. */
export function killWord({ value, cursor }: EditState): EditState {
  let start = cursor;
  while (start > 0 && value[start - 1] === " ") start--;
  while (start > 0 && !/\s/.test(value[start - 1] ?? "")) start--;
  return { value: value.slice(0, start) + value.slice(cursor), cursor: start };
}

/**
 * What Enter means. A backslash right before the cursor turns it into a new line, as in Claude Code; otherwise the
 * text is ready to send, as long as there is any.
 */
export function enter(state: EditState): { state: EditState; submit: boolean } {
  const { value, cursor } = state;
  if (value[cursor - 1] === "\\") {
    return { state: insert({ value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 }, "\n"), submit: false };
  }
  return { state, submit: value.trim() !== "" };
}
