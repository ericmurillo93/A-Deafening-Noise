// Storage binaries must be removed through its API, never SQL metadata deletes.
export async function clearMemoryFiles(bucket, userId) {
  async function listAll(folder) {
    const files = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      files.push(...data);
      if (data.length < 1000) return files;
    }
  }
  const paths = [];
  for (const folder of await listAll(userId)) {
    if (folder.id) paths.push(`${userId}/${folder.name}`);
    else for (const file of await listAll(`${userId}/${folder.name}`)) paths.push(`${userId}/${folder.name}/${file.name}`);
  }
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await bucket.remove(paths.slice(start, start + 100));
    if (error) throw error;
  }
}
