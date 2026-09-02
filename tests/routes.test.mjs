import assert from "node:assert/strict";
import test from "node:test";
import { readRouteFromLocation, routeToPath } from "../src/lib/routes.js";

test("friend profiles have stable direct URLs", () => {
  assert.equal(routeToPath({ page: "friend-profile", person: "saray" }), "/people/saray");
  global.window = { location: { pathname: "/people/saray", hash: "" } };
  assert.deepEqual(readRouteFromLocation(), { page: "friend-profile", artist: null, venue: null, person: "saray" });
  delete global.window;
});

test("city profiles have stable direct URLs", () => {
  assert.equal(routeToPath({ page: "city", city: "Barcelona", country: "ES" }), "/city/ES/Barcelona");
  global.window = { location: { pathname: "/city/ES/Barcelona", hash: "" } };
  assert.deepEqual(readRouteFromLocation(), { page: "city", artist: null, venue: null, city: "Barcelona", country: "ES" });
  delete global.window;
});

test("concerts have stable direct URLs", () => {
  assert.equal(routeToPath({ page: "concert", concert: "concert-123" }), "/concert/concert-123");
  global.window = { location: { pathname: "/concert/concert-123", hash: "" } };
  assert.deepEqual(readRouteFromLocation(), { page: "concert", artist: null, venue: null, concert: "concert-123" });
  delete global.window;
});

test("country profiles have stable direct URLs", () => {
  assert.equal(routeToPath({ page: "country", country: "CH" }), "/country/CH");
  global.window = { location: { pathname: "/country/CH", hash: "" } };
  assert.deepEqual(readRouteFromLocation(), { page: "country", artist: null, venue: null, country: "CH" });
  delete global.window;
});
