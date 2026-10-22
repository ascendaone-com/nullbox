// The README's hero: an animated SVG of nullbox in use, made of real frames from the components. The inbox loads, you
// move to a mention and press 2, type a reply with a code block, send it, and land back on the list. Each frame is a
// group shown for its moment by a CSS animation, which GitHub plays in an <img>; with reduced motion, the inbox stays.

import { COLUMNS, Composer, h, Inbox, items, mention, render, tick } from "./sample.mjs";
import { frameBody, terminalWindow } from "./terminal-svg.mjs";

const dim = (text) => `\u001b[2m${text}\u001b[22m`;
const green = (text) => `\u001b[32m${text}\u001b[39m`;

/** Frames as [ANSI text, milliseconds on screen]. */
async function frames() {
  const out = [];
  const keep = (frame, ms) => out.push([frame, ms]);

  // The inbox, still checking, then loaded.
  const inbox = render(
    h(Inbox, { username: "you", load: () => new Promise((resolve) => setTimeout(() => resolve(items), 150)), onOpen: () => true, onDismiss() {}, onDone() {} }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  keep(inbox.lastFrame(), 700);
  await new Promise((resolve) => setTimeout(resolve, 250));
  keep(inbox.lastFrame(), 1500);
  inbox.stdin.write("\u001b[B");
  await tick();
  keep(inbox.lastFrame(), 2200);
  inbox.unmount();

  // 2: the reply box, typed into a word at a time.
  const parent = { username: "engineer42", shortHash: "0be0130", body: mention };
  const composer = render(h(Composer, { replyTo: "0be0130", parent, initial: "", dryRun: false, onDone() {} }));
  await tick();
  keep(composer.lastFrame(), 900);

  const type = async (keys, ms) => {
    composer.stdin.write(keys);
    await tick();
    keep(composer.lastFrame(), ms);
  };
  for (const word of "Cap the review side too. I gate merges, not runs:".split(/(?<= )/)) await type(word, 120);
  await type("\\", 250);
  await type("\r", 300);
  await type("```ts", 350);
  await type("\r", 300);
  for (const word of "const reviews = pLimit(2);".split(/(?<= )/)) await type(word, 130);
  await type("\r", 300);
  await type("```", 900);
  const typed = composer.lastFrame();
  composer.unmount();

  // enter: the box closes and the reply is signed and sent, as the CLI prints it.
  const steps = [
    `  ${dim("◇")} Finding your GitHub SSH key…`,
    `  ${dim("◇")} Signing with ssh-ed25519 AAAAC3Nz…Vt3E`,
    `  ${dim("◇")} Sending to dev-null.sh…`,
    "",
    `  ${green("✔")} Committed: https://dev-null.sh/@you/commits/01a2c7f0`,
  ];
  const sent = typed.replace(/\u001b\[7m(.)\u001b\[27m/g, "$1");
  for (let shown = 1; shown <= steps.length; shown++) {
    if (steps[shown - 1] === "") continue;
    keep(`${sent}\n\n${steps.slice(0, shown).join("\n")}`, shown === steps.length ? 1600 : 450);
  }

  // Back to the list: the mention is answered, so it's gone.
  const answered = items.filter((item) => item.author !== "engineer42");
  const back = render(
    h(Inbox, { username: "you", load: async () => answered, onOpen: () => true, onDismiss() {}, onDone() {}, flash: "✔ Committed: https://dev-null.sh/@you/commits/01a2c7f0" }),
  );
  await tick();
  keep(back.lastFrame(), 3200);
  back.unmount();

  return out;
}

export async function demo() {
  const shots = await frames();
  const total = shots.reduce((sum, [, ms]) => sum + ms, 0);
  const rows = Math.max(...shots.map(([frame]) => frame.split("\n").length));
  const percent = (ms) => ((ms / total) * 100).toFixed(3);

  let at = 0;
  const keyframes = [];
  const groups = shots.map(([frame, ms], i) => {
    const start = percent(at);
    const end = percent(at + ms);
    at += ms;
    keyframes.push(
      i === 0
        ? `@keyframes f${i}{0%{opacity:1}${end}%{opacity:0}100%{opacity:0}}`
        : `@keyframes f${i}{0%{opacity:0}${start}%{opacity:1}${end}%{opacity:0}100%{opacity:0}}`,
    );
    return `<g class="f" style="animation-name:f${i}">\n${frameBody(frame)}\n</g>`;
  });

  // The loaded inbox, for anyone who has asked for less motion.
  const still = 1;
  const style = [
    `.f{opacity:0;animation-duration:${total}ms;animation-iteration-count:infinite;animation-timing-function:step-end}`,
    ...keyframes,
    `@media (prefers-reduced-motion:reduce){.f{animation:none}.f:nth-of-type(${still + 1}){opacity:1}}`,
  ].join("\n");

  return terminalWindow({
    columns: COLUMNS,
    rows,
    title: "nullbox: pick a conversation, reply with a code block, send it, and you're back at the list",
    content: groups.join("\n"),
    style,
  });
}
