import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envFile = path.join(root, ".env.staging-sync.local");
const productionRef = "zhlcnidaymhaaskedbdx";
const stagingRef = "olqtafovoprkesxdbndp";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error("Missing .env.staging-sync.local. Copy .env.staging-sync.example and add both secret keys.");
  }
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function projectRefFromUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : "";
  } catch {
    return "";
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("replace_with_")) throw new Error(`${name} is not configured`);
  return value;
}

function client(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function allRows(supabase, table, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function deleteAll(supabase, table, column) {
  const { error } = await supabase.from(table).delete().not(column, "is", null);
  if (error) throw new Error(`Could not clear staging ${table}: ${error.message}`);
}

async function insertMany(supabase, table, rows, chunkSize = 250) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + chunkSize));
    if (error) throw new Error(`Could not populate staging ${table}: ${error.message}`);
  }
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count;
}

loadEnvFile(envFile);

const productionUrl = required("PRODUCTION_SUPABASE_URL");
const productionKey = required("PRODUCTION_SUPABASE_SECRET_KEY");
const stagingUrl = required("STAGING_SUPABASE_URL");
const stagingKey = required("STAGING_SUPABASE_SECRET_KEY");

if (projectRefFromUrl(productionUrl) !== productionRef) {
  throw new Error(`Source must be production project ${productionRef}`);
}
if (projectRefFromUrl(stagingUrl) !== stagingRef) {
  throw new Error(`Destination must be staging project ${stagingRef}`);
}
if (productionUrl === stagingUrl || productionKey === stagingKey) {
  throw new Error("Production and staging credentials must be different");
}

const production = client(productionUrl, productionKey);
const staging = client(stagingUrl, stagingKey);

process.stdout.write("Reading production data (production remains read-only)...\n");
const [profiles, concerts, participants, friendships, dismissals, stagingProfiles] = await Promise.all([
  allRows(production, "profiles", "email"),
  allRows(production, "concerts", "id"),
  allRows(production, "concert_participants", "concert_id"),
  allRows(production, "friendships", "id"),
  allRows(production, "dismissed_suggestions", "suggestion_key"),
  allRows(staging, "profiles", "email"),
]);

const stagingProfileByEmail = new Map(stagingProfiles.map((profile) => [profile.email.toLowerCase(), profile]));
const userIdMap = new Map();
const missingUsers = [];
for (const profile of profiles) {
  const stagingProfile = stagingProfileByEmail.get(profile.email.toLowerCase());
  if (!stagingProfile) missingUsers.push(profile.email);
  else userIdMap.set(profile.id, stagingProfile.id);
}
if (missingUsers.length) {
  throw new Error(`Create these Auth users in staging before syncing: ${missingUsers.join(", ")}`);
}

process.stdout.write(`Source: ${profiles.length} profiles, ${concerts.length} concerts, ${participants.length} attendances, ${friendships.length} friendships, ${dismissals.length} dismissals.\n`);
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
const confirmation = await prompt.question(`Type the staging project reference (${stagingRef}) to replace its application data: `);
prompt.close();
if (confirmation.trim() !== stagingRef) throw new Error("Sync cancelled; staging project reference did not match");

process.stdout.write("Clearing staging application data...\n");
await deleteAll(staging, "notifications", "id");
await deleteAll(staging, "concert_participants", "concert_id");
await deleteAll(staging, "friendships", "id");
await deleteAll(staging, "concerts", "id");
await deleteAll(staging, "dismissed_suggestions", "suggestion_key");

process.stdout.write("Updating staging profiles...\n");
for (const source of profiles) {
  const targetId = userIdMap.get(source.id);
  const profile = {
    email: source.email,
    display_name: source.display_name,
    is_admin: source.is_admin,
    username: source.username,
    role: source.role,
    discoverable: source.discoverable,
    avatar_url: source.avatar_url,
    city: source.city,
    country: source.country,
    account_status: source.account_status,
    updated_at: source.updated_at,
  };
  const { error } = await staging.from("profiles").update(profile).eq("id", targetId);
  if (error) throw new Error(`Could not update staging profile ${source.email}: ${error.message}`);
}

process.stdout.write("Copying concerts...\n");
const concertIdMap = new Map();
for (const source of concerts) {
  const row = {
    artist: source.artist,
    venue: source.venue,
    concert_date: source.concert_date,
    bought: source.bought,
    setlist_id: source.setlist_id,
    ticket_url: source.ticket_url,
    guest_attendees: source.guest_attendees,
    created_at: source.created_at,
    created_by: source.created_by ? userIdMap.get(source.created_by) : null,
  };
  if (source.created_by && !row.created_by) throw new Error(`Concert ${source.id} refers to an unknown creator`);
  const { data, error } = await staging.from("concerts").insert(row).select("id").single();
  if (error) throw new Error(`Could not copy concert ${source.id}: ${error.message}`);
  concertIdMap.set(source.id, data.id);
}

process.stdout.write("Copying attendance and friendships...\n");
await insertMany(staging, "concert_participants", participants.map((source) => {
  const concertId = concertIdMap.get(source.concert_id);
  const userId = userIdMap.get(source.user_id);
  const invitedBy = source.invited_by ? userIdMap.get(source.invited_by) : null;
  if (!concertId || !userId || (source.invited_by && !invitedBy)) throw new Error("Attendance contains an unmapped relationship");
  return {
    concert_id: concertId,
    user_id: userId,
    bought: source.bought,
    status: source.status,
    invited_by: invitedBy,
    guest_attendees: source.guest_attendees,
    created_at: source.created_at,
    confirmed_at: source.confirmed_at,
    visible_in_archive: source.visible_in_archive,
  };
}));
await insertMany(staging, "friendships", friendships.map((source) => {
  const requesterId = userIdMap.get(source.requester_id);
  const addresseeId = userIdMap.get(source.addressee_id);
  if (!requesterId || !addresseeId) throw new Error("Friendship contains an unmapped user");
  return {
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: source.status,
    created_at: source.created_at,
    updated_at: source.updated_at,
  };
}));
await insertMany(staging, "dismissed_suggestions", dismissals.map(({ suggestion_key, created_at }) => ({ suggestion_key, created_at })));

// Inserts can generate activity notifications. Staging intentionally starts without historical activity.
await deleteAll(staging, "notifications", "id");

const [stagingConcerts, stagingParticipants, stagingFriendships, stagingDismissals, stagingNotifications] = await Promise.all([
  countRows(staging, "concerts"),
  countRows(staging, "concert_participants"),
  countRows(staging, "friendships"),
  countRows(staging, "dismissed_suggestions"),
  countRows(staging, "notifications"),
]);
const expected = [concerts.length, participants.length, friendships.length, dismissals.length, 0];
const actual = [stagingConcerts, stagingParticipants, stagingFriendships, stagingDismissals, stagingNotifications];
if (expected.some((value, index) => value !== actual[index])) {
  throw new Error(`Verification failed. Expected ${expected.join("/")}, found ${actual.join("/")}`);
}

process.stdout.write(`Staging sync complete: ${stagingConcerts} concerts, ${stagingParticipants} attendances, ${stagingFriendships} friendships, ${stagingDismissals} dismissals, no historical notifications.\n`);
