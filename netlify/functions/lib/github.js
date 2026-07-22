const REPO = "ericmurillo93/A-Deafening-Noise";
const WORKFLOW = "concert-suggestions.yml";

export function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const password = process.env.APP_PASSWORD;
  if (!token || !password) throw new Error("Server is missing required environment variables.");
  return { token, password };
}

export function isAuthorized(event, password) {
  if (event.httpMethod !== "POST") return { error: { statusCode: 405, body: "Method not allowed" } };
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { error: { statusCode: 400, body: "Invalid JSON body" } };
  }
  if (body.password !== password) return { error: { statusCode: 401, body: "Unauthorized" } };
  return { body };
}

export async function githubRequest(token, path, options = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "a-deafening-noise-site",
      ...options.headers,
    },
  });
}

export async function getLatestSuggestionRun(token) {
  const response = await githubRequest(token, `/actions/workflows/${WORKFLOW}/runs?branch=main&event=workflow_dispatch&per_page=1`);
  if (!response.ok) throw new Error(`Could not read workflow runs (${response.status})`);
  return (await response.json()).workflow_runs?.[0] || null;
}

export { WORKFLOW };
