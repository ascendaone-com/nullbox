// Turns ANSI terminal output into SVG, one character cell at a time, for the README's screenshots and demo.

export const THEME = {
  background: "#16161a",
  chrome: "#232329",
  foreground: "#e4e4e7",
  colors: { 30: "#3f3f46", 31: "#f87171", 32: "#86efac", 33: "#fcd34d", 34: "#7aa2f7", 35: "#d8a7f5", 36: "#7dd3d8", 37: "#e4e4e7" },
  bright: { 90: "#8b8b94", 91: "#fca5a5", 92: "#bbf7d0", 93: "#fde68a", 94: "#a5c0ff", 95: "#e9cbfa", 96: "#a5f3f6", 97: "#ffffff" },
};

/** Splits a line of ANSI text into runs of cells that share a style. */
function parse(line) {
  const runs = [];
  let style = { color: undefined, bold: false, dim: false, italic: false, inverse: false };
  let text = "";
  const flush = () => {
    if (text !== "") runs.push({ text, ...style });
    text = "";
  };

  for (const part of line.split(/(\u001b\[[0-9;]*m)/)) {
    const sgr = /^\u001b\[([0-9;]*)m$/.exec(part);
    if (!sgr) {
      text += part;
      continue;
    }
    flush();
    const codes = (sgr[1] || "0").split(";").map(Number);
    style = { ...style };
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) style = { color: undefined, bold: false, dim: false, italic: false, inverse: false };
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 3) style.italic = true;
      else if (code === 7) style.inverse = true;
      else if (code === 22) style.bold = style.dim = false;
      else if (code === 23) style.italic = false;
      else if (code === 27) style.inverse = false;
      else if (code === 39) style.color = undefined;
      else if (THEME.colors[code]) style.color = THEME.colors[code];
      else if (THEME.bright[code]) style.color = THEME.bright[code];
      else if (code === 38 && codes[i + 1] === 2) {
        style.color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    }
  }
  flush();
  return runs;
}

export const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const METRICS = { font: 14, cell: 8.43, lineHeight: 17, pad: 22, top: 40 };

/** The SVG elements for one screen of ANSI text, laid out on the cell grid. */
export function frameBody(frame) {
  const { font, cell, lineHeight, pad, top } = METRICS;
  const lines = frame.split("\n");
  return lines
    .map((line, row) => {
      let column = 0;
      const y = top + pad / 2 + row * lineHeight + font;
      return parse(line)
        .map((run) => {
          const cells = [...run.text].length;
          const x = pad + column * cell;
          column += cells;
          const color = run.color ?? THEME.foreground;
          const parts = [];
          if (run.inverse) parts.push(`<rect x="${x}" y="${y - font + 1}" width="${cells * cell}" height="${lineHeight - 2}" fill="${color}"/>`);

          // Spaces are drawn by position, not as glyphs: only the text between them is set, each piece at its column,
          // stretched to exactly its cells so a font that's a little wider or narrower can't drift off the grid.
          const pieces = [];
          let offset = 0;
          for (const piece of run.text.split(/( +)/)) {
            const length = [...piece].length;
            if (piece !== "" && !piece.startsWith(" ")) pieces.push({ text: piece, x: x + offset * cell, cells: length });
            offset += length;
          }
          for (const piece of pieces) {
            const attributes = [
              `x="${piece.x.toFixed(2)}"`,
              `y="${y}"`,
              `fill="${run.inverse ? THEME.background : color}"`,
              run.bold ? `font-weight="700"` : "",
              run.italic ? `font-style="italic"` : "",
              run.dim ? `opacity="0.55"` : "",
              `textLength="${(piece.cells * cell).toFixed(2)}"`,
              `lengthAdjust="spacingAndGlyphs"`,
            ].filter(Boolean);
            parts.push(`<text ${attributes.join(" ")}>${escape(piece.text)}</text>`);
          }
          return parts.join("");
        })
        .join("");
    })
    .join("\n");
}

export function size(columns, rows) {
  const { cell, lineHeight, pad, top } = METRICS;
  return { width: Math.ceil(columns * cell + pad * 2), height: Math.ceil(top + rows * lineHeight + pad) };
}

/** A terminal window around content: rounded, with the traffic lights and a title. */
export function terminalWindow({ columns, rows, title, content, style = "" }) {
  const { font } = METRICS;
  const { width, height } = size(columns, rows);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">
<title>${escape(title)}</title>${style ? `\n<style>${style}</style>` : ""}
<rect width="${width}" height="${height}" rx="10" fill="${THEME.background}"/>
<path d="M10 0h${width - 20}a10 10 0 0 1 10 10v20H0V10A10 10 0 0 1 10 0z" fill="${THEME.chrome}"/>
<circle cx="20" cy="15" r="6" fill="#ff5f57"/><circle cx="40" cy="15" r="6" fill="#febc2e"/><circle cx="60" cy="15" r="6" fill="#28c840"/>
<text x="${width / 2}" y="20" fill="#8b8b94" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" text-anchor="middle">nullbox</text>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="${font}" xml:space="preserve">
${content}
</g>
</svg>
`;
}

/** A still screenshot of one screen. */
export function still(frame, { columns, title }) {
  return terminalWindow({ columns, rows: frame.split("\n").length, title, content: frameBody(frame) });
}
