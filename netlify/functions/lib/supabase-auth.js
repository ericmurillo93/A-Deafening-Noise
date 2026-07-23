const ARCHIVE_USERS = new Set([
  "eric.murillo93@gmail.com",
  "rpsaray@gmail.com",
  "murillodma@gmail.com",
]);

export function getSupabaseConfiguration() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server is missing Supabase environment variables.");
  return { url, key };
}

export async function requireArchiveUser(event, { admin = false } = {}) {
  if (event.httpMethod !== "POST") return { error: { statusCode: 405, body: "Method not allowed" } };
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authorization.startsWith("Bearer ")) return { error: { statusCode: 401, body: "Unauthorized" } };

  const { url, key } = getSupabaseConfiguration();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization },
  });
  if (!response.ok) return { error: { statusCode: 401, body: "Unauthorized" } };

  const user = await response.json();
  const email = user.email?.toLowerCase();
  if (!ARCHIVE_USERS.has(email) || (admin && email !== "eric.murillo93@gmail.com")) {
    return { error: { statusCode: 403, body: "Forbidden" } };
  }
  return { user };
}

export async function getArchiveData(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const { url, key } = getSupabaseConfiguration();
  const response = await fetch(`${url}/rest/v1/rpc/get_concert_data`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Could not read the Supabase archive (${response.status})`);
  return response.json();
}
