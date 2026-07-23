import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnabled = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function loadConcertData() {
  const { data, error } = await supabase.rpc("get_concert_data");
  if (error) throw error;
  return data || { concerts: [], dismissedSuggestions: [] };
}

export async function replaceConcertData(payload) {
  const { error } = await supabase.rpc("replace_concert_data", { payload });
  if (error) throw error;
}
