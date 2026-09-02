import fs from "node:fs/promises";
import { renderSuggestionDigest } from "./suggestion-email-template.mjs";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const key = ({ artist, date }) => `${normalize(artist)}|${date}`;

const reportPath = process.argv.find((argument) => argument.startsWith("--report="))?.slice(9);
const [currentPath] = process.argv.slice(2).filter((argument) => !argument.startsWith("--report="));
async function writeReport(report) { if (reportPath) await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
if (!currentPath) throw new Error("Pass the current suggestion file");
if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
  process.stdout.write("Email notifications skipped: Resend is not configured\n");
  process.exit(0);
}
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is required");
const catalogResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_concert_suggestions`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: "{}" });
if (!catalogResponse.ok) throw new Error(`Could not load the existing suggestion catalog (${catalogResponse.status})`);
const previous = new Set(((await catalogResponse.json()).suggestions || []).map(key));
const current = JSON.parse(await fs.readFile(currentPath, "utf8")).suggestions || [];
const added = current.filter((suggestion) => !previous.has(key(suggestion)));
if (!added.length) {
  await writeReport({ newSuggestionCount: 0, emailsSent: 0, emailsFailed: 0 });
  process.stdout.write("No new suggestions to notify\n");
  process.exit(0);
}
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_suggestion_notification_recipients`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: "{}" });
if (!response.ok) throw new Error(`Could not load notification recipients (${response.status})`);
const recipients = await response.json();
let sent = 0;
let failed = 0;
const deliveryDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
for (const recipient of recipients) {
  const artists = new Set(recipient.artists.map(normalize));
  const countries = new Set((recipient.countries || []).map((country) => String(country).toUpperCase()));
  const dismissed = new Set(recipient.dismissed);
  const concerts = new Set(recipient.concerts.map((concertKey) => { const split = concertKey.lastIndexOf("|"); return `${normalize(concertKey.slice(0, split))}${concertKey.slice(split)}`; }));
  const matches = added.filter((suggestion) => artists.has(normalize(suggestion.artist)) && countries.has(String(suggestion.country || "").toUpperCase()) && !dismissed.has(key(suggestion)) && !concerts.has(key(suggestion)));
  if (!matches.length) continue;
  const message = renderSuggestionDigest(recipient.displayName, matches);
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `suggestion-digest/${recipient.userId}/${deliveryDate}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [recipient.email], subject: message.subject, html: message.html, text: message.text, headers: { "List-Unsubscribe": "<https://adeafeningnoise.com/profile>" } }),
  });
  if (email.ok) sent += 1;
  else { failed += 1; process.stderr.write(`Warning: email to ${recipient.email} failed (${email.status})\n`); }
}
await writeReport({ newSuggestionCount: added.length, emailsSent: sent, emailsFailed: failed });
process.stdout.write(`Sent suggestion emails to ${sent} users\n`);
