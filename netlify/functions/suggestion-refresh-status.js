import { getGitHubConfig, getLatestSuggestionRun, isAuthorized } from "./lib/github.js";

export async function handler(event) {
  try {
    const { token, password } = getGitHubConfig();
    const auth = isAuthorized(event, password);
    if (auth.error) return auth.error;
    const run = await getLatestSuggestionRun(token);
    return {
      statusCode: 200,
      body: JSON.stringify(run ? {
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
      } : { status: "idle", conclusion: null }),
    };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Could not read suggestion refresh status" };
  }
}
