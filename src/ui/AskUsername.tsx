import { Box, Text, useApp, useInput, usePaste } from "ink";
import { useState } from "react";
import { Mark } from "./Composer.js";
import * as edit from "./editing.js";
import { colors, glyphs } from "./theme.js";

/** Asked once, on the first run: whose inbox this is. Kept in ~/.config/nullbox/config.json. */
export function AskUsername({ onDone }: { onDone: (username: string | undefined) => void }) {
  const { exit } = useApp();
  const [state, setState] = useState(() => edit.empty());

  const finish = (username: string | undefined) => {
    onDone(username);
    exit();
  };

  usePaste((text) => setState((current) => edit.insert(current, text.replace(/\s/g, ""))));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) return finish(undefined);
    if (key.return) {
      const username = state.value.trim().replace(/^@/, "");
      if (/^[A-Za-z0-9-]+$/.test(username)) finish(username);
      return;
    }
    if (key.backspace || key.delete) return setState(edit.backspace(state));
    if (key.leftArrow) return setState(edit.left(state));
    if (key.rightArrow) return setState(edit.right(state));
    if (key.ctrl || key.meta || key.tab) return;
    if (/^[@A-Za-z0-9-]+$/.test(input)) setState(edit.insert(state, input));
  });

  const before = state.value.slice(0, state.cursor);
  const after = state.value.slice(state.cursor);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Mark />
        <Text dimColor> · first run</Text>
      </Box>
      <Text>What's your /dev/null username?</Text>
      <Text dimColor>It's public, and only used to read your commits and who you follow.</Text>
      <Box borderStyle="round" borderColor={colors.blue} paddingX={1} marginTop={1}>
        <Text>
          <Text color={colors.blue}>{glyphs.prompt} @</Text>
          {before}
          <Text inverse>{after[0] ?? " "}</Text>
          {after.slice(1)}
        </Text>
      </Box>
      <Text dimColor>
        {"  "}
        <Text bold>enter</Text> save · <Text bold>esc</Text> cancel
      </Text>
    </Box>
  );
}
