import assert from "node:assert/strict";
import test from "node:test";
import { countryCode, countryName } from "../src/lib/countries.js";

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
