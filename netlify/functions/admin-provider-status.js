import { githubRequest, WORKFLOW } from "./lib/github.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";

export async function getAdminProviderStatus(configuration = process.env) {
  const providers = { github: { configured: false }, resend: { configured: false }, netlify: { configured: true, usageAvailable: false } };

  try {
    const token = configuration.GITHUB_TOKEN;
    if (!token) throw new Error("Server is missing GITHUB_TOKEN.");
    const response = await githubRequest(token, `/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=100`);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const runs = (await response.json()).workflow_runs || [];
    const monthAgo = Date.now() - 30 * 86400000;
    const recent = runs.filter((run) => new Date(run.created_at).getTime() >= monthAgo);
    providers.github = {
      configured: true,
      latest: runs[0] ? { status: runs[0].status, conclusion: runs[0].conclusion, createdAt: runs[0].created_at, updatedAt: runs[0].updated_at, url: runs[0].html_url } : null,
      runs30Days: recent.length,
      minutes30Days: Math.ceil(recent.reduce((total, run) => total + Math.max(0, new Date(run.updated_at) - new Date(run.run_started_at || run.created_at)), 0) / 60000),
    };
  } catch (error) { providers.github.error = error.message; }

  if (configuration.RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails?limit=100", { headers: { Authorization: `Bearer ${configuration.RESEND_API_KEY}` } });
      if (!response.ok) throw new Error(`Resend returned ${response.status}`);
      const monthAgo = Date.now() - 30 * 86400000;
      const emails = ((await response.json()).data || []).filter((email) => new Date(email.created_at).getTime() >= monthAgo);
      const deliveredEvents = new Set(["delivered", "opened", "clicked"]);
      providers.resend = { configured: true, total30Days: emails.length, delivered30Days: emails.filter((email) => deliveredEvents.has(email.last_event)).length, bounced30Days: emails.filter((email) => email.last_event === "bounced").length, failed30Days: emails.filter((email) => ["failed", "suppressed"].includes(email.last_event)).length };
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
