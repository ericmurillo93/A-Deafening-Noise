import assert from "node:assert/strict";
import test from "node:test";
import { uniqueSourceLinks } from "../src/lib/concerts.js";

test("shows each secondary ticket link once and excludes the primary action", () => {
  const sources = [
    { source: "ticketmaster", url: "https://tickets.example/show" },
    { source: "suggestion", url: "https://tickets.example/show" },
    { source: "venue", url: "https://venue.example/show" },
  ];
  assert.deepEqual(uniqueSourceLinks(sources, "https://tickets.example/show").map(({ source }) => source), ["venue"]);
});
