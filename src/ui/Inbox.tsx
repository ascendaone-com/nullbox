import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import { age, type Item, type Reason } from "../inbox.js";
import { Mark } from "./Composer.js";
import { colors, glyphs } from "./theme.js";
import { wrap } from "./wrap.js";

export type InboxAction = { kind: "reply"; item: Item } | { kind: "quit" };

export interface InboxProps {
  username: string;
  load: () => Promise<Item[]>;
  onOpen: (item: Item) => boolean;
  onDismiss: (item: Item) => void;
  onDone: (action: InboxAction) => void;
  /** A line to show once above the list, such as "✔ Committed: …" after a reply. */
  flash?: string;
}

const TAGS: Record<Reason, { color: string; text: (item: Item) => string }> = {
  replies: { color: "green", text: (item) => `↩ ${plural(item.newReplies, "new reply", "new replies")}` },
  mention: { color: colors.blue, text: () => "@ mentioned you" },
  question: { color: "yellow", text: () => "? asks" },
  active: { color: colors.slash1, text: (item) => `● ${item.replies} replies` },
  following: { color: "gray", text: () => "following" },
};

const TAG_WIDTH = 16;
const AUTHOR_WIDTH = 16;

function firstLine(body: string): string {
  return body.split("\n").find((line) => line.trim() !== "") ?? "";
}

/** Pads or cuts text to exactly width characters, so fixed columns line up whatever Yoga makes of them. */
function fit(text: string, width: number): string {
  const chars = [...text];
  return chars.length > width ? chars.slice(0, width - 1).join("") + "…" : text + " ".repeat(width - chars.length);
}

function Row({ item, index, selected, wide }: { item: Item; index: number; selected: boolean; wide: boolean }) {
  const tag = TAGS[item.reason];
  const number = (index === 9 ? "0" : String(index + 1)).padStart(2);
  return (
    <Box>
      <Box flexShrink={0}>
        <Text>
          <Text color={colors.blue}>{selected ? glyphs.prompt : " "}</Text>
        <Text bold={selected} dimColor={!selected}>
          {number}{" "}
        </Text>
        <Text bold={selected}>{fit(`@${item.author}`, AUTHOR_WIDTH)} </Text>
          <Text color={tag.color}>{fit(tag.text(item), TAG_WIDTH)} </Text>
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} flexBasis={0}>
        <Text wrap="truncate-end" dimColor={!selected}>
          {firstLine(item.body)}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>
          {" "}
          {age(item.createdAt).padStart(3)}
          {wide ? ` ${item.shortHash}` : ""}
        </Text>
      </Box>
    </Box>
  );
}

/** The selected item in full, or near enough: up to five lines, with @mentions in blue. */
function Preview({ item, width }: { item: Item; width: number }) {
  const lines = wrap(item.body.replace(/\n{3,}/g, "\n\n"), width - 5);
  const shown = lines.slice(0, 5);
  return (
    <Box marginTop={1} marginLeft={2} paddingLeft={1} borderStyle="single" borderTop={false} borderRight={false} borderBottom={false} borderDimColor flexDirection="column">
      {wrap(`@${item.author} · ${age(item.createdAt)} · ${item.shortHash}${item.reason === "replies" ? " · your commit, o to read the replies" : ""}`, width - 5).map((line, i) => (
        <Text key={`meta-${i}`} dimColor>
          {line}
        </Text>
      ))}
      {shown.map((line, i) => (
        <Text key={i}>
          {line.split(/(@[A-Za-z0-9-]+)/).map((part, j) =>
            part.startsWith("@") ? (
              <Text key={j} color={colors.blue}>
                {part}
              </Text>
            ) : (
              part
            ),
          )}
          {i === shown.length - 1 && lines.length > shown.length ? <Text dimColor> …</Text> : null}
        </Text>
      ))}
    </Box>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Summary({ items }: { items: Item[] }) {
  const count = (reason: Reason) => items.filter((item) => item.reason === reason).length;
  const parts = [
    count("replies") && plural(items.filter((i) => i.reason === "replies").reduce((sum, i) => sum + i.newReplies, 0), "new reply", "new replies"),
    count("mention") && plural(count("mention"), "mention", "mentions"),
    count("question") && plural(count("question"), "question", "questions"),
  ].filter(Boolean);
  return <Text dimColor>{parts.length > 0 ? parts.join(" · ") : `${items.length} to catch up on`}</Text>;
}

export function Inbox({ username, load, onOpen, onDismiss, onDone, flash }: InboxProps) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const [items, setItems] = useState<Item[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState<string | undefined>(flash);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    setError(undefined);
    load()
      .then((loaded) => {
        setItems(loaded);
        setSelected((current) => Math.min(current, Math.max(0, loaded.length - 1)));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const finish = (action: InboxAction) => {
    onDone(action);
    exit();
  };

  useInput((input, key) => {
    if (input === "q" || key.escape || (key.ctrl && input === "c")) return finish({ kind: "quit" });
    if (input === "r") return refresh();
    if (!items || items.length === 0) return;

    const current = items[selected];
    if (key.upArrow || input === "k") return setSelected((selected - 1 + items.length) % items.length);
    if (key.downArrow || input === "j") return setSelected((selected + 1) % items.length);

    if (/^[0-9]$/.test(input)) {
      const index = input === "0" ? 9 : Number(input) - 1;
      const item = items[index];
      if (item) return finish({ kind: "reply", item });
      return;
    }

    if (!current) return;
    if (key.return) return finish({ kind: "reply", item: current });
    if (input === "o") {
      setNotice(onOpen(current) ? `Opened ${current.shortHash} in your browser.` : current.url);
      return;
    }
    if (input === "d") {
      onDismiss(current);
      const rest = items.filter((item) => item.id !== current.id);
      setItems(rest);
      setSelected(Math.min(selected, Math.max(0, rest.length - 1)));
      setNotice(`Marked ${current.shortHash} done.`);
    }
  });

  const wide = columns >= 80;
  const current = items?.[selected];

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={1} marginBottom={1}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Mark />
            <Text dimColor> · @{username}</Text>
          </Text>
        </Box>
        <Box flexShrink={0}>{loading ? <Text dimColor>checking…</Text> : items ? <Summary items={items} /> : null}</Box>
      </Box>

      {error ? <Text color="red">{glyphs.fail} {error}</Text> : null}
      {items && items.length === 0 && !loading ? <Text dimColor>  All caught up. Nothing needs you right now.</Text> : null}
      {items?.map((item, index) => <Row key={item.id} item={item} index={index} selected={index === selected} wide={wide} />)}
      {current ? <Preview item={current} width={columns} /> : null}

      <Box marginTop={1} paddingX={2} flexDirection="column">
        {notice ? <Text color={notice.startsWith(glyphs.ok) ? "green" : notice.startsWith(glyphs.fail) ? "red" : undefined}>{notice}</Text> : null}
        <Text dimColor wrap="truncate-end">
          <Text bold>1-0</Text> reply · <Text bold>↑↓</Text> move · <Text bold>o</Text> open · <Text bold>d</Text> done ·{" "}
          <Text bold>r</Text> refresh · <Text bold>q</Text> quit
        </Text>
      </Box>
    </Box>
  );
}
