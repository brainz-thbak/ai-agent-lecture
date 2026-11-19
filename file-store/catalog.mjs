import { createHash } from 'node:crypto';
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
    // 같은 space 에서 같은 내용은 같은 ID 를 쓴다. created 는 이번 업로드로 새 파일을 만들었는지 나타낸다.
    put(space, originalName, content) {
      const spaceDirectory = join(directory, space);
      mkdirSync(spaceDirectory, { recursive: true });
      if (!lstatSync(spaceDirectory).isDirectory()) {
        throw new Error('The storage space must be a directory');
      }

      const id = createHash('sha256').update(content).digest('hex');
      const path = `${space}/${id}`;
      const target = join(directory, path);
      return transaction(() => {
        if (findFile.get(space, id, 'ready')) {
          return { id, created: false };
        }
        deleteFile.run(space, id);
        writeFileSync(target, content, { flush: true });
        insertFile.run(space, id, originalName, path, content.length, new Date().toISOString(), 'ready');
        return { id, created: true };
      });
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
