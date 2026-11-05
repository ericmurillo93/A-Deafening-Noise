import { githubRequest, WORKFLOW } from "./lib/github.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";

export async function getAdminProviderStatus(configuration = process.env) {
  const providers = { github: { configured: false }, resend: { configured: false }, netlify: { configured: true, usageAvailable: false } };

  try {
    const token = configuration.GITHUB_TOKEN;
    if (!token) throw new Error("Server is missing GITHUB_TOKEN.");
    const monthAgo = Date.now() - 30 * 86400000;
    const runs = [];
    let partial = true;
    const signal = AbortSignal.timeout(12000);
    // shortcut: cap provider history at 1,000 rows and label partial totals; use stored telemetry at larger scale.
    for (let page = 1; page <= 10; page++) {
      const response = await githubRequest(token, `/actions/runs?branch=main&per_page=100&page=${page}`, { signal });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const batch = (await response.json()).workflow_runs || [];
      runs.push(...batch.filter((run) => new Date(run.created_at).getTime() >= monthAgo));
      if (batch.length < 100 || batch.some((run) => new Date(run.created_at).getTime() < monthAgo)) { partial = false; break; }
    }
    const latest = runs.find((run) => run.path?.endsWith(`/${WORKFLOW}`));
    providers.github = {
      configured: true,
      partial,
      latest: latest ? { status: latest.status, conclusion: latest.conclusion, createdAt: latest.created_at, updatedAt: latest.updated_at, url: latest.html_url } : null,
      runs30Days: runs.length,
      minutes30Days: Math.ceil(runs.reduce((total, run) => total + Math.max(0, new Date(run.updated_at) - new Date(run.run_started_at || run.created_at)), 0) / 60000),
    };
  } catch (error) { providers.github.error = error.message; }

  if (configuration.RESEND_API_KEY) {
    try {
      const monthAgo = Date.now() - 30 * 86400000;
      const emails = [];
      let after = "", partial = true;
      const signal = AbortSignal.timeout(12000);
      for (let page = 0; page < 10; page++) {
        if (page) await new Promise((resolve) => setTimeout(resolve, 550));
        const response = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { headers: { Authorization: `Bearer ${configuration.RESEND_API_KEY}` }, signal });
        if (!response.ok) throw new Error(`Resend returned ${response.status}`);
        const result = await response.json();
        const batch = result.data || [];
        emails.push(...batch.filter((email) => new Date(email.created_at).getTime() >= monthAgo));
        if (!result.has_more || !batch.length || batch.some((email) => new Date(email.created_at).getTime() < monthAgo)) { partial = false; break; }
        after = batch.at(-1).id;
      }
      const deliveredEvents = new Set(["delivered", "opened", "clicked"]);
      providers.resend = { configured: true, partial, total30Days: emails.length, delivered30Days: emails.filter((email) => deliveredEvents.has(email.last_event)).length, bounced30Days: emails.filter((email) => email.last_event === "bounced").length, failed30Days: emails.filter((email) => ["failed", "suppressed"].includes(email.last_event)).length };
    } catch (error) { providers.resend = { configured: true, error: error.message }; }
  }
  return providers;
}

export async function handler(event) {
  try {
    const auth = await requireArchiveUser(event, { admin: true });
    if (auth.error) return auth.error;
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(await getAdminProviderStatus()) };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Could not load provider status" };
  }
}
