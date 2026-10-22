import { Box, Text, useApp, useInput, usePaste, useWindowSize } from "ink";
import { useMemo, useState } from "react";
import { analyze, length, MAX_LENGTH, type Analysis } from "../code.js";
import { Body } from "./Body.js";
import * as edit from "./editing.js";
import { Runs } from "./Styled.js";
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

const MAX_QUOTE_LINES = 6;

/** The // of the /dev/null logo, then the name. */
export function Mark() {
  return (
    <Text bold>
      <Text color={colors.slash1}>/</Text>
      <Text color={colors.slash2}>/</Text> nullbox
    </Text>
  );
}

function Header({ replyTo, parent }: Pick<ComposerProps, "replyTo" | "parent">) {
  const { columns } = useWindowSize();
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
          <Body text={parent.body} width={columns - 4} maxLines={MAX_QUOTE_LINES} />
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The text, coloured as /dev/null will show it: code blocks highlighted (as soon as you open one), inline code and
 * @mentions picked out, and a dim gutter beside the lines of a block. The cursor is an inverse block.
 */
function Lines({ state, analysis, placeholder }: { state: edit.EditState; analysis: Analysis; placeholder: string }) {
  const prompt = <Text color={colors.blue}>{glyphs.prompt} </Text>;
  const { value, cursor } = state;
  const { styles, blocks } = analysis;

  if (value === "") {
    return (
      <Text>
        {prompt}
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }

  const inCode = (start: number) => blocks.some((block) => start >= block.codeStart && start < block.codeEnd + (block.closed ? 0 : 1));

  let offset = 0;
  return (
    <Box flexDirection="column">
      {value.split("\n").map((line, i) => {
        const start = offset;
        const end = start + line.length;
        offset = end + 1;
        const prefix = i === 0 ? prompt : inCode(start) ? <Text dimColor>{glyphs.quote} </Text> : <Text>{"  "}</Text>;
        return (
          <Text key={i}>
            {prefix}
            <Runs text={value} styles={styles} from={start} to={end} cursor={cursor >= start && cursor <= end ? cursor : undefined} />
          </Text>
        );
      })}
    </Box>
  );
}

/** Characters used against /dev/null's limit, once it's worth knowing. */
function Counter({ text }: { text: string }) {
  const used = length(text);
  if (used < MAX_LENGTH * 0.75) return null;
  const color = used > MAX_LENGTH ? "red" : used > MAX_LENGTH * 0.95 ? "yellow" : undefined;
  return (
    <Text color={color} dimColor={color === undefined}>
      {used.toLocaleString("en")}/{MAX_LENGTH.toLocaleString("en")}
    </Text>
  );
}

export function Composer({ replyTo, parent, initial, dryRun, onDone }: ComposerProps) {
  const { exit } = useApp();
  const [state, setState] = useState(() => edit.empty(initial));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const analysis = useMemo(() => analyze(state.value, { live: true }), [state.value]);
  // Inside a block, between its fences, enter and tab write code; close the block to send.
  const inBlock = analysis.blocks.some((block) => state.cursor >= block.codeStart && state.cursor <= (block.closed ? block.codeEnd : block.end));

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
    if (key.return && inBlock) return setState(edit.insert(state, "\n"));
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
    if (key.tab && inBlock && !key.shift) return setState(edit.insert(state, "\t"));
    if (key.tab || key.meta) return;

    if (input !== "") setState(edit.insert(state, input));
  });

  return (
    <Box flexDirection="column">
      <Header replyTo={replyTo} parent={parent} />
      <Box borderStyle="round" borderColor={colors.blue} paddingX={1}>
        <Lines state={state} analysis={analysis} placeholder="Write your reply…" />
      </Box>
      <Box paddingX={2} justifyContent="space-between" gap={1}>
        {confirmDiscard ? (
          <Text color="yellow">Press esc again to discard your reply.</Text>
        ) : inBlock ? (
          <Text dimColor wrap="truncate-end">
            <Text color={colors.slash2}>code</Text> · <Text bold>enter</Text> new line · <Text bold>tab</Text> indent · close with{" "}
            <Text bold>```</Text> to send
          </Text>
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
            <Text bold>enter</Text> {dryRun ? "sign" : "send"} · <Text bold>\⏎</Text> new line · <Text bold>```</Text> code ·{" "}
            <Text bold>esc</Text> cancel
          </Text>
        )}
        <Box flexShrink={0}>
          <Counter text={state.value} />
        </Box>
      </Box>
    </Box>
  );
}
