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
  const { data, error } = await supabase.rpc("get_app_data");
  if (error) throw error;
  return data || { profile: null, concerts: [], friends: [], friendRequests: [], concertInvitations: [], dismissedSuggestions: [] };
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const upsertMyConcert = (payload) => rpc("upsert_my_concert", { payload });
export const deleteMyConcert = (concertId) => rpc("delete_my_concert", { target_concert: concertId });
export const searchConcertCatalog = (field, value) => rpc("search_concert_catalog", { search_field: field, search_value: value });
export const saveSetlistId = (concertId, setlistId) => rpc("save_setlist_id", { target_concert: concertId, new_setlist_id: setlistId });
export const saveDismissedSuggestions = (keys) => rpc("save_dismissed_suggestions", { keys });
export const searchProfiles = (query) => rpc("search_profiles", { search_query: query });
export const sendFriendRequest = (userId) => rpc("send_friend_request", { target_user: userId });
export const respondFriendRequest = (requestId, accept) => rpc("respond_friend_request", { request_id: requestId, accept_request: accept });
export const removeFriend = (userId) => rpc("remove_friend", { friend_user: userId });
export const respondConcertInvitation = (concertId, accept, bought = true) => rpc("respond_concert_invitation", { target_concert: concertId, accept_invitation: accept, response_bought: bought });
