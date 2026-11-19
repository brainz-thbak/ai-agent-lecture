import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const spacePattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const fileIdPattern = /^[a-f0-9]{64}$/;

function registerExistingFiles(directory, insertFile) {
  for (const space of readdirSync(directory, { withFileTypes: true })) {
    if (!space.isDirectory() || !spacePattern.test(space.name)) {
      continue;
    }
    const spaceDirectory = join(directory, space.name);
    for (const entry of readdirSync(spaceDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !fileIdPattern.test(entry.name)) {
        continue;
      }
      const file = lstatSync(join(spaceDirectory, entry.name), { throwIfNoEntry: false });
      if (file?.isFile()) {
        const path = `${space.name}/${entry.name}`;
        insertFile.run(space.name, entry.name, null, path, file.size, file.mtime.toISOString(), 'ready');
      }
    }
  }
}

export function openCatalog(directory) {
  mkdirSync(directory, { recursive: true });
  const database = new DatabaseSync(join(directory, 'metadata.sqlite'), { timeout: 5000 });
  database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      space TEXT NOT NULL,
      id TEXT NOT NULL,
      original_name TEXT,
      path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'deleting')),
      PRIMARY KEY (space, id)
    ) STRICT;
  `);

  const insertFile = database.prepare(`
    INSERT INTO files (space, id, original_name, path, bytes, uploaded_at, state)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (space, id) DO NOTHING
  `);
  const findFile = database.prepare(`
    SELECT id, original_name AS originalName, path, bytes, uploaded_at AS uploadedAt
    FROM files WHERE space = ? AND id = ? AND state = ?
  `);
  const setState = database.prepare('UPDATE files SET state = ? WHERE space = ? AND id = ? AND state = ?');
  const deleteFile = database.prepare('DELETE FROM files WHERE space = ? AND id = ?');
  const spaceUsage = database.prepare(`
    SELECT COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes
    FROM files WHERE space = ? AND state = 'ready'
  `);

  function transaction(operation) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function removeFile(space, file) {
    rmSync(join(directory, file.path), { force: true });
    deleteFile.run(space, file.id);
  }

  transaction(() => {
    if (database.prepare('PRAGMA user_version').get().user_version === 0) {
      registerExistingFiles(directory, insertFile);
      database.exec('PRAGMA user_version = 1');
    }
    const interruptedFiles = database.prepare(`
      SELECT space, id, path FROM files WHERE state IN ('pending', 'deleting')
    `).all();
    for (const file of interruptedFiles) {
      removeFile(file.space, file);
    }
  });

  return {
    put(space, originalName, content) {
      const spaceDirectory = join(directory, space);
      mkdirSync(spaceDirectory, { recursive: true });
      if (!lstatSync(spaceDirectory).isDirectory()) {
        throw new Error('The storage space must be a directory');
      }

      for (;;) {
        const id = randomBytes(32).toString('hex');
        const path = `${space}/${id}`;
        const target = join(directory, path);
        if (lstatSync(target, { throwIfNoEntry: false })) {
          continue;
        }
        const uploadedAt = new Date().toISOString();
        if (!insertFile.run(space, id, originalName, path, content.length, uploadedAt, 'pending').changes) {
          continue;
        }

        try {
          const published = transaction(() => {
            if (!findFile.get(space, id, 'pending')) {
              return false;
            }
            writeFileSync(target, content, { flag: 'wx', flush: true });
            setState.run('ready', space, id, 'pending');
            return true;
          });
          if (published) {
            return id;
          }
        } catch (error) {
          transaction(() => {
            const file = findFile.get(space, id, 'pending');
            if (file) {
              if (error.code === 'EEXIST') {
                deleteFile.run(space, id);
              } else {
                removeFile(space, file);
              }
            }
          });
          if (error.code !== 'EEXIST') {
            throw error;
          }
        }
      }
    },

    get(space, id) {
      return findFile.get(space, id, 'ready');
    },

    remove(space, id) {
      setState.run('deleting', space, id, 'ready');
      transaction(() => {
        const file = findFile.get(space, id, 'deleting');
        if (file) {
          removeFile(space, file);
        }
      });
    },

    usage(space) {
      return spaceUsage.get(space);
    },
  };
}
