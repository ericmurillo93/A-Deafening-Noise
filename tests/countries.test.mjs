import assert from "node:assert/strict";
import test from "node:test";
import { countryCode, countryName, COUNTRIES } from "../src/lib/countries.js";
import { COUNTRY_IDS } from "../src/lib/country-geography.js";

test("geography supports countries outside the original European archive", () => {
  assert.equal(COUNTRY_IDS.US, "840");
  assert.equal(COUNTRY_IDS.MX, "484");
  assert.equal(COUNTRY_IDS.JP, "392");
  assert.equal(COUNTRY_IDS.AU, "036");
  assert.ok(COUNTRIES.every(({ code }) => /^\d{3}$/.test(COUNTRY_IDS[code])), "Every selectable country needs a geographic identifier");
});

test("country codes are localized without changing their stored value", () => {
  assert.equal(countryName("ES", "en-GB"), "Spain");
  assert.equal(countryName("ES", "es-ES"), "España");
  assert.equal(countryName("CH", "en-GB"), "Switzerland");
  assert.equal(countryName("CH", "es-ES"), "Suiza");
  assert.equal(countryName("Spain", "es-ES"), "España");
  assert.equal(countryName("Suiza", "en-GB"), "Switzerland");
  assert.equal(countryName("Unknown place", "es-ES"), "Unknown place");
  assert.equal(countryName("XX", "es-ES"), "XX");
  assert.equal(countryCode("España"), "ES");
  assert.equal(countryCode("Switzerland"), "CH");
});
