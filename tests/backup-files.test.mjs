import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertOutsideCheckout, createBackupDirectory } from "../scripts/lib/backup-files.mjs";
assert.throws(() => assertOutsideCheckout(process.cwd()));
assert.throws(() => assertOutsideCheckout(path.join(process.cwd(), "backups")));
const root = await fs.mkdtemp(path.join(os.tmpdir(), "adn-backup-test-"));
process.env.BACKUP_DIR = root;
try {
  const directory = await createBackupDirectory("test");
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  const linked = path.join(root, "repo");
  await fs.symlink(process.cwd(), linked);
  process.env.BACKUP_DIR = linked;
  await assert.rejects(createBackupDirectory("test"), /outside the repository/);
} finally { await fs.rm(root, { recursive: true, force: true }); }
