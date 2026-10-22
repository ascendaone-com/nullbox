// Renders the inbox and the reply box with sample data and saves them as SVG screenshots for the README:
// docs/inbox.svg and docs/reply.svg. Run with `npm run screenshot` (it builds first).
//
// The screens come from the real components, through ink-testing-library, in colour; the ANSI they print is turned
// into SVG here, one character cell at a time, so the image matches what nullbox draws. The handles and posts are
// made up, so the README never shows real people's commits.

import { writeFileSync } from "node:fs";
import { render } from "ink-testing-library";
import React from "react";
import { Composer } from "../dist/ui/Composer.js";
import { Inbox } from "../dist/ui/Inbox.js";

const COLUMNS = 92;
const h = React.createElement;
const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

// Ink reads the width from stdout, which ink-testing-library fixes at 100.
const probe = render(h(React.Fragment));
Object.defineProperty(Object.getPrototypeOf(probe.stdout), "columns", { get: () => COLUMNS });
probe.unmount();

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000 + 5_000).toISOString();
const hashes = ["b06d99e", "0be0130", "f2c3ce7", "8edc1f4", "7e91958", "c7c6ed0", "a41f0c2", "5ad0532", "e1188ba", "9c3d7aa"];
let next = 0;
const item = (author, reason, body, minutes, extra = {}) => ({
  id: `sample-${next}`,
  shortHash: hashes[next++],
  url: "https://dev-null.sh/",
  author,
  body,
  createdAt: minutesAgo(minutes),
  replies: 1,
  newReplies: 0,
  reason,
  score: 0,
  ...extra,
});

const mention = "@you how do you cap concurrency? I tried this:\n```ts\nconst limit = pLimit(4);\nawait Promise.all(jobs.map((j) => limit(run, j)));\n```\nbut the review queue still explodes.";
const items = [
  item("you", "replies", "Reviewing agent output takes longer than writing the code myself some days.", 70, { newReplies: 2, replies: 2 }),
  item("engineer42", "mention", mention, 42),
  item("devlin", "question", "How are people managing five agents at once?", 125),
  item("mara-k", "question", "Anyone else batching reviews instead of watching each agent?", 190),
  item("tamsin", "active", "Hot take: the bottleneck moved from typing to reading.", 260, { replies: 14 }),
  item("oskar", "question", "What's your terminal setup for long agent runs?", 300),
  item("priya", "question", "Do you keep agents on separate branches or one?", 340),
  item("lee", "following", "Shipped a tiny CLI for tailing agent logs today.", 400),
  item("ren", "following", "Rails autoscaling on CPU and response time, not guesswork", 470),
  item("noor", "following", "OpenTelemetry tracing without touching your infrastructure", 520),
];

async function inboxFrame() {
  const app = render(h(Inbox, { username: "you", load: async () => items, onOpen: () => true, onDismiss() {}, onDone() {} }));
  await tick();
  app.stdin.write("\u001b[B");
  await tick();
  const frame = app.lastFrame();
  app.unmount();
  return frame;
}

async function replyFrame() {
  const parent = { username: "engineer42", shortHash: "0be0130", body: mention };
  const app = render(h(Composer, { replyTo: "0be0130", parent, initial: "", dryRun: false, onDone() {} }));
  await tick();
  for (const keys of ["Cap the review side too. I gate merges, not runs:", "\\", "\r", "```ts", "\r", "const reviews = pLimit(2);", "\r", "```"]) {
    app.stdin.write(keys);
    await tick();
  }
  const frame = app.lastFrame();
  app.unmount();
  return frame;
}

// --- ANSI to SVG ---------------------------------------------------------------------------------------------------

const THEME = {
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

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svg(frame, title) {
  const font = 14;
  const cell = 8.43;
  const lineHeight = 17;
  const pad = 22;
  const top = 40;
  const lines = frame.split("\n");
  const width = Math.ceil(COLUMNS * cell + pad * 2);
  const height = Math.ceil(top + lines.length * lineHeight + pad);

  const body = lines
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">
<title>${escape(title)}</title>
<rect width="${width}" height="${height}" rx="10" fill="${THEME.background}"/>
<path d="M10 0h${width - 20}a10 10 0 0 1 10 10v20H0V10A10 10 0 0 1 10 0z" fill="${THEME.chrome}"/>
<circle cx="20" cy="15" r="6" fill="#ff5f57"/><circle cx="40" cy="15" r="6" fill="#febc2e"/><circle cx="60" cy="15" r="6" fill="#28c840"/>
<text x="${width / 2}" y="20" fill="#8b8b94" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" text-anchor="middle">nullbox</text>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="${font}" xml:space="preserve">
${body}
</g>
</svg>
`;
}

writeFileSync(new URL("../docs/inbox.svg", import.meta.url), svg(await inboxFrame(), "nullbox inbox: your top 10 conversations"));
writeFileSync(new URL("../docs/reply.svg", import.meta.url), svg(await replyFrame(), "nullbox reply box with a highlighted code block"));
console.log("Wrote docs/inbox.svg and docs/reply.svg");
process.exit(0);
