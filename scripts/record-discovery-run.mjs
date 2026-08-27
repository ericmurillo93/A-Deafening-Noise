import assert from "node:assert/strict";
import fs from "node:fs/promises";

function runPayload({ runId, trigger, status, scraperReport = {}, emailReport = {}, catalog = {} }) {
  return {
    githubRunId: Number(runId), trigger: trigger || "schedule", status,
    completedAt: status === "running" ? null : new Date().toISOString(),
    suggestionCount: catalog.suggestions?.length || 0,
    newSuggestionCount: emailReport.newSuggestionCount || 0,
    emailsSent: emailReport.emailsSent || 0,
    error: status === "failed" ? "Discovery workflow failed. Open the GitHub run for step logs." : "",
    sources: scraperReport.sources || [],
  };
}

if (process.argv.includes("--check")) {
  assert.deepEqual(runPayload({ runId: "42", status: "success", catalog: { suggestions: [{ id: 1 }] } }).suggestionCount, 1);
  process.stdout.write("Discovery telemetry self-check passed\n");
  process.exit(0);
}

const [status = "running"] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!process.env.GITHUB_RUN_ID || !["running", "success", "failed"].includes(status)) throw new Error("A GitHub run ID and valid status are required");
const readJson = async (path, fallback = {}) => { try { return JSON.parse(await fs.readFile(path, "utf8")); } catch { return fallback; } };
const payload = runPayload({
  runId: process.env.GITHUB_RUN_ID,
  trigger: process.env.GITHUB_EVENT_NAME,
  status,
  scraperReport: await readJson("/tmp/discovery-scrapers.json"),
  emailReport: await readJson("/tmp/discovery-emails.json"),
  catalog: await readJson("data/suggestions.json"),
});
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const response = await fetch(`${url}/rest/v1/rpc/record_discovery_run`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ payload }) });
if (!response.ok) throw new Error(`Could not record discovery run (${response.status}): ${(await response.text()).slice(0, 300)}`);
process.stdout.write(`Recorded discovery run ${payload.githubRunId} as ${status}\n`);
