import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { createBackupDirectory } from "./lib/backup-files.mjs";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("Set SUPABASE_DB_URL to the staging or production Postgres connection string.");
process.umask(0o077);
const directory = await createBackupDirectory("database");

async function dump(filename, flags = []) {
  const output = path.join(directory, filename);
  const child = spawn("npx", ["supabase", "db", "dump", "--db-url", databaseUrl, "--file", output, ...flags], { stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  if (exitCode !== 0) process.exit(exitCode || 1);
  const info = await stat(output);
  const contents = await readFile(output);
  if (info.size < 512) throw new Error(`${filename} was created but is unexpectedly small.`);
  return { filename, bytes: info.size, sha256: createHash("sha256").update(contents).digest("hex") };
}

const files = [
  await dump("schema.sql"),
  await dump("data.sql", ["--data-only", "--use-copy"]),
];
await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2)}\n`);
console.log(`Backup files and checksums verified: ${directory}. Recovery is NOT verified until a restore rehearsal passes.`);
