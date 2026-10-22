import { Box, Text } from "ink";
import { useMemo } from "react";
import { analyze, type Style } from "../code.js";
import { Runs, show } from "./Styled.js";

/**
 * A commit body laid out for reading in a fixed width: prose word-wrapped with its @mentions and inline code coloured,
 * and each fenced block framed, labelled with its language, and highlighted. Code lines are cut, not wrapped, so code
 * keeps its shape.
 */
export type Line =
  | { kind: "prose"; start: number; end: number }
  | { kind: "code"; start: number; end: number }
  | { kind: "top"; language?: string }
  | { kind: "bottom" };

const cells = (text: string) => [...show(text)].length;

/** Word-wraps text[from, to) into ranges no wider than width, keeping paragraphs and blank lines. */
function wrapRanges(text: string, from: number, to: number, width: number): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  let paragraphStart = from;

  while (paragraphStart <= to) {
    const breakAt = text.indexOf("\n", paragraphStart);
    const paragraphEnd = breakAt === -1 || breakAt > to ? to : breakAt;
    let lineStart = -1;
    let lineEnd = -1;

    for (const word of text.slice(paragraphStart, paragraphEnd).matchAll(/\S+/g)) {
      let start = paragraphStart + (word.index ?? 0);
      const end = start + word[0].length;

      while (cells(text.slice(start, end)) > width) {
        if (lineStart !== -1) lines.push([lineStart, lineEnd]);
        lines.push([start, start + width]);
        start += width;
        lineStart = -1;
      }
      if (lineStart === -1) {
        lineStart = start;
        lineEnd = end;
      } else if (cells(text.slice(lineStart, end)) <= width) {
        lineEnd = end;
      } else {
        lines.push([lineStart, lineEnd]);
        lineStart = start;
        lineEnd = end;
      }
    }
    lines.push(lineStart === -1 ? [paragraphStart, paragraphStart] : [lineStart, lineEnd]);
    paragraphStart = paragraphEnd + 1;
  }
  return lines;
}

/** Trims the line breaks either side of a block, as /dev/null does: a block is its own line already. */
function proseRange(text: string, from: number, to: number): [number, number] {
  let start = from;
  let end = to;
  while (start < end && text[start] === "\n") start++;
  while (end > start && text[end - 1] === "\n") end--;
  return [start, end];
}

const isBlank = (line: Line | undefined) => line?.kind === "prose" && line.start === line.end;

export function layout(text: string, width: number): { lines: Line[]; styles: Style[] } {
  const { styles, blocks } = analyze(text);
  const lines: Line[] = [];
  let last = 0;

  const addProse = (from: number, to: number) => {
    const [start, end] = proseRange(text, from, to);
    if (start >= end) return;
    for (const [s, e] of wrapRanges(text, start, end, width)) lines.push({ kind: "prose", start: s, end: e });
  };

  for (const block of blocks) {
    addProse(last, block.start);
    lines.push({ kind: "top", language: block.language });
    let start = block.codeStart;
    while (start <= block.codeEnd && block.codeEnd > block.codeStart) {
      const breakAt = text.indexOf("\n", start);
      const end = breakAt === -1 || breakAt > block.codeEnd ? block.codeEnd : breakAt;
      lines.push({ kind: "code", start, end });
      start = end + 1;
    }
    lines.push({ kind: "bottom" });
    last = block.end;
  }
  addProse(last, text.length);

  // Collapse runs of blank prose lines, as /dev/null does.
  return {
    styles,
    lines: lines.filter((line, i) => !(isBlank(line) && isBlank(lines[i - 1]))),
  };
}

/** The body, at most maxLines lines of it, with a dim … when there's more. */
export function Body({ text, width, maxLines = Infinity }: { text: string; width: number; maxLines?: number }) {
  const body = text.trim();
  const { lines, styles } = useMemo(() => layout(body, Math.max(10, width)), [body, width]);
  const shown = lines.slice(0, maxLines);
  const more = lines.length > shown.length;
  const codeWidth = Math.max(8, width - 2);

  return (
    <Box flexDirection="column">
      {shown.map((line, i) => {
        const tail = more && i === shown.length - 1 ? <Text dimColor> …</Text> : null;
        if (line.kind === "top") {
          return (
            <Text key={i} dimColor>
              ┌─{line.language ? ` ${line.language}` : ""}
            </Text>
          );
        }
        if (line.kind === "bottom") {
          return (
            <Text key={i} dimColor>
              └─{tail}
            </Text>
          );
        }
        if (line.kind === "code") {
          // Cut a long line of code at the width, by cells, rather than wrapping it.
          let end = line.start;
          while (end < line.end && cells(body.slice(line.start, end + 1)) <= codeWidth - 1) end++;
          return (
            <Text key={i} wrap="truncate-end">
              <Text dimColor>│ </Text>
              <Runs text={body} styles={styles} from={line.start} to={end} />
              {end < line.end ? <Text dimColor>…</Text> : null}
              {tail}
            </Text>
          );
        }
        return (
          <Text key={i}>
            <Runs text={body} styles={styles} from={line.start} to={line.end} />
            {tail}
          </Text>
        );
      })}
    </Box>
  );
}
