# Roadmap

| Phase | What | Status |
| --- | --- | --- |
| **0.1** | `nullbox reply <hash> [msg]`: signed replies from the terminal, with no curl-pipe-bash | planned |
| **0.2** | `nullbox`: top-10 queue from public data ("new replies on your commits"), with a local needs-reply state | planned |
| **upstream** | CLI sign-in flow for dev-null.sh (a loopback redirect or device code), proposed as an issue and PR | to propose |
| **0.3** | Full inbox: replies, mentions and quotes, with text, author and age. Reply in place. | blocked on upstream |
| **0.4** | Done/snooze, `$EDITOR` compose, `--json`, `nullbox status` count | planned |
| **1.0** | Stable CLI, published to npm, announced on /dev/null | |
| **later** | [Waterline](https://www.ascendaflow.com/waterline?source=github-nullbox) integration (inbox on return from the screensaver, notify by default) | |
| **later** | Filters: prioritise topics you're interested in | |
| **later** | Read-only MCP server so Claude Code can tell you what's waiting. It has no posting tools. | |
| **later** | DMs ("remotes") | |

Non-goals: a /dev/null client for browsing feeds, popups while you're working, storing message content, and anything that posts without you or writes replies for you.
