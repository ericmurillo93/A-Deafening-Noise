import { searchExternalConcertCatalog } from "./lib/concert-catalog-providers.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";


export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { Allow: "POST" }, body: "Method not allowed" };
  const auth = await requireArchiveUser(event, { quota: "catalog" });
  if (auth.error) return auth.error;
  const respond = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const criteria = JSON.parse(event.body || "{}");
    const concerts = await searchExternalConcertCatalog(criteria, process.env);
    return respond(200, { concerts, partial: Boolean(concerts.partial) });
  } catch (error) {
    return respond(400, { error: error.message || "Could not search concert providers." });
  }
}
