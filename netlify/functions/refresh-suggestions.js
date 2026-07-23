import { getGitHubConfig, getLatestSuggestionRun, githubRequest, WORKFLOW } from "./lib/github.js";
import { getArchiveData, requireArchiveUser } from "./lib/supabase-auth.js";

async function syncConcertBackup(token, event) {
  const archive = await getArchiveData(event);
  const path = "/contents/data/concerts.json";
  const current = await githubRequest(token, `${path}?ref=main`);
  if (!current.ok) throw new Error(`Could not read the concert backup (${current.status})`);
  const { sha } = await current.json();
  const content = Buffer.from(`${JSON.stringify(archive, null, 2)}\n`, "utf8").toString("base64");
  const update = await githubRequest(token, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "[skip netlify] Back up concert data before discovery",
      content,
      sha,
      branch: "main",
    }),
  });
  if (!update.ok) throw new Error(`Could not update the concert backup (${update.status})`);
}

export async function handler(event) {
  try {
    const { token } = getGitHubConfig();
    const auth = await requireArchiveUser(event, { admin: true });
    if (auth.error) return auth.error;

    const latest = await getLatestSuggestionRun(token);
    if (latest && ["queued", "in_progress", "waiting", "pending"].includes(latest.status)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, alreadyRunning: true, status: latest.status, createdAt: latest.created_at }),
      };
    }

    await syncConcertBackup(token, event);

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
