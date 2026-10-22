import { Box, Text, useApp, useInput, usePaste } from "ink";
import { useState } from "react";
import { Cancelled } from "../errors.js";
import { editInEditor } from "../prompt.js";
import * as edit from "./editing.js";
import { accent, glyphs } from "./theme.js";

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

function Header({ replyTo, parent, dryRun }: Pick<ComposerProps, "replyTo" | "parent" | "dryRun">) {
  const quote = (parent?.body ?? "").trim().split("\n");
  const shown = quote.slice(0, MAX_QUOTE_LINES);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={accent} bold>
          {glyphs.mark} nullbox
        </Text>
        <Text dimColor>·</Text>
        {parent?.username ? (
          <Text>
            replying to <Text bold>@{parent.username}</Text>
            {parent.shortHash ? <Text dimColor> · {parent.shortHash}</Text> : null}
          </Text>
        ) : (
          <Text>
            replying to <Text bold>{replyTo}</Text>
          </Text>
        )}
        {dryRun ? (
          <Text color="yellow" bold>
            {" "}DRY RUN{" "}
          </Text>
        ) : null}
      </Box>
      {parent?.body ? (
        <Box
          marginLeft={2}
          paddingLeft={1}
          borderStyle="single"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderDimColor
          flexDirection="column"
        >
          {shown.map((line, i) => (
            <Text key={i} dimColor>
              {line}
              {i === shown.length - 1 && quote.length > shown.length ? " …" : ""}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** The text with an inverse block where the cursor is, one Text per line, the first behind the prompt mark. */
function Lines({ state, placeholder }: { state: edit.EditState; placeholder: string }) {
  const lines = state.value.split("\n");
  let offset = 0;

  if (state.value === "") {
    return (
      <Text>
        <Text color={accent}>{glyphs.prompt} </Text>
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const start = offset;
        offset += line.length + 1;
        const prefix = i === 0 ? <Text color={accent}>{glyphs.prompt} </Text> : <Text>{"  "}</Text>;
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
  const { exit, suspendTerminal } = useApp();
  const [state, setState] = useState(() => edit.empty(initial));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  const finish = (result: ComposeResult) => {
    onDone(result);
    exit();
  };

  const openEditor = async () => {
    let text: string | undefined;
    await suspendTerminal(async () => {
      try {
        text = await editInEditor(state.value);
      } catch (error) {
        if (!(error instanceof Cancelled)) setNotice(error instanceof Error ? error.message : String(error));
      }
    });
    if (text !== undefined) setState(edit.empty(text));
  };

  usePaste((text) => setState((current) => edit.insert(current, text)));

  useInput((input, key) => {
    setNotice(undefined);

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
        case "g":
          void openEditor();
          return;
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

  const send = dryRun ? "sign (dry run)" : "send";

  return (
    <Box flexDirection="column">
      <Header replyTo={replyTo} parent={parent} dryRun={dryRun} />
      <Box borderStyle="round" borderColor={accent} paddingX={1}>
        <Lines state={state} placeholder="Write your reply…" />
      </Box>
      <Box paddingX={2}>
        {confirmDiscard ? (
          <Text color="yellow">Press esc again to discard your reply.</Text>
        ) : notice ? (
          <Text color="red">{notice}</Text>
        ) : (
          <Text dimColor>
            <Text bold>enter</Text> {send} · <Text bold>\⏎</Text> new line · <Text bold>ctrl+g</Text> editor ·{" "}
            <Text bold>esc</Text> cancel
          </Text>
        )}
      </Box>
    </Box>
  );
}
