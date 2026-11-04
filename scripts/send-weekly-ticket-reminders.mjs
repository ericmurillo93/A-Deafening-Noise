import { renderWeeklyTicketReminder, isReminderTime } from "./weekly-ticket-reminder-template.mjs";

const dryRun = process.argv.includes("--dry-run");
if (!dryRun && !isReminderTime()) { console.log("Weekly reminders skipped: before Monday 08:00 Europe/Madrid or outside Monday"); process.exit(0); }
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, RESEND_API_KEY: resend, RESEND_FROM_EMAIL: from } = process.env;
if (!url || !key || (!dryRun && (!resend || !from))) throw new Error("Weekly reminder service configuration is incomplete");
async function rpc(name, payload = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Weekly reminder ${name} failed (${response.status})`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const recipients = await rpc("get_weekly_ticket_reminder_recipients");
let sent = 0, failed = 0;
for (const recipient of recipients) {
  if (!recipient.concerts?.length) continue;
  const email = renderWeeklyTicketReminder(recipient.displayName, recipient.concerts, recipient.language);
  if (dryRun) continue;
  const delivery = await rpc("claim_weekly_ticket_reminder", { target_user: recipient.userId, candidate_message: { from, to: [recipient.email], ...email, headers: { "List-Unsubscribe": "<https://adeafeningnoise.com/profile>" } } });
  if (!delivery) continue;
  let succeeded = false, error = null;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": `weekly-ticket-reminder/${delivery.id}` }, body: JSON.stringify(delivery.message) });
    succeeded = response.ok; error = succeeded ? null : `Resend ${response.status}`;
  } catch { error = "Delivery request interrupted"; }
  await rpc("complete_weekly_ticket_reminder", { delivery_id: delivery.id, claim_lease: delivery.lease, succeeded, error_message: error });
  if (succeeded) sent += 1; else failed += 1;
  await new Promise((resolve) => setTimeout(resolve, 600));
}
console.log(dryRun ? `Weekly reminder dry run: ${recipients.length} eligible recipients; no emails sent or claims written` : `Weekly reminders: ${sent} sent, ${failed} failed`);
if (failed) process.exitCode = 1;
