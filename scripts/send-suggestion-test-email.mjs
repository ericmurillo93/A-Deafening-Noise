import fs from "node:fs/promises";
import { renderSuggestionDigest } from "./suggestion-email-template.mjs";

const required = (name) => {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
};
const normalize = (value) => String(value || "").trim().toUpperCase();
const artist = normalize(process.argv[2] || "YUNG BEEF");
const suggestions = JSON.parse(await fs.readFile("data/suggestions.json", "utf8")).suggestions || [];
const suggestion = suggestions.find((item) => normalize(item.artist) === artist);
if (!suggestion) throw new Error(`${artist} is not in data/suggestions.json`);

const supabaseUrl = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=email,display_name&role=eq.admin&account_status=eq.active&limit=1`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
if (!profileResponse.ok) throw new Error(`Could not load the administrator (${profileResponse.status})`);
const [administrator] = await profileResponse.json();
if (!administrator?.email) throw new Error("No active administrator was found");

const message = renderSuggestionDigest(administrator.display_name, [suggestion]);
const emailResponse = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${required("RESEND_API_KEY")}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `suggestion-test/${process.env.GITHUB_RUN_ID || "local"}/${process.env.GITHUB_RUN_ATTEMPT || "1"}`,
  },
  body: JSON.stringify({
    from: required("RESEND_FROM_EMAIL"),
    to: [administrator.email],
    subject: `[TEST] ${message.subject}`,
    html: message.html,
    text: message.text,
  }),
});
if (!emailResponse.ok) throw new Error(`Resend rejected the test email (${emailResponse.status}): ${await emailResponse.text()}`);
process.stdout.write(`Test email sent for ${suggestion.artist}\n`);
