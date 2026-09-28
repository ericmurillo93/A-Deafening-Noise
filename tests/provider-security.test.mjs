import assert from "node:assert/strict";
import { requireArchiveUser } from "../netlify/functions/lib/supabase-auth.js";
const original = globalThis.fetch;
process.env.SUPABASE_URL = "https://isolated.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";
try {
  assert.equal((await requireArchiveUser({ httpMethod: "POST", headers: {} })).error.statusCode, 401);
  const event = { httpMethod: "POST", headers: { authorization: "Bearer test" } };
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(url.endsWith("get_my_access") ? { id: "user", role: "user" } : false); };
  assert.equal((await requireArchiveUser(event, { quota: "catalog" })).error.statusCode, 429);
  assert.equal(JSON.parse(calls[1].options.body).requested_action, "catalog");
  assert(calls.every((call) => call.options.signal));
  assert.equal((await requireArchiveUser(event, { admin: true })).error.statusCode, 403);
  globalThis.fetch = async () => { throw new Error("network failure"); };
  assert.equal((await requireArchiveUser(event)).error.statusCode, 503);
} finally { globalThis.fetch = original; }
