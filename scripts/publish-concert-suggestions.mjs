import assert from "node:assert/strict";
import fs from "node:fs/promises";

function validCatalog(value) {
  return value && typeof value.generatedAt === "string" && !Number.isNaN(Date.parse(value.generatedAt))
    && Array.isArray(value.suggestions) && value.suggestions.length <= 10_000;
}

if (process.argv.includes("--check")) {
  assert.equal(validCatalog({ generatedAt: new Date().toISOString(), suggestions: [] }), true);
  assert.equal(validCatalog({ generatedAt: "invalid", suggestions: [] }), false);
  process.stdout.write("Suggestion publisher self-check passed\n");
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const downloadPath = process.argv.find((argument) => argument.startsWith("--download="))?.slice(11);
if (downloadPath) {
  const response = await fetch(`${url}/rest/v1/rpc/get_concert_suggestions`, { method: "POST", headers, body: "{}" });
  if (!response.ok) throw new Error(`Could not download suggestions (${response.status})`);
  const catalog = await response.json();
  if (!validCatalog(catalog)) throw new Error("Invalid suggestion catalog in Supabase");
  await fs.writeFile(downloadPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  process.stdout.write(`Downloaded ${catalog.suggestions.length} suggestions from Supabase\n`);
  process.exit(0);
}
const inputPath = process.argv[2] || "data/suggestions.json";
const catalog = JSON.parse(await fs.readFile(inputPath, "utf8"));
if (!validCatalog(catalog)) throw new Error("Invalid suggestion catalog");
const response = await fetch(`${url}/rest/v1/rpc/replace_concert_suggestions`, {
  method: "POST",
  headers,
  body: JSON.stringify({ payload: catalog }),
});
if (!response.ok) throw new Error(`Could not publish suggestions (${response.status}): ${(await response.text()).slice(0, 300)}`);
process.stdout.write(`Published ${catalog.suggestions.length} suggestions to Supabase\n`);
