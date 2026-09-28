import { searchExternalConcertCatalog } from "./lib/concert-catalog-providers.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";


export async function handler(event) {
  const auth = await requireArchiveUser(event, { quota: "catalog" });
  if (auth.error) return auth.error;
  const respond = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const criteria = JSON.parse(event.body || "{}");
    return respond(200, { concerts: await searchExternalConcertCatalog(criteria, process.env) });
  } catch (error) {
    return respond(400, { error: error.message || "Could not search concert providers." });
  }
}
