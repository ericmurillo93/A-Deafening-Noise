import assert from "node:assert/strict";
import test from "node:test";
import { processAccountDeletions } from "../scripts/process-account-deletions.mjs";
import { sendNotificationEmails } from "../scripts/send-notification-emails.mjs";
import { renderNotificationEmail, notificationEmailTypes } from "../scripts/notification-email-template.mjs";
import { renderSuggestionDigest } from "../scripts/suggestion-email-template.mjs";

const env = { SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test", RESEND_API_KEY: "test", RESEND_FROM_EMAIL: "test@example.invalid" };
test("account deletion cleans both buckets before Auth and retries storage failures", async () => {
  for (const fail of [false, true]) {
    const calls = [];
    const result = await processAccountDeletions(env, async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body, method: options.method });
      if (url.endsWith("claim_account_deletions")) return Response.json([{ user_id: "user", lease: "lease" }]);
      if (url.includes("/object/list/")) return Response.json([{ id: "file", name: "photo.webp" }]);
      if (fail && url.includes("/object/avatars")) return new Response("error", { status: 503 });
      return Response.json(null);
    });
    assert.equal(result.failed, Number(fail));
    assert.equal(calls.at(-1).body.succeeded, !fail);
    assert(calls.at(-1).url.endsWith("complete_account_deletion"));
    assert.deepEqual(calls.filter(c => c.method === "DELETE").map(c => c.body.prefixes), [["user/photo.webp"], ["user/photo.webp"]]);
  }
});

test("activity sender drains multiple batches and sends the frozen message with its lease", async () => {
  let batches = 0, sent = 0, completed = 0;
  const frozen = { from: "original@example.invalid", to: ["recipient@example.invalid"], subject: "Frozen", text: "Original" };
  const result = await sendNotificationEmails(env, async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith("get_notification_email_batch")) return Response.json(++batches <= 2 ? [{ outboxId: batches, kind: "friend_request", email: "recipient@example.invalid" }] : []);
    if (url.endsWith("claim_notification_email")) return Response.json({ id: body.outbox_id, notification_id: body.outbox_id + 10, lease: "lease", message: frozen });
    if (url === "https://api.resend.com/emails") {
      assert.deepEqual(body, frozen);
      assert.match(options.headers["Idempotency-Key"], /^notification\//);
      sent++; return Response.json({ id: "sent" });
    }
    assert(url.endsWith("complete_notification_email"));
    assert.equal(body.claim_lease, "lease");
    assert.equal(body.succeeded, true); completed++;
    return Response.json(null);
  }, async () => {});
  assert.deepEqual(result, { sent: 2, failed: 0 });
  assert.equal(sent, completed);
});

test("activity sender never reports success when completion failed", async () => {
  await assert.rejects(sendNotificationEmails(env, async (url) => {
    if (url.endsWith("get_notification_email_batch")) return Response.json([{ outboxId: 1, kind: "friend_request" }]);
    if (url.endsWith("claim_notification_email")) return Response.json({ id: 1, notification_id: 2, lease: "lease", message: {} });
    if (url.endsWith("complete_notification_email")) return new Response("error", { status: 503 });
    return Response.json({ id: "accepted" });
  }, async () => {}), /complete_notification_email failed/);
});

test("activity and suggestion emails localize every type and escape user content", () => {
  for (const kind of notificationEmailTypes) {
    const item = { kind, actorName: '<script>Friend</script>', artist: 'ARTIST', date: '01/01/2030' };
    const en = renderNotificationEmail(item), es = renderNotificationEmail({ ...item, language: 'es' });
    assert.notEqual(en.subject, es.subject, kind);
    assert.match(es.html, /lang="es"/);
    assert.match(es.html, /Gestionar preferencias/);
    assert.doesNotMatch(es.html, /<script>|undefined|Manage email preferences/);
  }
  const message = renderSuggestionDigest('<img src=x>', [{ artist: '<script>BAD</script>', country: 'ES', sourceUrl: 'javascript:alert(1)' }], 'es');
  assert.equal(message.subject, 'Nuevas sugerencias de conciertos');
  assert.match(message.html, /España/);
  assert.doesNotMatch(message.html, /<script>|<img|javascript:/);
});
