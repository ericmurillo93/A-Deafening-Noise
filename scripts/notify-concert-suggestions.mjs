import fs from "node:fs/promises";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const key = ({ artist, date }) => `${normalize(artist)}|${date}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const [previousPath, currentPath] = process.argv.slice(2);
if (!previousPath || !currentPath) throw new Error("Pass previous and current suggestion files");
if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
  process.stdout.write("Email notifications skipped: Resend is not configured\n");
  process.exit(0);
}
const previous = new Set((JSON.parse(await fs.readFile(previousPath, "utf8")).suggestions || []).map(key));
const current = JSON.parse(await fs.readFile(currentPath, "utf8")).suggestions || [];
const added = current.filter((suggestion) => !previous.has(key(suggestion)));
if (!added.length) {
  process.stdout.write("No new suggestions to notify\n");
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is required");
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_suggestion_notification_recipients`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: "{}" });
if (!response.ok) throw new Error(`Could not load notification recipients (${response.status})`);
const recipients = await response.json();
let sent = 0;
for (const recipient of recipients) {
  const artists = new Set(recipient.artists.map(normalize));
  const dismissed = new Set(recipient.dismissed);
  const concerts = new Set(recipient.concerts.map((concertKey) => { const split = concertKey.lastIndexOf("|"); return `${normalize(concertKey.slice(0, split))}${concertKey.slice(split)}`; }));
  const matches = added.filter((suggestion) => artists.has(normalize(suggestion.artist)) && !dismissed.has(key(suggestion)) && !concerts.has(key(suggestion)));
  if (!matches.length) continue;
  const items = matches.slice(0, 20).map((suggestion) => `<li><strong>${escape(suggestion.artist)}</strong> · ${escape(suggestion.date)}${suggestion.venue ? ` · ${escape(suggestion.venue)}` : ""}</li>`).join("");
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [recipient.email], subject: `${matches.length} new concert ${matches.length === 1 ? "suggestion" : "suggestions"}`, html: `<p>Hi ${escape(recipient.displayName)},</p><p>New concerts match artists you listen to:</p><ul>${items}</ul><p><a href="https://adeafeningnoise.com/suggestions">Review suggestions</a></p>` }),
  });
  if (email.ok) sent += 1;
  else process.stderr.write(`Warning: email to ${recipient.email} failed (${email.status})\n`);
}
process.stdout.write(`Sent suggestion emails to ${sent} users\n`);
