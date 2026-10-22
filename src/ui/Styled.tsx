import { Text } from "ink";
import type { Style } from "../code.js";
import { colors } from "./theme.js";

interface Paint {
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
}

/** A small, terminal-friendly palette for highlight.js token classes, close to what /dev/null's highlighter shows. */
const TOKENS: Record<string, Paint> = {
  keyword: { color: "magenta" },
  "selector-tag": { color: "magenta" },
  built_in: { color: "cyan" },
  type: { color: "cyan" },
  "title.class": { color: "cyan" },
  title: { color: colors.blue },
  "title.function": { color: colors.blue },
  string: { color: "green" },
  regexp: { color: "green" },
  "template-tag": { color: "green" },
  number: { color: "yellow" },
  literal: { color: "yellow" },
  symbol: { color: "yellow" },
  attr: { color: "cyan" },
  attribute: { color: "cyan" },
  property: { color: "cyan" },
  variable: { color: "red" },
  "template-variable": { color: "red" },
  comment: { dimColor: true, italic: true },
  meta: { dimColor: true },
  doctag: { dimColor: true },
  tag: { color: "red" },
  name: { color: "red" },
  addition: { color: "green" },
  deletion: { color: "red" },
  section: { color: colors.blue, bold: true },
};

export function paint(style: Style): Paint {
  if (style === "mention") return { color: colors.blue };
  if (style === "mark") return { dimColor: true };
  if (style === "inline") return { color: colors.slash2 };
  if (style.startsWith("tok:")) {
    const name = style.slice(4);
    return TOKENS[name] ?? TOKENS[name.split(".")[0] ?? ""] ?? {};
  }
  return {};
}

/** Tabs take two cells, so code keeps its indentation without a tab stop pushing the box's border out. */
export const show = (text: string) => text.replace(/\t/g, "  ");

/**
 * Renders text[from, to) with the colour of each character, grouping runs of the same style. With a cursor in range,
 * that character is drawn inverse (a space when the cursor is at the end of the range).
 */
export function Runs({ text, styles, from, to, cursor }: { text: string; styles: Style[]; from: number; to: number; cursor?: number }) {
  const parts: Array<{ text: string; style: Style; inverse?: boolean }> = [];
  for (let i = from; i < to; i++) {
    const style = styles[i] ?? "text";
    const inverse = i === cursor;
    const last = parts[parts.length - 1];
    if (last && last.style === style && !inverse && !last.inverse) last.text += text[i];
    else parts.push({ text: text[i] ?? "", style, inverse });
  }
  if (cursor === to) parts.push({ text: " ", style: "text", inverse: true });

  return (
    <>
      {parts.map((part, i) => (
        <Text key={i} {...paint(part.style)} inverse={part.inverse}>
          {part.inverse && part.text === "\t" ? " " : show(part.text)}
        </Text>
      ))}
    </>
  );
}
