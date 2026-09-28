// Deliberately staging-only: this helper cannot accept a production target.
import fs from "node:fs/promises";
import path from "node:path";
const ref = "olqtafovoprkesxdbndp";
const token = process.env.SUPABASE_ACCESS_TOKEN || (await fs.readFile(`${process.env.HOME}/.supabase/access-token`, "utf8")).trim();
const [mode, ...files] = process.argv.slice(2);
if (!["--apply", "--test"].includes(mode) || !files.length) throw new Error("Use --apply migrations.sql or --test rollback-test.sql (staging only)");
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Staging SQL failed: ${await response.text()}`);
  return response.json();
}
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
for (const file of files) {
  const sql = await fs.readFile(file, "utf8");
  if (mode === "--test") {
    if (!/^\s*begin;/i.test(sql) || !/rollback;\s*$/i.test(sql)) throw new Error("Database tests must begin a transaction and end with rollback");
    await query(sql);
  } else {
    const name = path.basename(file, ".sql");
    const version = name.match(/^\d{14}/)?.[0];
    if (!version || !path.resolve(file).startsWith(path.resolve("supabase/migrations") + path.sep)) throw new Error("Only checked-in migration paths are allowed");
    const existing = await query(`select version,name from supabase_migrations.schema_migrations where version=${quote(version)}`);
    if (existing.length) {
      if (existing[0].name !== name.slice(15)) throw new Error(`Migration version collision: ${version}`);
      console.log(`${name}: already applied to staging`); continue;
    }
    await query(`begin; ${sql}\n insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(version)},${quote(name.slice(15))},array[${quote(sql)}]); commit;`);
  }
  console.log(`${path.basename(file)}: verified on staging ${ref}`);
}
