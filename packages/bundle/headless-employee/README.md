# `@deepseek-ai/dsh-headless-employee`

English | [中文](README.zh.md)

The unattended digital-employee task bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-headless`](../headless/README.md) and inserts the employee core (registry, durable file store, composing agent, example template), the goal autonomy trio ([`dsh-goal`](../../goal/goal/README.md), round driver, model-facing tools), the notification channels ([`dsh-notification`](../../interaction/notification/README.md) plus its three provider plugins), and this driver: `dsh --profile headless-employee --employee <id> "task"`.

The ordinary headless startup provider parses `--employee <id>` and `--task-key <key>`; with an employee selected, [`dsh-headless/employee`](../headless/src/employee-runner.ts) owns the run and the plain runner stands down. The driver composes the employee's root Agent (the same template semantics the Web surface serves), submits the task as the first user message with a bounded employee-memory retrieval, and arms the task text as a goal the round driver keeps pushing to a terminal phase.

The exit code is the contract for cron and wrappers: `0` goal complete, `2` blocked, `3` round-limit budget exhausted, `1` composition or usage failure. Attempts are keyed by `--task-key` (stable for duty rosters) or a hash of employee plus task text, and counted in `$DSH_HOME/digital-employees/task-attempts.json`: each attempt is a fresh session whose failure reason is promoted into employee memory (the next attempt's retrieval can see prior lessons), any completion resets the counter, and the configured ceiling (default 3 consecutive failures) suspends the task — further automatic attempts are refused with exit 1 until a human resumes — and, when `notifyChannel` is configured, sends one alert through that channel. Successful runs notify nothing.

Deployments drive scheduling themselves: crontab plus an `flock` wrapper prevents overlapping runs of the same key; the harness keeps no timers. Channel credentials resolve from environment references (`DSH_NOTIFY_FEISHU_URL`, `DSH_NOTIFY_FEISHU_SECRET`, `DSH_NOTIFY_WECOM_URL`, `DSH_NOTIFY_WEBHOOK_URL`) through the credentials service.

## Model Experience

### Goal rounds

#### What the model sees

The employee session receives the task, then the round driver injects a goal-round prompt after each quiescent turn until the model reports `complete` or `blocked` through the goal tools, or the round limit blocks the goal. Prior failed attempts surface through employee memory when the provider returns them.

#### Token effect

One goal tool description set plus one round prompt per continued round; bounded by `maxGoalRounds` (default 32).

#### KV Cache effect

None beyond the employee's own stable prefix; goal rounds arrive as ordinary user-plane messages after retained history.

## Known Limitations and Deferred Work

- **No dedicated resume CLI** — a suspended task is refused with exit 1; resume and discard live in the Web task console (`digitalEmployeeManagement` remotes), or a human can edit the ledger file directly.
- **No success digests** — duty-roster completions stay silent by design; summary notifications are deferred.
