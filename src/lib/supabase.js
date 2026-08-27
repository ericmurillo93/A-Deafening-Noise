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
  const [data, suggestions, dismissedSuggestions, listenedArtists, artistImages, spotifyStatus, preferences] = await Promise.all([
    rpc("get_app_data"), rpc("get_concert_suggestions"), rpc("get_my_dismissed_suggestions"), rpc("get_my_listened_artists"), rpc("get_my_artist_images"), rpc("get_my_spotify_status"), rpc("get_my_preferences"),
  ]);
  const archive = data || { profile: null, concerts: [], friends: [], friendRequests: [], concertInvitations: [], notifications: [] };
  return { ...archive, profile: archive.profile ? { ...archive.profile, ...preferences } : null, suggestions: suggestions?.suggestions || [], dismissedSuggestions: dismissedSuggestions || [], listenedArtists: listenedArtists || [], artistImages: artistImages || [], spotifyStatus };
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
export const setConcertInvitationStatus = (concertId, status, bought = true) => rpc("set_concert_invitation_status", { target_concert: concertId, new_status: status, response_bought: bought });
export const setStatsSharing = (userId, enabled) => rpc("set_stats_sharing", { friend_user: userId, enabled });
export const getMyStatsShares = () => rpc("get_my_stats_shares");
export const getSocialComparison = (userId) => rpc("get_social_comparison", { friend_user: userId });
export const updateMyProfile = (payload) => rpc("update_my_profile", { payload });
export async function uploadMyAvatar(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Avatar images must be smaller than 2 MB.");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError || new Error("Sign in again to upload an avatar.");
  const path = `${user.id}/avatar`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}
export async function removeMyAvatar() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError || new Error("Sign in again to remove your avatar.");
  const { error } = await supabase.storage.from("avatars").remove([`${user.id}/avatar`]);
  if (error) throw error;
}
export const markNotificationsRead = (ids = null) => rpc("mark_notifications_read", { notification_ids: ids });
export const leaveSharedConcert = (concertId) => rpc("leave_shared_concert", { target_concert: concertId });
export const exportMyData = () => rpc("export_my_data");
export const deleteMyAccount = () => rpc("delete_my_account");
export const adminListUsers = () => rpc("admin_list_users");
export const adminUpdateUser = (userId, role, status) => rpc("admin_update_user", { target_user: userId, new_role: role, new_status: status });
export const adminGetOperations = () => rpc("get_admin_operations");
export const adminGetDataQuality = () => rpc("admin_data_quality");
export const importMyConcerts = (payload) => rpc("import_my_concerts", { payload });
export async function adminGetProviderStatus() {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch("/.netlify/functions/admin-provider-status", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
  if (!response.ok) throw new Error("Provider usage is unavailable");
  return response.json();
}
export const getMySpotifyStatus = () => rpc("get_my_spotify_status");
export const syncMySpotifyArtists = (payload) => rpc("sync_my_spotify_artists", { payload });
export const disconnectMySpotify = () => rpc("disconnect_my_spotify");
