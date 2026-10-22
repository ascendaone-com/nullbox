// Renders the inbox and the reply box with sample data and saves them for the README: docs/inbox.svg and
// docs/reply.svg as stills, and docs/demo.svg as an animated walk-through. Run with `npm run screenshot` (it builds
// first).
//
// The screens come from the real components, through ink-testing-library, in colour; the ANSI they print is turned
// into SVG cell by cell (lib/terminal-svg.mjs), so the images match what nullbox draws.

import { writeFileSync } from "node:fs";
import { demo } from "./lib/demo.mjs";
import { COLUMNS, inboxFrame, replyFrame } from "./lib/sample.mjs";
import { still } from "./lib/terminal-svg.mjs";

const write = (name, svg) => writeFileSync(new URL(`../docs/${name}`, import.meta.url), svg);

write("inbox.svg", still(await inboxFrame(), { columns: COLUMNS, title: "nullbox inbox: your top 10 conversations" }));
write("reply.svg", still(await replyFrame(), { columns: COLUMNS, title: "nullbox reply box with a highlighted code block" }));
write("demo.svg", await demo());
console.log("Wrote docs/inbox.svg, docs/reply.svg and docs/demo.svg");
process.exit(0);
