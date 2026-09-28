import assert from "node:assert/strict";
import test from "node:test";
import { fetchText } from "../scripts/lib/suggestion-scraper-utils.mjs";

test("fetchText retries a misleading empty success response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => ({ ok: true, text: async () => (++calls === 1 ? "   " : "<html>event</html>") });
  try {
    assert.equal(await fetchText("https://example.com"), "<html>event</html>");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
