// Bounded, in-memory promises: concurrent callers share one request.
export function createRequestCache({ max = 100, ttl = 300000 } = {}) {
  const entries = new Map();
  return {
    clear() { entries.clear(); },
    get(key, request) {
      const cached = entries.get(key);
      if (cached && cached.expires > Date.now()) return cached.promise;
      entries.delete(key);
      const entry = { expires: Date.now() + ttl };
      entry.promise = Promise.resolve().then(request).catch(error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      while (entries.size > max) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
  };
}
