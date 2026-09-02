import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("supabase/migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const sql = (await Promise.all(files.map((file) => readFile(path.join(directory, file), "utf8")))).join("\n").toLowerCase();
const tables = [...sql.matchAll(/create table(?: if not exists)?\s+public\.([a-z0-9_]+)/g)].map((match) => match[1]);
const missingRls = [...new Set(tables)].filter((table) => !new RegExp(`alter table public\\.${table} enable row level security`).test(sql));
const unsafeDefiners = [...sql.matchAll(/create(?: or replace)? function\s+([^\s(]+)[\s\S]*?\$\$/g)]
  .filter((match) => /security definer/.test(match[0]) && !/set search_path\s*=\s*''/.test(match[0]))
  .map((match) => match[1]);

if (missingRls.length || unsafeDefiners.length) {
  if (missingRls.length) console.error(`Tables missing RLS: ${missingRls.join(", ")}`);
  if (unsafeDefiners.length) console.error(`SECURITY DEFINER functions missing an empty search_path: ${unsafeDefiners.join(", ")}`);
  process.exit(1);
}
console.log(`Security audit passed: ${new Set(tables).size} tables use RLS and SECURITY DEFINER functions pin search_path.`);
