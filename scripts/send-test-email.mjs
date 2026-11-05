import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { renderNotificationEmail, notificationEmailTypes } from "./notification-email-template.mjs";
import { renderSuggestionDigest } from "./suggestion-email-template.mjs";
import { renderWeeklyTicketReminder } from "./weekly-ticket-reminder-template.mjs";

const authTypes = ["confirmation", "recovery", "invite", "magic_link", "email_change", "reauthentication", "password_changed", "email_changed"];
export const emailTestTypes = ["weekly_ticket_reminder", "suggestions", ...notificationEmailTypes, ...authTypes.map((type) => `auth_${type}`)];
const exampleConcerts = [
  { artist: "EXAMPLE ARTIST", venue: "EXAMPLE VENUE", city: "Barcelona", country: "ES", date: "01/01/2030" },
  { artist: "SECOND EXAMPLE ARTIST", venue: "EXAMPLE VENUE", city: "Lausanne", country: "CH", date: "02/02/2030" },
];

export async function renderTestEmail(type, profile, concerts = []) {
  if (!emailTestTypes.includes(type)) throw new Error("Unknown email test type");
  let message;
  let label = "[TEST]";
  if (type === "weekly_ticket_reminder") {
    message = renderWeeklyTicketReminder(profile.display_name, concerts.length ? concerts : exampleConcerts, profile.language);
    if (!concerts.length) label = "[TEST SAMPLE]";
  } else if (type === "suggestions") {
    message = renderSuggestionDigest(profile.display_name, exampleConcerts, profile.language);
    label = "[TEST SAMPLE]";
  } else if (type.startsWith("auth_")) {
    const name = type.slice(5);
    let html = await fs.readFile(new URL(`../supabase/templates/${name}.html`, import.meta.url), "utf8");
    const values = { ConfirmationURL: "https://adeafeningnoise.com/profile", Token: "000000", Email: "preview@example.invalid", NewEmail: "preview-new@example.invalid", OldEmail: "preview-old@example.invalid" };
    html = html.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Unknown auth template placeholder: ${key}`);
      return values[key];
    });
    const notice = "TEMPLATE PREVIEW ONLY — links and codes do not sign in, reset passwords or change your account.";
    html = html.replace(/(<body\b[^>]*>)/i, `$1<div style="padding:16px;background:#172554;color:#dbeafe;font:14px Arial,sans-serif;text-align:center">${notice}</div>`);
    message = { subject: `Authentication template: ${name}`, html, text: `${notice}\n\nAuthentication template: ${name}\nhttps://adeafeningnoise.com/profile` };
    label = "[TEST PREVIEW]";
  } else {
    message = renderNotificationEmail({ kind: type, language: profile.language, actorName: "Example friend", artist: "EXAMPLE ARTIST", venue: "EXAMPLE VENUE", date: "01/01/2030" });
  }
  return { ...message, subject: `${label} ${message.subject}` };
}

export async function sendTestEmail(type, env = process.env) {
  if (!emailTestTypes.includes(type)) throw new Error("Unknown email test type");
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) if (!env[name]) throw new Error(`${name} is required`);
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const read = async (path) => {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not read email preview data (${response.status})`);
    return response.json();
  };
  // Never accept a caller-supplied address or send this preview to other users.
  const [profile] = await read("profiles?select=id,username,email,display_name,language&username=eq.eric&role=eq.admin&account_status=eq.active&limit=1");
  if (profile?.username !== "eric" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email || "")) throw new Error("Eric's active administrator profile was not found");
  let concerts = [];
  if (type === "weekly_ticket_reminder") {
    const rows = await read(`concert_participants?select=concerts(artist,venue,city,country,concert_date,start_date,end_date,event_status,ticket_url)&user_id=eq.${encodeURIComponent(profile.id)}&status=eq.confirmed&visible_in_archive=eq.true&bought=eq.false`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    concerts = rows.map(({ concerts }) => concerts).filter((concert) => concert && (concert.end_date || concert.start_date) >= today && concert.event_status !== "cancelled")
      .sort((a, b) => (a.start_date || a.end_date).localeCompare(b.start_date || b.end_date) || a.artist.localeCompare(b.artist))
      .map((concert) => ({ ...concert, date: concert.concert_date, ticketUrl: concert.ticket_url }));
  }
  const message = await renderTestEmail(type, profile, concerts);
  const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `email-test/${env.GITHUB_RUN_ID || randomUUID()}/${type}` }, body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [profile.email], ...message }) });
  if (!response.ok) throw new Error(`Resend rejected the test (${response.status})`);
  const result = await response.json();
  console.log(`Test email accepted for Eric: ${type}; Resend ID: ${result.id}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await sendTestEmail(process.env.EMAIL_TEST_TYPE || process.argv[2] || "weekly_ticket_reminder");
