const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required");
const response = await fetch(`${url}/rest/v1/rpc/get_active_discovery_countries`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!response.ok) throw new Error(`Could not load discovery countries (${response.status})`);
const countries = (await response.json()).filter((country) => /^[A-Z]{2}$/.test(country));
process.stdout.write(`DISCOVERY_COUNTRIES=${countries.join(",") || "ES,CH"}\n`);
