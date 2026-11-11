import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated dev-mode sandbox — never touches /etc or /var.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-clean-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const cleanup = await import('../src/cleanup.js');

before(() => config.load());
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Write a file and make it look `hoursOld` hours old. */
function put(file, hoursOld, content = 'x'.repeat(100)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const t = new Date(Date.now() - hoursOld * 3600_000);
  fs.utimesSync(file, t, t);
  return file;
}

test('cleanup finds leftovers, leaves good and recent files alone, and removes only the leftovers', () => {
  const P = config.paths;
  const snaps = path.join(P.snapshotsDir, 'blog');
  const uploads = path.join(P.tmpDir, 'uploads');
  const stale = [
    put(path.join(P.backupsDir, 'autonode-backup-2026-01-01-00-00-00-auto.tar.gz.part'), 5),
    put(path.join(snaps, '20260101-000000-aaaa.tar.gz.part'), 5),
    put(path.join(snaps, '20260102-000000-bbbb.tar.gz'), 5), // no .json: never listed or pruned
    put(path.join(snaps, '20260103-000000-cccc.json'), 5), // no archive
    put(path.join(uploads, 'a'.repeat(16) + '.part'), 30),
    put(path.join(P.tmpDir, 'upload-123.bin'), 5),
  ];
  const importDir = path.join(P.tmpDir, 'import-abc');
  put(path.join(importDir, 'sites', 'blog', 'index.js'), 5);
  const old = new Date(Date.now() - 5 * 3600_000);
  fs.utimesSync(importDir, old, old);

  const kept = [
    put(path.join(P.backupsDir, 'autonode-backup-2026-01-01-00-00-01-manual.tar.gz'), 500), // a finished backup
    put(path.join(P.backupsDir, 'autonode-backup-2026-01-02-00-00-00-auto.tar.gz.part'), 0), // being written now
    put(path.join(snaps, '20260104-000000-dddd.tar.gz'), 500), // a complete snapshot…
    put(path.join(snaps, '20260104-000000-dddd.json'), 500), // …with its details
    put(path.join(uploads, 'b'.repeat(16) + '.part'), 5), // can still be resumed
    put(path.join(P.tmpDir, 'upload-456.bin'), 0), // staged for a restore just now
  ];

  const found = cleanup.scan();
  assert.deepEqual(Object.fromEntries(found.groups.map((g) => [g.id, g.count])), { backups: 1, snapshots: 1, orphans: 2, uploads: 1, temp: 2 });
  assert.equal(found.count, 7);
  assert.equal(found.size, 700);
  assert.ok(found.usage.snapshots >= 500 && found.usage.backups >= 300);

  const done = cleanup.clean();
  assert.deepEqual({ removed: done.removed, freed: done.freed, failed: done.failed }, { removed: 7, freed: 700, failed: [] });
  for (const f of [...stale, importDir]) assert.ok(!fs.existsSync(f), `${path.basename(f)} should be gone`);
  for (const f of kept) assert.ok(fs.existsSync(f), `${path.basename(f)} must be kept`);
  assert.ok(fs.existsSync(uploads), 'the uploads folder itself stays');

  assert.equal(cleanup.scan().count, 0);
  assert.deepEqual(cleanup.clean(), { removed: 0, freed: 0, failed: [] });
});
