# Agent Note: Employee autonomous tasks (headless entry, exit-code contract, attempt ledger, notification seam)

Status: implemented

English | [中文](2026-09-07-employee-autonomous-tasks.zh.md)

## Problem

Digital employees could only be started from the Web surface, ran one message to quiescence, and had no unattended story: deployment-side cron had no employee-aware CLI entry, no machine-readable terminal state, no retry policy, and no way to tell a human when a task kept failing.

## Decision

Four additions compose the unattended path. (1) The headless startup provider parses `--employee <id>` and `--task-key <key>`; an employee selection hands the run to `@deepseek-ai/dsh-headless/employee` while the plain runner stands down. The driver composes the employee's root Agent through `digitalEmployeeAgent.createTask` (first user message plus bounded memory retrieval), then arms the task text as a goal — `goals.create` auto-arms — so the existing round driver owns continuation. (2) The exit code is the cron contract: 0 goal complete, 2 blocked, 3 round-limit budget, 1 composition/usage/suspended; `round-limit` is the round driver's own blocked code and gets its own code. (3) Attempts are keyed by `--task-key` or a hash of employee+task and counted in `$DSH_HOME/digital-employees/task-attempts.json` (atomic temp+rename writes): fresh session per attempt, failure reason promoted into employee memory so the next attempt's retrieval sees prior lessons, completion resets the counter, and reaching the ceiling (default 3) suspends the task — later automatic attempts are refused with exit 1 — and sends one alert when `notifyChannel` is configured. Suspension is a ledger state, not goal `paused`: goals live inside one session; the ledger is the only cross-attempt home. (4) `@deepseek-ai/dsh-notification` is a channel-registry seam whose `send()` never rejects (unknown channel or throwing channel → visible failure result). The three providers share one webhook pipeline (credential resolution through `ctx.credentials`, bounded retries, per-attempt timeout) with per-dialect request/response interpretation; WeChat Work bots authenticate by URL key only (the platform defines no request signing — verified against the official docs), Feishu custom bots sign with HMAC-SHA256 keyed by `timestamp\nsecret` over empty data. Channel URLs/secrets live only in credential references, never in cordis.yml.

Scheduling stays deployment-side by decision: crontab plus `flock` owns timing and overlap; the harness keeps no timers. `workspace-write` + `never` is the recommended unattended posture — out-of-scope operations fail deterministically instead of blocking on a prompt nobody will answer.

## Alternatives considered

- **Splitting the employee suite into a shared core layer reused by Web and headless** — cleaner long-term but churns a published bundle; the thin `dsh-headless-employee` bundle over `dsh-headless` adds the surface without touching the Web assembly. Revisit if the Web side wants goal rounds.
- **Counting retries through session continuation or goal `paused`** — rejected: cron starts a fresh process each time, and goal lifecycle is single-session by construction.
- **Harness-side cron triggers** — deferred entirely; ACP already serves programmatic starts, and cron-in-harness adds a timer/lifecycle surface deployments already own.

## Consequences

The assembled keyless snapshot (`examples/headless-agent/tests/employee-autonomous.snapshot.ts`) covers the full unattended path over a scripted mock model inside the real assembly: complete→exit 0 with a cleared silent ledger, round-limit→exit 3 with the failure recorded, and third-failure suspension with the channel alert. The mount-level plugin tests cover the driver's logic in isolation, and startup parsing is covered over a real Loader tree. The `dsh employee-task resume` command and duty-roster success digests are deferred. The ledger is a single atomically written JSON file: concurrent same-key runs require deployment-side locking. Fixing the stale gate failures from the archived market change (four undeclared `examples/package.json` dependencies, two missing host-aggregate project references) rode along because `verify-cordis-config` blocked every later change.
