export async function loadArchiveSnapshot(call, { previous = {}, includeDiscovery = true, onArchive = () => {} } = {}) {
  const essential = await call("get_my_archive_snapshot");
  if (!essential?.profile) throw new Error("Archive profile unavailable");
  const archive = { suggestions: [], listenedArtists: [], artistImages: [], spotifyStatus: { connected: false, unavailable: true }, ...previous, ...essential };
  onArchive(archive);
  if (!includeDiscovery) return archive;
  try {
    return { ...archive, ...await call("get_my_discovery_snapshot"), discoveryUpdatedAt: Date.now(), discoveryUnavailable: false };
  } catch {
    return { ...archive, discoveryUnavailable: true };
  }
}
