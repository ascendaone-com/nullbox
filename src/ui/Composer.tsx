import { Box, Text, useApp, useInput, usePaste } from "ink";
import { useState } from "react";
import * as edit from "./editing.js";
import { colors, glyphs } from "./theme.js";

export interface Parent {
  username?: string;
  shortHash?: string;
  body?: string;
}

export type ComposeResult = { kind: "send"; text: string } | { kind: "cancel" };

export interface ComposerProps {
  replyTo: string;
  parent?: Parent;
  initial: string;
  dryRun: boolean;
  onDone: (result: ComposeResult) => void;
}

const MAX_QUOTE_LINES = 4;

/** The // of the /dev/null logo, then the name. */
export function Mark() {
  return (
    <Text bold>
      <Text color={colors.slash1}>/</Text>
      <Text color={colors.slash2}>/</Text> nullbox
    </Text>
  );
}

/** A line of a commit, with @mentions in blue as /dev/null shows them. */
function WithMentions({ line }: { line: string }) {
  return (
    <>
      {line.split(/(@[A-Za-z0-9-]+)/).map((part, i) =>
        part.startsWith("@") ? (
          <Text key={i} color={colors.blue}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Header({ replyTo, parent }: Pick<ComposerProps, "replyTo" | "parent">) {
  const quote = (parent?.body ?? "").trim().split("\n");
  const shown = quote.slice(0, MAX_QUOTE_LINES);
  const target = parent?.username ? `@${parent.username}` : replyTo;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between" gap={1}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Mark />
            <Text dimColor> · replying to </Text>
            <Text bold>{target}</Text>
          </Text>
        </Box>
        {parent?.shortHash ? (
          <Box flexShrink={0}>
            <Text dimColor>{parent.shortHash}</Text>
          </Box>
        ) : null}
      </Box>
      {parent?.body ? (
        <Box
          marginLeft={1}
          paddingLeft={1}
          borderStyle="single"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderDimColor
          flexDirection="column"
        >
          {shown.map((line, i) => (
            <Text key={i}>
              <WithMentions line={line} />
              {i === shown.length - 1 && quote.length > shown.length ? <Text dimColor> …</Text> : null}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** The text with an inverse block where the cursor is, one Text per line, the first behind the prompt mark. */
function Lines({ state, placeholder }: { state: edit.EditState; placeholder: string }) {
  const prompt = <Text color={colors.blue}>{glyphs.prompt} </Text>;

  if (state.value === "") {
    return (
      <Text>
        {prompt}
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  let offset = 0;
  return (
    <Box flexDirection="column">
      {state.value.split("\n").map((line, i) => {
        const start = offset;
        offset += line.length + 1;
        const prefix = i === 0 ? prompt : <Text>{"  "}</Text>;
        const column = state.cursor - start;

        if (column < 0 || column > line.length) {
          return (
            <Text key={i}>
              {prefix}
              {line}
            </Text>
          );
        }

        return (
          <Text key={i}>
            {prefix}
            {line.slice(0, column)}
            <Text inverse>{line[column] ?? " "}</Text>
            {line.slice(column + 1)}
          </Text>
        );
      })}
    </Box>
  );
}

export function Composer({ replyTo, parent, initial, dryRun, onDone }: ComposerProps) {
  const { exit } = useApp();
  const [state, setState] = useState(() => edit.empty(initial));
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const finish = (result: ComposeResult) => {
    onDone(result);
    exit();
  };

  usePaste((text) => setState((current) => edit.insert(current, text)));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      if (state.value.trim() === "" || confirmDiscard) return finish({ kind: "cancel" });
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);

    if (key.return && key.meta) return setState(edit.insert(state, "\n"));
    if (key.return) {
      const result = edit.enter(state);
      if (result.submit) return finish({ kind: "send", text: result.state.value.trim() });
      return setState(result.state);
    }
    // Ctrl+J sends a bare line feed, which Ink passes through as "\n".
    if (input === "\n" || (key.ctrl && input === "j")) return setState(edit.insert(state, "\n"));

    if (key.ctrl) {
      switch (input) {
        case "a":
          return setState(edit.home(state));
        case "e":
          return setState(edit.end(state));
        case "u":
          return setState(edit.killToLineStart(state));
        case "k":
          return setState(edit.killToLineEnd(state));
        case "w":
          return setState(edit.killWord(state));
        default:
          return;
      }
    }

    if (key.backspace) return setState(key.meta ? edit.killWord(state) : edit.backspace(state));
    if (key.delete) return setState(edit.backspace(state));
    if (key.leftArrow) return setState(edit.left(state));
    if (key.rightArrow) return setState(edit.right(state));
    if (key.upArrow) return setState(edit.vertical(state, -1));
    if (key.downArrow) return setState(edit.vertical(state, 1));
    if (key.home) return setState(edit.home(state));
    if (key.end) return setState(edit.end(state));
    if (key.tab || key.meta) return;

    if (input !== "") setState(edit.insert(state, input));
  });

  return (
    <Box flexDirection="column">
      <Header replyTo={replyTo} parent={parent} />
      <Box borderStyle="round" borderColor={colors.blue} paddingX={1}>
        <Lines state={state} placeholder="Write your reply…" />
      </Box>
      <Box paddingX={2}>
        {confirmDiscard ? (
          <Text color="yellow">Press esc again to discard your reply.</Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {dryRun ? (
              <>
                <Text color="yellow" bold dimColor={false}>
                  dry run
                </Text>
                {" · "}
              </>
            ) : null}
            <Text bold>enter</Text> {dryRun ? "sign" : "send"} · <Text bold>\⏎</Text> new line · <Text bold>esc</Text> cancel
          </Text>
        )}
      </Box>
    </Box>
  );
}
