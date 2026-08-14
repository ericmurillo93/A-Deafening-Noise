import assert from "node:assert/strict";
import test from "node:test";
import { renderSuggestionDigest } from "./suggestion-email-template.mjs";

test("renders every suggestion and escapes untrusted content", () => {
  const email = renderSuggestionDigest("Eric <Admin>", [
    { artist: "A & B", date: "01/09/2026", venue: "SALA <ONE>", sourceUrl: "https://example.com/one" },
    { artist: "SECOND", date: "02/09/2026", sourceUrl: "javascript:alert(1)" },
  ]);
  assert.match(email.subject, /^2 new concerts/);
  assert.match(email.html, /Eric &lt;Admin&gt;/);
  assert.match(email.html, /A &amp; B/);
  assert.match(email.html, /SECOND/);
  assert.doesNotMatch(email.html, /javascript:/);
});
