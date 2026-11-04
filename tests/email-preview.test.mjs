import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { emailTestTypes, renderTestEmail, sendTestEmail } from "../scripts/send-test-email.mjs";

test("every email type is selectable and auth previews cannot authorize account actions", async () => {
  const workflow = await fs.readFile(new URL("../.github/workflows/test-email.yml", import.meta.url), "utf8");
  for (const type of emailTestTypes) {
    assert(workflow.includes(`- ${type}\n`), type);
    const message = await renderTestEmail(type, { display_name: "Example", language: "es" });
    assert.match(message.subject, /^\[TEST/);
    assert.match(message.html, /A Deafening Noise|A DEAFENING NOISE/);
    if (type.startsWith("auth_")) {
      assert.match(message.html, /TEMPLATE PREVIEW ONLY/);
      assert.doesNotMatch(message.html, /\{\{|\/auth\/v1\/verify|token_hash=/);
    }
  }
  await assert.rejects(renderTestEmail("auth_../../secrets", {}));
});

test("weekly preview sends only to Eric, includes all pending concerts and makes no database writes", async () => {
  const original = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      requests.push([url, options]);
      if (url.includes("/profiles?")) return { ok: true, json: async () => [{ id: "example-id", username: "eric", email: "eric@example.invalid", display_name: "Example", language: "en" }] };
      if (url.includes("/concert_participants?")) return { ok: true, json: async () => ["A", "B"].map(artist => ({ concerts: { artist, start_date: "2099-01-01", concert_date: "01/01/2099", event_status: "announced" } })) };
      assert.equal(url, "https://api.resend.com/emails");
      return { ok: true, json: async () => ({ id: "test-message" }) };
    };
    const env = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test", RESEND_API_KEY: "test", RESEND_FROM_EMAIL: "test@example.invalid", GITHUB_RUN_ID: "123" };
    await sendTestEmail("weekly_ticket_reminder", env);
    assert.equal(requests.length, 3);
    for (const [, options] of requests.slice(0, 2)) assert.equal(options.method, undefined);
    const message = JSON.parse(requests[2][1].body);
    assert.deepEqual(message.to, ["eric@example.invalid"]);
    assert.match(message.text, /A —/); assert.match(message.text, /B —/);
    assert.equal(requests[2][1].headers["Idempotency-Key"], "email-test/123/weekly_ticket_reminder");
    globalThis.fetch = async () => ({ ok: true, json: async () => [{ username: "someone-else", email: "other@example.invalid" }] });
    await assert.rejects(sendTestEmail("weekly_ticket_reminder", env), /Eric/);
  } finally { globalThis.fetch = original; }
});
