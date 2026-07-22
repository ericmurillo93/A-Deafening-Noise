import { getGitHubConfig, getLatestSuggestionRun, githubRequest, isAuthorized, WORKFLOW } from "./lib/github.js";

export async function handler(event) {
  try {
    const { token, password } = getGitHubConfig();
    const auth = isAuthorized(event, password);
    if (auth.error) return auth.error;

    const latest = await getLatestSuggestionRun(token);
    if (latest && ["queued", "in_progress", "waiting", "pending"].includes(latest.status)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, alreadyRunning: true, status: latest.status, createdAt: latest.created_at }),
      };
    }

    const response = await githubRequest(token, `/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!response.ok) {
      const details = await response.text();
      return { statusCode: 502, body: `GitHub rejected the workflow request: ${details.slice(0, 200)}` };
    }
    return { statusCode: 202, body: JSON.stringify({ ok: true, status: "queued" }) };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Could not start suggestion refresh" };
  }
}
