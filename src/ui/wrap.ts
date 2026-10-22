/**
 * Word-wraps text to a width, so wrapped lines start with a word rather than the space before it (Ink's own wrapping
 * keeps that space). A word longer than the width is split. Widths count code points, which is close enough for the
 * mostly-ASCII text people commit.
 */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  const size = Math.max(10, width);

  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      let rest = word;
      while ([...rest].length > size) {
        if (line !== "") lines.push(line);
        lines.push([...rest].slice(0, size).join(""));
        rest = [...rest].slice(size).join("");
        line = "";
      }
      if (line === "") line = rest;
      else if ([...line].length + 1 + [...rest].length <= size) line += ` ${rest}`;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}
