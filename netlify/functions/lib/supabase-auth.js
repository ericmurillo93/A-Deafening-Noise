export function getSupabaseConfiguration() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server is missing Supabase environment variables.");
  return { url, key };
}

export async function requireArchiveUser(event, { admin = false, quota = null } = {}) {
  if (event.httpMethod !== "POST") return { error: { statusCode: 405, body: "Method not allowed" } };
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authorization.startsWith("Bearer ")) return { error: { statusCode: 401, body: "Unauthorized" } };

  try {
  const { url, key } = getSupabaseConfiguration();
  const accessResponse = await fetch(`${url}/rest/v1/rpc/get_my_access`, {
    method: "POST",
    headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(8000),
  });
  if (!accessResponse.ok) return { error: { statusCode: 403, body: "Forbidden" } };
  const profile = await accessResponse.json();
  if (admin && profile.role !== "admin") return { error: { statusCode: 403, body: "Forbidden" } };
  if (quota) {
    const response = await fetch(`${url}/rest/v1/rpc/consume_provider_quota`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ requested_action: quota }),
    });
    if (!response.ok) throw new Error("Quota service unavailable");
    if (!await response.json()) return { error: { statusCode: 429, headers: { "Retry-After": "60" }, body: JSON.stringify({ error: "Request limit reached. Please try again later." }) } };
  }
  return { profile };
  } catch {
    return { error: { statusCode: 503, body: JSON.stringify({ error: "Service temporarily unavailable. Please try again." }) } };
  }
}
