const DATABASE_NAME = "a-deafening-noise";
const DATABASE_VERSION = 1;
const STORE_NAME = "user-data";
const CACHE_SCHEMA_VERSION = 3;

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(mode, operation) {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function readAppCache(userId) {
  if (!userId) return null;
  try {
    const cached = await useStore("readonly", (store) => store.get(userId));
    if (!cached || cached.schemaVersion !== CACHE_SCHEMA_VERSION || !cached.data) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function writeAppCache(userId, data) {
  if (!userId || !data) return;
  try {
    await useStore("readwrite", (store) => store.put({ schemaVersion: CACHE_SCHEMA_VERSION, savedAt: Date.now(), data }, userId));
  } catch {
    // Cache failure must never prevent Supabase-backed operation.
  }
}

export async function clearAppCache() {
  try { await useStore("readwrite", (store) => store.clear()); }
  catch { /* Best-effort cleanup on logout. */ }
}
