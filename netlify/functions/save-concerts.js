// netlify/functions/save-concerts.js
// Server-side proxy that writes concerts.json to GitHub.
// Legacy JSON backup writer. Supabase is the production source of truth.

import { requireArchiveUser } from "./lib/supabase-auth.js";

const REPO = "ericmurillo93/A-Deafening-Noise";
const FILE_PATH = "data/concerts.json";

export async function handler(event) {
  const auth = await requireArchiveUser(event, { admin: true });
  if (auth.error) return auth.error;

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return { statusCode: 500, body: "Server is missing required environment variables." };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
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
