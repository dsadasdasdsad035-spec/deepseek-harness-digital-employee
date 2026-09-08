# Agent Note: Account system (email login, first-boot bootstrap, web auth gate)

Status: implemented

English | [中文](2026-09-09-account-system.zh.md)

## Problem

The web surface (port 3080) had no user concept at all: anyone who could reach the port could operate employees, tasks, and sessions. As the product moves toward paid release, an account system is the foundation for monetization.

## Decision

Two capability seams. `ctx.email` (packages/email/email) is a transport-registry email seam: providers register plain-text SMTP transports (the built-in QQ SMTP runs smtp.qq.com:465 SSL with an authorization code as the password), credentials resolve through `SMTP_USER`/`SMTP_PASS` references, and send never rejects — unconfigured transports fail visibly with a reason. `ctx.userAccounts` (packages/account/user-accounts) is a SQLite user store: argon2id (OWASP baseline) hashing, email verification codes (10-minute single-use), reset tokens (15-minute single-use), HMAC-signed session cookies, and login rate limiting (5 failures locks the email for 15 minutes plus a per-IP window). Ephemeral state (sessions, codes, tokens, rate counters) is in-memory by design — restarts invalidate them and users re-authenticate.

The webserver gained a `registerGate` single seat (same shape as `registerFallback`): all unauthenticated traffic 302s to `/login`, with the allowlist centralized in the gate plugin. First boot with an empty store forces `/setup` owner creation; `allowRegistration` (default false) gates open registration; admin endpoints gate by role and the last owner cannot be disabled, deleted, or demoted. Forgot-password uses a reset link when SMTP is composed and degrades to admin-side reset otherwise — same fail-visible philosophy as the notification seam.

## Alternatives considered

- **WeChat scan-to-authorize a personal bot** — personal WeChat has no official bot API; protocol hacks (wechaty-class) violate Tencent ToS and risk account bans. Personal push goes through a ServerChan-style official-account relay instead, if ever needed.
- **JSON file for users** — password fields are security-sensitive and need unique constraints with concurrent writes; SQLite is the existing precedent (session-query).
- **Per-method gates in apiproxy RPC** — one webserver-level gate seat intercepts all unauthenticated traffic at HTTP dispatch; two allowlists (HTTP and RPC) would drift.

## Consequences

employee-account-system is 15/15: email seam (7 tests), account service (13 tests), and the gate HTTP layer (6 tests) all green over a real Loader-composed webserver; the live 3080 instance verified first-boot owner creation → login → workspace. Ephemeral in-memory state, single-node SQLite, no MFA/OAuth, and no usage-based billing are recorded boundaries; quota and payment are deferred to later phases.
