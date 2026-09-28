import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adn-digest-"));
const file = path.join(directory, "catalog.json");
const original = { fetch: globalThis.fetch, argv: process.argv, exitCode: process.exitCode };
const event = { artist: "EXAMPLE", date: "01/01/2099", venue: "VENUE", city: "Barcelona", country: "ES" };
await fs.writeFile(file, JSON.stringify({ suggestions: [event] }));
Object.assign(process.env, { SUPABASE_URL: "https://audit.invalid", SUPABASE_SERVICE_ROLE_KEY: "fake", RESEND_API_KEY: "fake", RESEND_FROM_EMAIL: "test@example.invalid" });
process.argv = ["node", "digest", file];
let pages = 0, completed = false, delivered = false;
const frozen = { subject: "Original subject", to: ["audit@example.invalid"], html: "Original message" };
globalThis.fetch = async (url, options) => {
  if (url.endsWith("get_suggestion_notification_recipients")) return Response.json([{ userId: "audit", email: "audit@example.invalid", displayName: "Audit", artists: ["EXAMPLE"], concerts: [], countries: ["ES"], dismissed: [] }]);
  if (url.includes("suggestion_email_outbox?")) {
    pages++;
    return Response.json(url.includes("offset=0") ? Array.from({ length: 1000 }, () => ({ event_keys: ["old-event"] })) : []);
  }
  if (url.endsWith("claim_suggestion_digest")) {
    assert.equal(JSON.parse(options.body).candidate_keys.length, 1);
    return Response.json({ id: 123, lease: "lease", event_keys: ["event"], message: frozen });
  }
  if (url === "https://api.resend.com/emails") {
    assert.deepEqual(JSON.parse(options.body), frozen);
    assert.equal(options.headers["Idempotency-Key"], "suggestion-delivery/123");
    delivered = true;
    return new Response("temporary failure", { status: 503 });
  }
  if (url.endsWith("complete_suggestion_digest")) {
    const body = JSON.parse(options.body);
    assert.equal(body.succeeded, false);
    assert.equal(body.definite_failure, false);
    assert.equal(body.claim_lease, "lease");
    completed = true;
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected request: ${url}`);
};
try {
  await import("../scripts/notify-concert-suggestions.mjs");
  assert.equal(pages, 2);
  assert(delivered && completed);
  assert.equal(process.exitCode, 1);
} finally {
  globalThis.fetch = original.fetch;
  process.argv = original.argv;
  process.exitCode = original.exitCode;
  await fs.rm(directory, { recursive: true });
}
