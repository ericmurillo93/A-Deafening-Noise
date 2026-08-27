import { renderNotificationEmail } from "./notification-email-template.mjs";

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, RESEND_API_KEY: resend, RESEND_FROM_EMAIL: from } = process.env;
if (!url || !key || !resend || !from) { process.stdout.write("Activity email delivery skipped: service configuration is incomplete\n"); process.exit(0); }
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const batchResponse = await fetch(`${url}/rest/v1/rpc/get_notification_email_batch`, { method: "POST", headers, body: JSON.stringify({ batch_size: 50 }) });
if (!batchResponse.ok) throw new Error(`Could not claim activity email batch (${batchResponse.status})`);
const batch = await batchResponse.json(); let sent = 0;
for (const item of batch) {
  const message = renderNotificationEmail(item);
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": `notification/${item.notificationId}` }, body: JSON.stringify({ from, to: [item.email], subject: message.subject, html: message.html, text: message.text }) });
  await fetch(`${url}/rest/v1/rpc/complete_notification_email`, { method: "POST", headers, body: JSON.stringify({ outbox_id: item.outboxId, succeeded: response.ok, error_message: response.ok ? null : `Resend ${response.status}` }) });
  if (response.ok) sent += 1;
}
process.stdout.write(`Sent ${sent} activity emails\n`);
