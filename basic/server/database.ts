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
    if (version !== 0 && version !== 1 && version !== 2) throw new Error('Unsupported metadata database version')

    database.exec(`
      CREATE TABLE IF NOT EXISTS demo_reset_files (
        file_id TEXT PRIMARY KEY
      ) STRICT;
    `)
    if (version === 2) return
    if (version === 1) {
      database.exec('ALTER TABLE incidents ADD COLUMN created_at TEXT; PRAGMA user_version = 2')
      return
    }

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

    database.exec('PRAGMA user_version = 2')
  })
}
