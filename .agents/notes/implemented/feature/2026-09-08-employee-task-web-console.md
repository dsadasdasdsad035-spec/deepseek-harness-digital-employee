# Agent Note: Employee task console (Web management surface)

Status: implemented

English | [中文](2026-09-08-employee-task-web-console.zh.md)

## Problem

The autonomous-task path landed headless-only: a suspended task could only be cleared by hand-editing `$DSH_HOME/digital-employees/task-attempts.json`, and notification channels were configured through cordis.yml overlays invisible to Web users. The management loop was broken at exactly the two points a human touches — recovery after suspension, and channel configuration.

## Decision

The management gateway gains five remotes. The task-console trio (`listEmployeeTasks`, `resumeEmployeeTask`, `discardEmployeeTask`) folds the attempt ledger into console rows and mutates it inside the same cross-process `withFileLock` transaction the headless driver uses — the ledger's read-modify-write moved into `@deepseek-ai/dsh-digital-employee-file` as `withTaskAttempts`, so the runner and the host are two writers of one serialized file. Resume clears only the suspension flag and keeps the count (the next failure re-accumulates toward the ceiling — a natural "three more chances"); discard removes the record. Ledger records gain additive `displayName`/`employeeId` fields stamped by the driver; reads tolerate their absence because the ledger is cross-process runtime data, not an on-disk protocol. The channel pair (`describeNotificationChannels`, `testNotificationChannel`) surfaces the notification seam: channels expose an optional `credentials()` hook reporting reference/configured facts (never values), and the test send goes through the production `send` contract with a forced `[test]` title. The client registers one settings row and an autonomous-tasks block in the existing workspace Tasks tab; resume and discard run behind the same confirmation pattern as employee deletion. Scheduling stays deployment-side: resuming never starts a run.

## Alternatives considered

- **In-process memory locking for the ledger** — invisible to the cross-process writer pair; the file lock is the only serializations point both sides already share.
- **Host-owned ledger with runner reporting over IPC** — would make the headless runner depend on a live Web host, breaking unattended cron runs.
- **Polling/push for the tasks view** — deferred with the session-replay phase; the view refreshes on entry and after each action, which the ledger's small size makes sufficient.
- **Importing wire types from the management root** — rejected by the typert analyzer; task-console wire types live in `@deepseek-ai/dsh-digital-employee/types` beside their sibling request types.

## Consequences

The `employee-headless-tasks` gating promise ("deployment-side locking") is now satisfied in-repo; the headless-employee README drops that limitation. Assembly-level snapshot coverage extends to the console remotes: list → resume → list over the real management gateway inside the autonomous fixture, plus the labeled test send. Still deferred: session replay for task history, duty-roster success digests, and a dedicated resume CLI.
