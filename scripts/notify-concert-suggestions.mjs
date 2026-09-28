import fs from "node:fs/promises";
import { renderSuggestionDigest } from "./suggestion-email-template.mjs";
import { normalize } from "./lib/suggestion-scraper-utils.mjs";
import { suggestionKey, legacySuggestionKey, isCurrentSuggestion, isDismissedSuggestion } from "../src/lib/suggestions.js";

const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice(9);
const currentPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, RESEND_API_KEY: resend, RESEND_FROM_EMAIL: from } = process.env;
if (!url || !key || !currentPath) throw new Error("Supabase service configuration and a catalog file are required");
if (!resend || !from) { console.log("Email delivery skipped: Resend is not configured"); process.exit(0); }
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function database(path, body) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`Digest database operation failed (${response.status})`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const current = (JSON.parse(await fs.readFile(currentPath, "utf8")).suggestions || []).filter((item) => isCurrentSuggestion(item));
const recipients = await database("rpc/get_suggestion_notification_recipients", {});
let sent = 0, failed = 0, newCount = 0;
for (const recipient of recipients) {
  const artists = new Set(recipient.artists.map(normalize));
  const concerts = new Set(recipient.concerts.map((entry) => { const split = entry.lastIndexOf("|"); return `${normalize(entry.slice(0, split))}${entry.slice(split)}`; }));
  const eligible = current.filter((item) => artists.has(normalize(item.artist)) && recipient.countries.includes(item.country) && !isDismissedSuggestion(item, recipient.dismissed) && !concerts.has(legacySuggestionKey(item)));
  const deliveries = await database(`suggestion_email_outbox?select=event_keys&user_id=eq.${encodeURIComponent(recipient.userId)}&status=neq.cancelled`);
  const seen = new Set(deliveries.flatMap((item) => item.event_keys));
  const matches = eligible.filter((item) => !seen.has(suggestionKey(item)));
  const rendered = renderSuggestionDigest(recipient.displayName, matches);
  const candidate = { from, to: [recipient.email], subject: rendered.subject, html: rendered.html, text: rendered.text, headers: { "List-Unsubscribe": "<https://adeafeningnoise.com/profile>" } };
  const delivery = await database("rpc/claim_suggestion_digest", { target_user: recipient.userId, candidate_keys: matches.map(suggestionKey), eligible_keys: eligible.map(suggestionKey), candidate_message: candidate });
  if (!delivery) continue;
  newCount += delivery.event_keys.length;
  let succeeded = false, definiteFailure = false, error = null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": `suggestion-delivery/${delivery.id}` },
      body: JSON.stringify(delivery.message),
    });
    succeeded = response.ok;
    definiteFailure = response.status >= 400 && response.status < 500 && response.status !== 409;
    error = succeeded ? null : `Resend ${response.status}`;
  } catch { error = "Delivery request interrupted"; }
  await database("rpc/complete_suggestion_digest", { delivery_id: delivery.id, claim_lease: delivery.lease, succeeded, definite_failure: definiteFailure, error_message: error });
  if (succeeded) sent += 1; else failed += 1;
  await new Promise((resolve) => setTimeout(resolve, 600));
}
if (reportPath) await fs.writeFile(reportPath, `${JSON.stringify({ newSuggestionCount: newCount, emailsSent: sent, emailsFailed: failed })}\n`);
console.log(`Suggestion deliveries: ${sent} sent, ${failed} awaiting retry/review`);
if (failed) process.exitCode = 1;
