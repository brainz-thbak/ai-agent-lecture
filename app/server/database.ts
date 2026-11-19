import type { DatabaseSync } from 'node:sqlite'

export function transaction<T>(database: DatabaseSync, run: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = run()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function initializeDatabase(database: DatabaseSync) {
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000')

  transaction(database, () => {
    const version = database.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4) throw new Error('Unsupported metadata database version')
    if (version === 4) return

    if (version === 0) createTables(database)
    if (version === 1) database.exec('ALTER TABLE incidents ADD COLUMN created_at TEXT')

    if (version !== 3) database.exec('ALTER TABLE incidents ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1))')
    createEvidenceTables(database)
    database.exec('PRAGMA user_version = 4')
  })
}

function createEvidenceTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE evidence_items (
      case_no TEXT PRIMARY KEY,
      digest TEXT NOT NULL,
      evidence_title TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE VIEW artifact_view AS
      SELECT incident_id AS owner_key, file_id AS object_ref, name AS label
      FROM incident_attachments;

    CREATE TABLE export_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      requested_at TEXT NOT NULL,
      completed_at TEXT,
      manifest TEXT NOT NULL,
      result TEXT
    );

    CREATE TABLE search_index (
      attachment_hash TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      label TEXT NOT NULL,
      body TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE TABLE preview_cache (
      content_key TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );

    CREATE TABLE incident_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      attachment_count INTEGER NOT NULL DEFAULT 0,
      attachment_bytes INTEGER NOT NULL DEFAULT 0,
      closed_count INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO incident_stats (id) VALUES (1);

    CREATE TABLE audit_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      subject TEXT NOT NULL,
      evidence_ref TEXT,
      detail TEXT
    );

    CREATE TABLE notification_outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      sent_at TEXT
    );
  `)
}

function createTables(database: DatabaseSync) {
  const findTable = database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
  const hasIncidents = findTable.get('incidents')
  const hasReports = findTable.get('reports')
  if (hasIncidents) database.exec('ALTER TABLE incidents RENAME TO previous_incidents')
  if (hasReports) database.exec('ALTER TABLE reports RENAME TO previous_reports')

  database.exec(`
    CREATE TABLE incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      closed_at TEXT,
      created_at TEXT
    ) STRICT;

    CREATE TABLE incident_attachments (
      incident_id TEXT PRIMARY KEY REFERENCES incidents (id),
      name TEXT NOT NULL,
      file_id TEXT NOT NULL
    ) STRICT;

    CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_id TEXT NOT NULL,
      source_incident_id TEXT
    ) STRICT;
  `)

  if (hasIncidents) database.exec(`
    INSERT INTO incidents (id, title, closed_at)
    SELECT id, id, closed_at FROM previous_incidents;

    INSERT INTO incident_attachments (incident_id, name, file_id)
    SELECT id, attachment_name, attachment_digest FROM previous_incidents;

    DROP TABLE previous_incidents;
  `)
  if (hasReports) database.exec(`
    INSERT INTO reports (id, name, file_id)
    SELECT id, attachment_name, attachment_digest FROM previous_reports;

    DROP TABLE previous_reports;
  `)
}
