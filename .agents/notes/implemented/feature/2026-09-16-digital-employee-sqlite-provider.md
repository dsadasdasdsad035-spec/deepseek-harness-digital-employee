# Agent Note: Digital employee SQLite provider

Status: implemented

English | [中文](2026-09-16-digital-employee-sqlite-provider.zh.md)

## Problem

The digital employee provider seam had one implementation: a single JSON document rewritten under a writer lock. Memory is exactly the workload that format serves worst — the live deployment had already collected multiple writer classes (web service, headless employee runner, management remotes), every mutation rewrote the whole document, and the lock serialised unrelated processes. The seam promised backend replacement without consumer changes, but no second backend existed to prove it.

## Decision

`@deepseek-ai/dsh-digital-employee-sqlite` implements the full `DigitalEmployeeProvider` on `node:sqlite` and the web, headless-employee, and digital-employee-suite bundles now mount it instead of the file provider. The provider follows the session-persistence-sqlite discipline: a reserved `application_id`, a strict `user_version` with no migration, canonical schema-object comparison on every open, and ownership revalidation inside every write transaction. Cross-process coordination is SQLite's own lock and busy timeout, replacing the file lock.

The provider keeps promotion and retrieval policy identical to the file provider by construction: the authority algebra, memory ranking, portable-artifact parsing, audit redaction check, and the `employees.json` document parsers moved into `@deepseek-ai/dsh-digital-employee` (`domain.ts`, `document.ts`, `ids.ts`), and both providers call them. One-time legacy import: on first open with an empty database, a sibling `employees.json` is validated and imported in one transaction, then renamed `employees.json.imported`; a later manual database loss re-imports the archive.

The file provider stays in the repository: test fixtures pin it (their snapshots hand-write `employees.json` seeds), and the autonomous-task ledger packages (`task-attempts`, `task-events`, `whereabouts`) continue to live there.

## Alternatives considered

- **Split only the memory trio into its own backend seam**: `configureProvider` is single-slot and memory rows join instance lifecycle (cascade delete, export, import), so a split seam would fork employee data across two stores and change the provider interface for every consumer.
- **Keep the JSON document and add locks**: more coordination would not fix whole-document rewrites, and concurrent web plus headless writers remain the deployment reality.
- **Adopt an external memory engine (mem0)**: semantic retrieval was not the gap — no live write path existed — and it would add a network dependency and nondeterminism to keyless coverage.

## Consequences

Employee data now has one durable home per deployment with transactional multi-process writes; the SQLite backend is the shipped default while the file backend remains a test fixture. Retrieval semantics are unchanged (literal tag and content matching), so a retrieval upgrade remains a separate decision. The legacy import only runs against an empty database, and its parse rules are the shared document parsers, so format drift fails loudly at startup.
