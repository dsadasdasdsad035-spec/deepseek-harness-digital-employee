CREATE TABLE instances (
  id TEXT NOT NULL PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  display_name TEXT NOT NULL,
  personality TEXT,
  grants TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE memories (
  id TEXT NOT NULL PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL,
  sensitive INTEGER NOT NULL,
  expires_at TEXT,
  provenance TEXT NOT NULL
) STRICT;

CREATE TABLE audits (
  id TEXT NOT NULL PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  payload TEXT NOT NULL
) STRICT;
