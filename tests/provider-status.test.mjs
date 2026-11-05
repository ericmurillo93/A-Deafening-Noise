import assert from "node:assert/strict";
import test from "node:test";
import { getAdminProviderStatus } from "../netlify/functions/admin-provider-status.js";

test("provider totals paginate all workflows and emails beyond the first 100", async () => {
  const original = globalThis.fetch;
  const calls = [];
  const now = new Date().toISOString();
  try {
    globalThis.fetch = async url => {
      calls.push(url);
      if (url.includes('api.github.com')) {
        assert.match(url, /\/actions\/runs\?/);
        const first = url.endsWith('page=1');
        return Response.json({ workflow_runs: Array.from({ length: first ? 100 : 1 }, () => ({ created_at: now, updated_at: now, run_started_at: now, path: '.github/workflows/weekly-ticket-reminders.yml' })) });
      }
      const first = !url.includes('after=');
      return Response.json({ has_more: first, data: Array.from({ length: first ? 100 : 1 }, (_, i) => ({ id: `email-${i}`, created_at: now, last_event: first ? 'delivered' : 'bounced' })) });
    };
    const result = await getAdminProviderStatus({ GITHUB_TOKEN: 'test', RESEND_API_KEY: 'test' });
    assert.equal(result.github.runs30Days, 101);
    assert.equal(result.github.partial, false);
    assert.equal(result.resend.total30Days, 101);
    assert.equal(result.resend.delivered30Days, 100);
    assert.equal(result.resend.bounced30Days, 1);
    assert.equal(result.resend.partial, false);
    assert(calls.some(url => url.includes('after=email-99')));
    globalThis.fetch = async () => Response.json({ workflow_runs: Array.from({ length: 100 }, () => ({ created_at: now, updated_at: now })) });
    assert.equal((await getAdminProviderStatus({ GITHUB_TOKEN: 'test' })).github.partial, true);
  } finally { globalThis.fetch = original; }
});
