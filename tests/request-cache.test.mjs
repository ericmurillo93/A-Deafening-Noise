import test from "node:test";
import assert from "node:assert/strict";
import { createRequestCache } from "../src/lib/request-cache.js";

test("request cache shares in-flight work and bounds retained entries", async () => {
  const cache = createRequestCache({ max: 2 });
  let calls = 0;
  const request = () => ++calls;
  assert.deepEqual(await Promise.all([cache.get("a", request), cache.get("a", request)]), [1, 1]);
  await cache.get("b", request);
  await cache.get("c", request);
  assert.equal(await cache.get("a", request), 4);
  cache.clear();
  assert.equal(await cache.get("a", request), 5);
});

test("failed and expired requests can be retried", async () => {
  const cache = createRequestCache({ ttl: 0 });
  await assert.rejects(cache.get("a", () => { throw new Error("offline"); }));
  assert.equal(await cache.get("a", () => 1), 1);
  assert.equal(await cache.get("a", () => 2), 2);
});
