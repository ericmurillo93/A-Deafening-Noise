import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("Set SUPABASE_DB_URL to the staging or production Postgres connection string.");
const stamp = new Date().toISOString().replaceAll(":", "-").replace(".000Z", "Z");
const directory = path.resolve(process.env.BACKUP_DIR || "backups", `a-deafening-noise-${stamp}`);
await mkdir(directory, { recursive: true });

async function dump(filename, flags = []) {
  const output = path.join(directory, filename);
  const child = spawn("npx", ["supabase", "db", "dump", "--db-url", databaseUrl, "--file", output, ...flags], { stdio: "inherit" });
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
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
console.log(`Verified backup: ${directory}`);
