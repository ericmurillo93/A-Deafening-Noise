import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { createHash } from "node:crypto";
import { STAGING_REF, PRODUCTION_REF, SNAPSHOT_TABLES, remapSnapshot, restoreSql } from "./lib/staging-snapshot.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN || (await fs.readFile(`${process.env.HOME}/.supabase/access-token`, "utf8")).trim();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function query(ref, sql, readOnly = true) {
  if (![STAGING_REF,PRODUCTION_REF].includes(ref) || (!readOnly && ref!==STAGING_REF)) throw new Error("Writes are restricted to staging");
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method:"POST", headers, body:JSON.stringify({query:sql,read_only:readOnly}), signal:AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Snapshot operation failed (${response.status}); transaction was not committed`);
  return response.json();
}
const snapshotQuery = `select jsonb_build_object(${SNAPSHOT_TABLES.map((table)=>`'${table}',(select coalesce(jsonb_agg(t),'[]') from public.${table} t)`).join(",")}) as snapshot`;
console.log("Reading application snapshots; production remains read-only...");
const [source, before, schema, generated] = await Promise.all([
  query(PRODUCTION_REF,snapshotQuery), query(STAGING_REF,snapshotQuery),
  query(STAGING_REF,"select table_name,column_name from information_schema.columns where table_schema='public' and is_generated='NEVER' order by ordinal_position"),
  query(PRODUCTION_REF,"select table_name,column_name from information_schema.columns where table_schema='public' and is_generated<>'NEVER'"),
]);
const columns = Object.fromEntries(SNAPSHOT_TABLES.map((table)=>[table,schema.filter((row)=>row.table_name===table).map((row)=>row.column_name)]));
// Generated columns are recomputed by Postgres, not copied.
for (const snapshot of [source[0].snapshot,before[0].snapshot]) for (const table of SNAPSHOT_TABLES) snapshot[table]=snapshot[table].map((row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!generated.some((column)=>column.table_name===table && column.column_name===key))));
const mapped = remapSnapshot(source[0].snapshot,before[0].snapshot.profiles);
const sql = restoreSql(mapped,columns,{rollback:process.argv.includes("--rehearse")});
await fs.mkdir("backups",{recursive:true,mode:0o700});
const filename=`backups/staging-before-sync-${Date.now()}.json`;
const backup=JSON.stringify(before[0].snapshot);
await fs.writeFile(filename,backup,{mode:0o600});
await fs.writeFile(`${filename}.sha256`,createHash("sha256").update(backup).digest("hex"),{mode:0o600});
const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
const confirmation=await prompt.question(`Type ${STAGING_REF} to ${process.argv.includes("--rehearse") ? "rehearse and roll back" : "replace staging application data atomically"}: `);prompt.close();
if(confirmation.trim()!==STAGING_REF) throw new Error("Cancelled; no database changes made");
await query(STAGING_REF,sql,false);
console.log(`Snapshot ${process.argv.includes("--rehearse") ? "rehearsed and rolled back" : "restored"}. Pre-change backup: ${filename}. Auth passwords, Spotify connections and storage remain independent.`);
