# Implementation plan

## Shape

nullbox is a standalone CLI. It talks to /dev/null's HTTP API and signs with the user's local SSH key. It doesn't use a fork or the dev-null.sh source, and it doesn't download and run `dev-null.sh/commit`.

```text
  ~/.ssh / ssh-agent ──sign──┐
                             ▼
  ┌───────────┐  fetch   ┌────────┐  rank   ┌────────┐  pick + compose  ┌──────┐
  │ /dev/null │ ───────► │ source │ ──────► │ queue  │ ───────────────► │ send │ ──► /dev/null
  │    API    │          └────────┘         └────────┘                  └──────┘
  └───────────┘               ▲                  │
                              └──── state.json ◄─┘   (needs-reply / done / snoozed)
```

## Stack

- **TypeScript on Node 22+**, so `npx nullbox` works with nothing to install. Use built-in `fetch`.
- **Signing:** spawn `ssh-keygen -Y sign`. Prefer agent keys and fall back to `~/.ssh/*.pub` + private key, matching the official script. Never parse private keys in JS.
- **UI:** [Ink](https://github.com/vadimdemedes/ink) (React for the terminal, as Claude Code uses). It has an inline multi-line composer. The editing logic lives in `src/ui/editing.ts`, kept pure so it can be tested.
- **State:** `~/.config/nullbox/state.json` (XDG on Linux), holding `{ username, keyFingerprint, items: { [commitId]: { status, seenAt, repliedAt } }, cursors }`. It keeps no message bodies.
- **Tests:** vitest, with a recorded-fixture HTTP layer. The signing tests run against a throwaway ed25519 key generated in the test.

## Modules

```text
src/
  cli.ts          arg parsing: nullbox [inbox] | reply <hash> [msg] | login | status
  config.ts       paths, DEVNULL_URL override (https or localhost only, as the official script requires)
  ssh.ts          list candidate keys, key-lookup, sign(payload, namespace)
  api/
    http.ts       fetch wrapper: TLS only, no redirects, timeouts, error text sanitised
    cli.ts        POST /api/cli/key-lookups, POST /api/cli/commits
    public.ts     users/{u}/commits, commits/{id}
    signed.ts     device-signed /api/v1/* (behind a capability check)
  sources/
    public.ts     "new replies on your commits" from replies_count deltas
    notifications.ts  full notifications (once device sign-in exists)
  rank.ts         scoring → top 10
  state.ts        local needs-reply queue
  ui/inbox.ts     list, select, compose, confirm, send
```

## Milestones

### M0: Scaffold (½ day)
- package.json (`bin: nullbox`), tsconfig, vitest (`tsc --noEmit` is the linter for now), and a GitHub Actions CI on Node 22/24.
- `nullbox --version`.

### M1: Reply from the terminal (1–2 days)
- `ssh.ts`: candidate keys, key lookup and signing, a port of the official script's behaviour including its safety checks (refusing non-https, a sanitised output path, and a `reply_to` charset check).
- `nullbox reply <hash|url> [message]`: prompt if the message is missing, show a preview, confirm, then send.
- **Done when** a real reply posts to /dev/null, the test suite signs a fixture payload, and the payload verifies with `ssh-keygen -Y verify`.

### M2: Inbox from public data (1–2 days)
- `nullbox login` asks for your /dev/null username once. It's confirmed by the key lookup, which proves the key is yours.
- The source polls your recent commits, diffs `replies_count` against state, and queues "N new replies on <commit>".
- `nullbox` lists the top 10. Picking one shows the commit: `enter` replies to the thread and `o` opens it on dev-null.sh. Until M3, `o` is the only way to read what people actually said.
- Built: the source also reads who you follow (`GET /api/v1/users/{you}/following`) and their recent commits, so the list holds mentions of you, questions and busy threads, ranked as below. `d` marks an item done, and replying or opening an item marks it handled, in `state.json`.
- **Limit:** for your own commits we can see *that* someone replied, but not who or what they said. `o` opens the thread in the browser. M3 fixes this.

### M3: Full inbox (blocked upstream)
- Land a CLI sign-in flow in dev-null.sh (see [devnull-api.md](devnull-api.md#proposed-upstream-contribution)).
- `nullbox login` then creates a dedicated ed25519 key in `~/.config/nullbox/`, which is revocable in `settings/devices`, and runs the approval flow.
- `sources/notifications.ts`: fetch `type=replies,mentions,quotes`. Server-side read state doesn't matter because the local queue is the source of truth.
- Show the reply text, author and age. Reply in place with `parent_id`.

### M4: Polish
- `o` opens in the browser with `open` / `xdg-open`. When there's no display (over SSH), it prints the URL instead.
- `d` done, `s` snooze, `--json` output (which also feeds Waterline and MCP), `nullbox status` for a prompt or menu bar count.

## Ranking (v1: rules, not ML)

```text
score = base(type) × recency × relationship
  base:          direct reply to you 100 · mention with "?" 80 · mention 60 · reply in a thread you're in 40 · quote 30
  recency:       exp(-age_hours / 24)
  relationship:  ×1.3 if you follow them · ×1.1 if they follow you
excluded:        status ∈ {done, replied} locally · authors you've muted or blocked
```

Keep it explainable: `nullbox --why` prints each item's score breakdown.

## Decisions worth flagging

- **Why not shell out to `dev-null.sh/commit`?** Piping a remote script into bash on every send can change underneath us. Porting the protocol gives us a preview and confirm step, multi-line replies and tests.
- **Why a separate device key in M3?** Users can revoke it on its own, and the GitHub key's namespace stays `devnull-commit` only.
- **Why not grab `devnull://`?** That scheme is the official app's. Intercepting its auth codes would be a security problem, so we ask upstream for a proper CLI flow instead.
