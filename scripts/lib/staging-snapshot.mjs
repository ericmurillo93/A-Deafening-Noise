export const STAGING_REF = "olqtafovoprkesxdbndp";
export const PRODUCTION_REF = "zhlcnidaymhaaskedbdx";
// Dependency order; account credentials, Vault, deliveries and historical activity are not cloned.
export const SNAPSHOT_TABLES = ["profiles", "concerts", "concert_artists", "concert_sources", "concert_participants", "friendships", "stats_shares", "bucket_list_artists", "user_listened_artists", "user_dismissed_suggestions", "concert_suggestion_catalog", "artist_images"];
export const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function remapSnapshot(source, stagingProfiles) {
  const byEmail = new Map(stagingProfiles.map((profile) => [profile.email.toLowerCase(), profile.id]));
  const ids = new Map(source.profiles.map((profile) => {
    const id = byEmail.get(profile.email.toLowerCase());
    if (!id) throw new Error("Every source user must already have a staging Auth account before copying data");
    return [profile.id, id];
  }));
  const map = (value) => Array.isArray(value) ? value.map(map) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,map(item)])) : ids.get(value) || value;
  return map(source);
}

export function restoreSql(snapshot, columns, { rollback = false } = {}) {
  for (const table of SNAPSHOT_TABLES) {
    if (!Array.isArray(snapshot[table]) || !columns[table]?.length) throw new Error(`Incomplete snapshot/schema: ${table}`);
    for (const row of snapshot[table]) for (const key of Object.keys(row)) if (!columns[table].includes(key)) throw new Error(`Staging schema is missing ${table}.${key}; migrate before copying`);
  }
  const statements = ["begin;", "set local lock_timeout='10s';", "set local statement_timeout='90s';"];
  // Disable application triggers only, never foreign-key constraints. Restored atomically on rollback/error.
  for (const table of SNAPSHOT_TABLES) statements.push(`alter table public.${table} disable trigger user;`);
  statements.push("delete from public.notifications;", "delete from public.suggestion_email_outbox;");
  for (const table of [...SNAPSHOT_TABLES].reverse().filter((table)=>table!=="profiles")) statements.push(`delete from public.${table};`);
  for (const table of SNAPSHOT_TABLES) {
    const names = columns[table].map((name) => `"${name}"`);
    const rows = snapshot[table];
    if (!rows.length) continue;
    const conflict = table === "profiles" ? ` on conflict(id) do update set ${columns[table].filter((key)=>key!=="id").map((key)=>`"${key}"=excluded."${key}"`).join(",")}` : "";
    statements.push(`insert into public.${table} (${names}) overriding system value select ${names} from jsonb_populate_recordset(null::public.${table},${sqlString(JSON.stringify(rows))}::jsonb)${conflict};`);
    if (table !== "profiles") statements.push(`do $$ begin if (select count(*) from public.${table})<>${rows.length} then raise exception 'Snapshot row verification failed: ${table}'; end if; end $$;`);
  }
  for (const table of SNAPSHOT_TABLES) statements.push(`alter table public.${table} enable trigger user;`);
  // Identity sequences are not transactional; only advance after the rehearsal, never during it.
  if (!rollback) for (const table of ["concerts","concert_sources","bucket_list_artists"]) statements.push(`do $$ declare seq text:=pg_get_serial_sequence('public.${table}','id'); maximum bigint; begin if seq is not null then select max(id)::bigint into maximum from public.${table}; perform setval(seq,greatest(coalesce(maximum,1),1),maximum is not null); end if; end $$;`);
  statements.push(rollback ? "rollback;" : "commit;");
  return statements.join("\n");
}
