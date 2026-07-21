// netlify/functions/save-concerts.js
// Server-side proxy that writes concerts.json to GitHub.
// The GitHub token lives only on the server. The password is also used by the
// browser login gate, so it should be treated as a lightweight access check.

const REPO = "ericmurillo93/A-Deafening-Noise";
const FILE_PATH = "data/concerts.json";

export async function handler(event) {
  // Only POST is allowed
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const token = process.env.GITHUB_TOKEN;
  const password = process.env.APP_PASSWORD;

  if (!token || !password) {
    return { statusCode: 500, body: "Server is missing required environment variables." };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  // Auth: simple shared password check
  if (body.password !== password) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  if (!body.data || typeof body.data !== "object") {
    return { statusCode: 400, body: "Missing or invalid `data`" };
  }

  const commitMessage = (body.commitMessage || "Update concerts via web").slice(0, 200);
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "a-deafening-noise-site"
  };

  try {
    // 1. Get the current sha
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) {
      return { statusCode: 502, body: `Could not read concerts.json (${getRes.status})` };
    }
    const { sha } = await getRes.json();

    // 2. Write the updated content (base64-encoded JSON)
    const json = JSON.stringify(body.data, null, 2);
    const content = Buffer.from(json, "utf-8").toString("base64");

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMessage, content, sha })
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return { statusCode: 502, body: `GitHub rejected the write: ${errText.slice(0, 200)}` };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: `Function error: ${err.message || "unknown"}` };
  }
}
