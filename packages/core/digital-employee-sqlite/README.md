# @deepseek-ai/dsh-digital-employee-sqlite

English | [中文](README.zh.md)

SQLite-backed Provider for `@deepseek-ai/dsh-digital-employee`. It stores employee instances, long-term memories, and audit records in one owner-only database at `$DSH_HOME/digital-employees/employees.db`, with the same promotion and retrieval policy as the file Provider.

## Configuration

- `path` selects an explicit database path; the in-process `:memory:` sentinel opens a non-durable database.
- `dshHome` selects the Harness home used by the default `$DSH_HOME/digital-employees/employees.db` path.
- `allowSensitiveMemory` permits sensitive long-term promotion and defaults to `false`.
- `maxRetentionDays` caps requested retention and defaults to `3650`.
- `journalMode` selects the SQLite `journal_mode` pragma and defaults to `wal`; rollback modes suit filesystems where WAL shared-memory files do not work.
- `busyTimeoutMs` caps the wait for a competing SQLite lock and defaults to `5000`.

The database opens with `trusted_schema = OFF`, `mmap_size = 0`, `foreign_keys = ON`, and `synchronous = FULL`. Schema ownership is stamped with a reserved `application_id` and `user_version`; an unversioned file, a foreign application id, a wrong version, or any schema-object drift fails plugin startup. Every write transaction revalidates ownership before mutating, so a headless employee process and the web service can share one database without a file lock.

On first open with an empty database, a legacy `employees.json` document beside the database is imported in one transaction and renamed to `employees.json.imported`. Unparseable or invalid legacy content fails the startup; after a manual database loss the remaining archive is imported again.

Memory retrieval and promotion policy match the file Provider exactly: ranking by exact tag, partial tag, then content match with provenance-time and memory-ID tie-breaks, and rejection of missing ownership, duplicate normalized content, unpermitted sensitive candidates, and retention above `maxRetentionDays`. Employee deletion cascades to the employee's memories and audits.

## Model Experience

### Resolved employee data

#### What the model sees

Consumers may render the Provider's resolved identity, authority, and employee-owned memory from `digital-employee/*` Session events.

#### Token effect

The Provider adds no tokens directly; the Consumer controls the bounded memory content included in a request.

#### KV Cache effect

Changes to resolved identity, authority, or retrieved memory may change Consumer-owned prompt prefixes.

## Known Limitations and Deferred Work

- **Literal retrieval** - memory ranking is exact and partial tag plus content matching; semantic or embedding-based retrieval remains deferred until a live write path exists to feed it.
- **Single process connection** - each provider instance owns one SQLite connection; multi-process access coordinates through SQLite locking, not shared in-memory state.
