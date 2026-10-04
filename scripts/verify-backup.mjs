import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { assertOutsideCheckout } from "./lib/backup-files.mjs";

export async function verifyBackup(input) {
  if (!input) throw new Error("Usage: node scripts/verify-backup.mjs /absolute/private/backup-directory");
  const directory = await realpath(input);
  assertOutsideCheckout(directory);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid backup manifest");
  for (const file of manifest.files) {
    if (!file.filename || path.basename(file.filename) !== file.filename) throw new Error("Invalid backup filename");
    const filename = await realpath(path.join(directory, file.filename));
    if (path.dirname(filename) !== directory) throw new Error("Backup file escapes its directory");
    const data = await readFile(filename);
    if ((file.bytes !== undefined && data.length !== file.bytes) || createHash("sha256").update(data).digest("hex") !== file.sha256) throw new Error(`Checksum mismatch: ${file.filename}`);
  }
  return manifest.files.length;
}
if (import.meta.main) {
  const count = await verifyBackup(process.argv[2]);
  console.log(`${count} files are intact. A restore rehearsal is still required to verify recoverability.`);
}
