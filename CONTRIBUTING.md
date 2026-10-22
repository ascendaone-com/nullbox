# Contributing to nullbox

Thanks for helping. nullbox is small on purpose, so a short issue before a big PR saves everyone time.

## Getting started

nullbox isn't scaffolded yet. Once it is:

```bash
git clone https://github.com/ascendaone-com/nullbox.git
cd nullbox
npm install
npm test
```

Read [docs/PLAN.md](docs/PLAN.md) for how the pieces fit, and [docs/devnull-api.md](docs/devnull-api.md) for the /dev/null endpoints we use.

## Ground rules

nullbox runs on someone's real /dev/null account, so every change has to respect the [/dev/null terms](https://dev-null.sh/terms):

- **A person sends every post.** Don't add auto-replies, scheduled posts, bulk actions, or anything that posts without someone pressing enter.
- **No generated replies.** nullbox doesn't write, suggest or rewrite reply text. Integrations such as MCP stay read-only.
- **Only official endpoints, within their limits.** Don't scrape HTML, don't poll faster than the web app does, and back off on `429`.
- **Keys stay local.** Never read, copy or send private keys. Signing goes through `ssh-keygen` or the SSH agent.
- **Store as little as possible.** Local state holds IDs and timestamps, not message bodies.

A PR that breaks one of these will be closed, however good the code is.

## Pull requests

- Keep each PR to one change, with tests. Signing changes need a test that checks the signature with `ssh-keygen -Y verify`.
- Run `npm test` and `npm run lint` before you push.
- If /dev/null's API has changed, update [docs/devnull-api.md](docs/devnull-api.md) in the same PR and link the upstream commit.

## Security

Please don't open public issues for security problems. Email security@ascenda.one instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
