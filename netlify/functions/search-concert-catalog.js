import { createHash } from "node:crypto";
import { searchExternalConcertCatalog } from "./lib/concert-catalog-providers.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";

const searchesByUser = new Map();

export async function handler(event) {
  const auth = await requireArchiveUser(event);
  if (auth.error) return auth.error;
  const respond = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const now = Date.now();
  const userKey = createHash("sha256").update(event.headers?.authorization || event.headers?.Authorization || "").digest("hex");
  const previous = searchesByUser.get(userKey);
  const usage = !previous || now - previous.startedAt >= 60_000 ? { startedAt: now, count: 1 } : { ...previous, count: previous.count + 1 };
  searchesByUser.set(userKey, usage);
  if (usage.count > 30) return respond(429, { error: "Too many catalog searches. Try again shortly." });
  try {
    const criteria = JSON.parse(event.body || "{}");
    return respond(200, { concerts: await searchExternalConcertCatalog(criteria, process.env) });
  } catch (error) {
    return respond(400, { error: error.message || "Could not search concert providers." });
  }
}
