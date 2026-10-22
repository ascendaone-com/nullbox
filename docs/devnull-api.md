# /dev/null API notes

These notes come from reading the [dev-null.sh source](https://github.com/dev-null-sh/dev-null.sh) (`production` branch, 2026-10-23). The API is undocumented and changes quickly, so re-check these paths before relying on them.

## Two ways to authenticate

### 1. CLI commit signature (works for anyone, today)

This is what `curl -fsSL https://dev-null.sh/commit | bash` does.

1. `POST /api/cli/key-lookups` with a `text/plain` body of candidate public keys, one `"<type> <base64>"` per line. The response's first line is the key that's on your GitHub account.
2. Build the payload: `"<unix ts>\n<nonce hex>\n<reply_to>\n<message>"`. `reply_to` is a commit hash or a link, or empty.
3. `ssh-keygen -Y sign -n devnull-commit -f <key> payload`, then strip the armor lines and join the rest into one base64 string.
4. `POST /api/cli/commits` with `Content-Type: text/plain`, the payload as the body, and `X-SSH-Signature: <base64>`.

Images use the namespace `devnull-commit-images`, a multipart body, and an extra comma-separated SHA-256 line before the message. nullbox doesn't need images in v1.

Source: `https://dev-null.sh/commit`, `routes/api.php` (`cli` prefix), `app/Http/Middleware/AuthenticateSshSignature.php`.

### 2. Signed API request from an approved device (the mobile app only, today)

Every `/api/v1/*` request that needs a user is signed:

- Message: `"<ts>\n<nonce>\n<METHOD>\n<path?query>\n<body>"`. The body must be JSON or empty.
- Namespace: `devnull-api`.
- Headers: `X-Devnull-Timestamp`, `X-Devnull-Nonce`, `X-SSH-Signature`.
- The key must be an approved **device**. It doesn't need to be on GitHub, because the approval itself is the proof.

How a device gets approved:

1. The app opens `GET /mobile/authorize?fingerprint=SHA256:…&device_name=…&code_challenge=…&code_challenge_method=S256&state=…&redirect_uri=…` in a browser.
2. The user approves it, and the web redirects to `redirect_uri?code=…&state=…`.
3. The app calls `POST /api/v1/devices` with `{code, code_verifier}`, signed with the new key.

**The blocker:** `config/mobile.php` sets `redirect_uri_prefixes => ['devnull://']`. Only the official app's URL scheme can receive the code. A CLI has no legitimate way to finish this flow, and nullbox will not register `devnull://` on the user's machine to intercept codes meant for the app.

Source: `app/Services/SignedRequests.php`, `app/Http/Middleware/AuthenticateSignedRequest.php`, `app/Http/Requests/ShowMobileAuthorizationRequest.php`, `app/Http/Requests/CreateApiDeviceRequest.php`, `config/mobile.php`.

## Endpoints nullbox cares about

| Endpoint | Auth | Use |
| --- | --- | --- |
| `GET /api/v1/users/{username}/commits` | public | Your commits, with `replies_count`, `short_hash` and `html_url` |
| `GET /api/v1/commits/{id}` | public | One commit. There's no reply content when unsigned. |
| `GET /api/v1/commits/{id}/replies` | device | Replies to a commit (401 when unsigned) |
| `GET /api/v1/notifications?type=replies,mentions&through=…` | device | Grouped notifications. Types: `replies`, `quotes`, `stars`, `mentions`, `follows`, `moderation`. **Listing marks all of them read.** |
| `GET /api/v1/me` | device | Current user, `unread_notifications_count` |
| `POST /api/v1/commits` `{body, parent_id}` | device | Reply (JSON alternative to the CLI endpoint) |
| `GET /api/v1/remotes`, `…/@{user}/messages` | device | DMs ("remotes"), for later |
| `POST /api/cli/commits` | GitHub SSH key | Reply / post. This is the write path we use today. |

The `NotificationResource` fields are `id`, `type`, `subject_id`, `reason`, `read_at`, `created_at`, `actor`, `actors`, `group_id`, `event_count`, `actors_count`, `unread_count` and `commit` (which includes `parent` when visible).

## Proposed upstream contribution

To unblock the read side, open an issue and PR on dev-null.sh that adds a CLI sign-in flow. Two options, in order of preference:

1. **Loopback redirect (RFC 8252).** Allow `http://127.0.0.1:<port>/` as a `redirect_uri` prefix. nullbox starts a one-shot local listener, opens the browser, gets the code and redeems it with PKCE. This is the smallest change to the existing flow.
2. **Device code flow (RFC 8628).** nullbox shows a short code, and the user approves it at `dev-null.sh/device`. This works over SSH and on headless machines, but it needs new endpoints.

Either way, the device shows up in `settings/devices` and can be revoked there like the phone app.
