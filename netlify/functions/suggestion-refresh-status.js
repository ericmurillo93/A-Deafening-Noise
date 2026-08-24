import { getGitHubConfig, getLatestSuggestionRun } from "./lib/github.js";
import { getSupabaseConfiguration, requireArchiveUser } from "./lib/supabase-auth.js";

export async function handler(event) {
  try {
    const { token } = getGitHubConfig();
    const auth = await requireArchiveUser(event, { admin: true });
    if (auth.error) return auth.error;
    const run = await getLatestSuggestionRun(token);
    let generatedAt = null;
    if (run?.status === "completed" && run.conclusion === "success") {
      const { url, key } = getSupabaseConfiguration();
      const authorization = event.headers?.authorization || event.headers?.Authorization || "";
      const suggestionsResponse = await fetch(`${url}/rest/v1/rpc/get_concert_suggestions`, { method: "POST", headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" }, body: "{}" });
      if (suggestionsResponse.ok) {
        const suggestions = await suggestionsResponse.json();
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
