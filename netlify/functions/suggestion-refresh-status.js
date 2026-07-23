import { getGitHubConfig, getLatestSuggestionRun, githubRequest } from "./lib/github.js";
import { requireArchiveUser } from "./lib/supabase-auth.js";

export async function handler(event) {
  try {
    const { token } = getGitHubConfig();
    const auth = await requireArchiveUser(event, { admin: true });
    if (auth.error) return auth.error;
    const run = await getLatestSuggestionRun(token);
    let generatedAt = null;
    if (run?.status === "completed" && run.conclusion === "success") {
      const suggestionsResponse = await githubRequest(token, "/contents/data/suggestions.json?ref=main");
      if (suggestionsResponse.ok) {
        const file = await suggestionsResponse.json();
        const suggestions = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
        generatedAt = suggestions.generatedAt || null;
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify(run ? {
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        generatedAt,
      } : { status: "idle", conclusion: null }),
    };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Could not read suggestion refresh status" };
  }
}
