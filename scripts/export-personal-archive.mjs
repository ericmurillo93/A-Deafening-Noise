import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createBackupDirectory } from "./lib/backup-files.mjs";
import { STAGING_REF, PRODUCTION_REF, sqlString } from "./lib/staging-snapshot.mjs";

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const project = argument("project");
const username = argument("user");
if (!["staging", "production"].includes(project) || !username) throw new Error("Use --project=staging|production --user=username. Read-only export; never changes the database.");
const ref = project === "staging" ? STAGING_REF : PRODUCTION_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN || (await fs.readFile(`${process.env.HOME}/.supabase/access-token`, "utf8")).trim();
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", signal: AbortSignal.timeout(60000),
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  // The API's read-only role cannot execute authenticated RPCs. Enforce read-only
  // at the Postgres transaction level, then assume only the authenticated role.
  body: JSON.stringify({ query: `begin read only;
    select set_config('request.jwt.claim.sub',(select id::text from public.profiles where username=${sqlString(username)}),true);
    select set_config('request.jwt.claim.role','authenticated',true);
    set local role authenticated;
    select public.export_my_data() as archive;
    commit;` }),
});
if (!response.ok) throw new Error(`Read-only archive export failed (${response.status})`);
const rows = await response.json();
const archive = rows.find((row) => row.archive)?.archive;
if (archive?.schemaVersion !== 2 || !Array.isArray(archive.concerts)) throw new Error("Portable export is unavailable. Apply the versioned export migration to this environment first.");
const directory = await createBackupDirectory(`archive-${project}`);
const contents = `${JSON.stringify(archive, null, 2)}\n`;
const file = path.join(directory, "archive.json");
await fs.writeFile(file, contents, { flag: "wx", mode: 0o600 });
const manifest = { createdAt: new Date().toISOString(), project: ref, scope: "personal archive; not Auth, Vault, uploaded files or full platform recovery", concerts: archive.concerts.length, files: [{ filename: "archive.json", sha256: createHash("sha256").update(contents).digest("hex") }] };
await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(`Read-only export: ${archive.concerts.length} concerts. Private files: ${directory}`);
