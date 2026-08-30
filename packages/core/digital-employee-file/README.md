# @deepseek-ai/dsh-digital-employee-file

English | [中文](README.zh.md)

File-backed Provider for `@deepseek-ai/dsh-digital-employee`. It stores employee instances, long-term memories, and audit records in one owner-only versioned JSON document under `$DSH_HOME/digital-employees`.

## Configuration

- `path` selects an explicit document path.
- `dshHome` selects the Harness home used by the default `$DSH_HOME/digital-employees/employees.json` path.
- `allowSensitiveMemory` permits sensitive long-term promotion and defaults to `false`.
- `maxRetentionDays` caps requested retention and defaults to `3650`.

Writes hold a sibling writer lock and publish complete documents by atomic rename. Existing malformed documents and unknown schema versions fail plugin startup. Employee resolution requires an active instance and its exact registered template version.

Memory retrieval filters by employee ownership and requested scopes before ranking case-insensitive matches. Exact tag matches precede partial tag matches and content matches; ties use provenance time and memory ID before the explicit result limit is applied.

Promotion rejects missing employee ownership, duplicate normalized content, sensitive candidates when `allowSensitiveMemory` is false, and retention periods above `maxRetentionDays`. Policy failures return a rejected decision; accepted candidates become long-term records with provenance and optional expiration.

## Model Experience

### Resolved employee data

#### What the model sees

Consumers may render the Provider's resolved identity, authority, and employee-owned memory from `digital-employee/*` Session events.

#### Token effect

The Provider adds no tokens directly; the Consumer controls the bounded memory content included in a request.

#### KV Cache effect

Changes to resolved identity, authority, or retrieved memory may change Consumer-owned prompt prefixes.

## Known Limitations and Deferred Work

- **Single JSON document** - large employee fleets will require an alternative database Provider; the Service Definition permits that replacement without changing Consumers.
