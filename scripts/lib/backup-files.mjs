import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const checkout = fileURLToPath(new URL("../../", import.meta.url));
export function assertOutsideCheckout(directory) {
  const relative = path.relative(path.resolve(checkout), path.resolve(directory));
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Backups must be saved outside the repository. Set BACKUP_DIR to a private directory.");
  }
}
export async function createBackupDirectory(label) {
  const root = path.resolve(process.env.BACKUP_DIR || path.join(os.homedir(), "adn-backups"));
  assertOutsideCheckout(root);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  assertOutsideCheckout(await fs.realpath(root));
  const directory = path.join(root, `${label}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(directory, { mode: 0o700 });
  return directory;
}
