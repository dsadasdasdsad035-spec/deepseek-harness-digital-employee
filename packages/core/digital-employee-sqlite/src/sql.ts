/**
 * Closed, package-owned SQL resource loading for the digital employee store.
 * @module @deepseek-ai/dsh-digital-employee-sqlite/sql
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/* jscpd:ignore-start -- the closed resource loader deliberately mirrors
 * session-persistence-sqlite/sql.ts; a shared SQLite medium helper is the
 * documented deferral shared by every node:sqlite backend. */
const SQL_RESOURCES = [
  'begin-immediate',
  'commit',
  'delete-instance',
  'delete-memory',
  'foreign-keys-on',
  'insert-audit',
  'insert-instance',
  'insert-memory',
  'journal-mode-delete',
  'journal-mode-persist',
  'journal-mode-truncate',
  'journal-mode-wal',
  'mmap-off',
  'rollback',
  'schema',
  'select-application-id',
  'select-audits-for-employee',
  'select-instance-exists',
  'select-instance',
  'select-instances',
  'select-any-instance',
  'select-memories-for-employee',
  'select-mmap-size',
  'select-schema-objects',
  'select-synchronous',
  'select-trusted-schema',
  'select-user-object-count',
  'select-user-version',
  'set-application-id',
  'set-user-version-1',
  'synchronous-full',
  'trusted-schema-off',
  'update-instance-state',
  'update-instance-upgrade',
] as const
/* jscpd:ignore-end */

/** A resource basename selected exclusively by package code. */
export type SqlResourceName = typeof SQL_RESOURCES[number]

const cache = new Map<SqlResourceName, string>()

/* jscpd:ignore-start -- the loader body deliberately mirrors
 * session-persistence-sqlite/sql.ts; see the resource-list note above. */
/**
 * Load an immutable SQL statement by closed resource name.
 * @param name - package-owned resource basename.
 * @returns the resource text.
 */
export function sql(name: SqlResourceName): string {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  const statement = readFileSync(
    fileURLToPath(new URL(`../resources/sql/${name}.sql`, import.meta.url)),
    'utf8',
  )
  cache.set(name, statement)
  return statement
}
/* jscpd:ignore-end */
