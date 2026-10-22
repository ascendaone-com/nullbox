import { common, createLowlight } from "lowlight";

/**
 * Code in a commit body, found the way /dev/null finds it (app/Services/CodeSpans.php): a fenced block runs from a line
 * starting with ``` or more, maybe with a language, to a line that is only ``` or more; inline code sits between two
 * backticks on one line. Keep PATTERN in sync with theirs.
 */
const PATTERN = /((?<![^\n])`{3,}[^`\r\n]*\r?\n(?:[\s\S]*?\r?\n)?`{3,}[ \t]*(?![^\r\n])|`[^`\r\n]+`)/g;

/** An opening fence with nothing to close it yet, as you're typing a block. */
const OPEN_FENCE = /(?<![^\n])`{3,}[^`\r\n]*(?:\n|$)/;

/**
 * What each character is, for colouring: prose, an @mention, the backticks and fences around code, inline code, or a
 * highlighted token ("tok:keyword", "tok:string", …) or plain "code" inside a block.
 */
export type Style = "text" | "mention" | "mark" | "inline" | "code" | `tok:${string}`;

export interface Block {
  /** From the first backtick of the opening fence to the end of the closing one (or of the text, while open). */
  start: number;
  end: number;
  /** Where the code itself starts and ends, between the fence lines. */
  codeStart: number;
  codeEnd: number;
  language?: string;
  closed: boolean;
}

export interface Analysis {
  styles: Style[];
  blocks: Block[];
}

const lowlight = createLowlight(common);

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

/** Marks each character of code with the innermost highlight.js class around it. */
function highlight(styles: Style[], code: string, offset: number, language: string | undefined): void {
  const known = language !== undefined && lowlight.registered(language);
  if (!known) {
    for (let i = 0; i < code.length; i++) styles[offset + i] = "code";
    return;
  }

  let position = offset;
  const walk = (node: HastNode, current: Style) => {
    if (node.type === "text") {
      const length = node.value?.length ?? 0;
      for (let i = 0; i < length; i++) styles[position + i] = current;
      position += length;
      return;
    }
    const className = node.properties?.className?.find((name) => name.startsWith("hljs-"));
    const style: Style = className ? `tok:${className.slice(5)}` : current;
    for (const child of node.children ?? []) walk(child, style);
  };

  walk(lowlight.highlight(language, code) as HastNode, "code");
}

function prose(styles: Style[], text: string, from: number, to: number): void {
  const part = text.slice(from, to);
  for (const match of part.matchAll(/(?<![A-Za-z0-9_-])@[A-Za-z0-9-]+/g)) {
    for (let i = 0; i < match[0].length; i++) styles[from + (match.index ?? 0) + i] = "mention";
  }
}

function block(styles: Style[], text: string, start: number, end: number, closed: boolean): Block {
  const firstBreak = text.indexOf("\n", start);
  const openerEnd = firstBreak === -1 || firstBreak > end ? end : firstBreak;
  const language = text.slice(start, openerEnd).replace(/^`+/, "").trim().split(/[ \t]/)[0]?.toLowerCase() || undefined;

  const codeStart = Math.min(end, openerEnd + 1);
  const closerStart = closed ? text.lastIndexOf("\n", end - 1) + 1 : end;
  const codeEnd = closed ? Math.max(codeStart, closerStart - 1) : end;

  // The fences, and the line breaks that tie them to the code, belong to the block.
  for (let i = start; i < codeStart; i++) styles[i] = "mark";
  for (let i = codeEnd; closed && i < end; i++) styles[i] = "mark";
  highlight(styles, text.slice(codeStart, codeEnd), codeStart, language);

  return { start, end, codeStart, codeEnd, language, closed };
}

/**
 * Styles every character of a body. With live, an opening fence with no closing one yet makes the rest of the text
 * code, so a block is coloured as you type it; /dev/null itself would show that as prose until it's closed.
 */
export function analyze(text: string, { live = false }: { live?: boolean } = {}): Analysis {
  const styles: Style[] = new Array<Style>(text.length).fill("text");
  const blocks: Block[] = [];
  let last = 0;

  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    prose(styles, text, last, start);

    if (match[0].startsWith("```")) {
      blocks.push(block(styles, text, start, end, true));
    } else {
      styles[start] = "mark";
      styles[end - 1] = "mark";
      for (let i = start + 1; i < end - 1; i++) styles[i] = "inline";
    }
    last = end;
  }

  const open = live ? OPEN_FENCE.exec(text.slice(last)) : null;
  if (open) {
    const start = last + open.index;
    prose(styles, text, last, start);
    blocks.push(block(styles, text, start, text.length, false));
  } else {
    prose(styles, text, last, text.length);
  }

  return { styles, blocks };
}

/** /dev/null's limit on a commit body. It counts links its own way, so this is a guide, not the final word. */
export const MAX_LENGTH = 4000;

export function length(text: string): number {
  return [...text].length;
}
