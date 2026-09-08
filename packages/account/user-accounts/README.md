# @deepseek-ai/dsh-user-accounts

English | [中文](README.zh.md)

Account system for the DeepSeek Harness web surface: SQLite user store (node:sqlite), argon2id password hashing, email verification codes, single-use password-reset tokens, HMAC-signed session cookies, and login rate limiting (5 failures locks the email for 15 minutes; per-IP sliding window). Ephemeral state (sessions, codes, tokens, rate counters) is in-memory by design — restarts invalidate them and users re-authenticate.

The service registers as `ctx.userAccounts`. First boot with an empty store forces owner creation before the rest of the web surface is reachable; the `owner` role cannot be disabled, deleted, or demoted (last-owner protection). `allowRegistration` (default false) gates open registration; admin-created accounts bypass it.

## Web gate

The `./gate` subpath plugin mounts the web auth gate on the web surface: it redirects unauthenticated traffic to `/login` (302), keeps `/login`, `/register`, `/forgot`, `/reset`, `/api/auth/*`, and static assets public, and invalidates sessions on logout, password change, disable, and delete. The gate seat lives on the webserver (`registerGate`) — one seat, owned by the account layer, so composition cannot leave a hole.

## Admin endpoints

`/api/admin/users/*` (list, reset-password, set-disabled, delete, set-role) require an owner or admin session; last-owner protection blocks disabling, deleting, or demoting the final owner. Owner creation runs through `/api/auth/setup` on first boot.

## SMTP credentials

Mail sending is provided by the email seam's QQ SMTP transport; SMTP credentials resolve through credentials references `SMTP_USER` / `SMTP_PASS` — never from cordis.yml or code.

## Password hashing

argon2id with OWASP baseline parameters (64 MB memory, 2 iterations, parallelism 1). Hashes never leave the store module; views are hash-free.

## Model Experience

None, as this package stores and verifies accounts; it contributes no prompt content, tools, or session events.

#### KV Cache effect

None; account state never enters a model request.

## Known Limitations and Deferred Work

- **In-memory ephemeral state** — sessions, verification codes, and reset tokens die on restart; users re-authenticate.
- **Single-node store** — the SQLite users table is local to one harness home; multi-node deployments need a shared store.
- **No MFA / OAuth** — password login only; social login and multi-factor are deferred.
