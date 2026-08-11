import { useCallback, useEffect, useState } from "react";

const inFlightLoads = new Map();

function runLoader(loader, cacheKey) {
  if (!cacheKey) return loader();
  if (inFlightLoads.has(cacheKey)) return inFlightLoads.get(cacheKey);
  const request = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inFlightLoads.get(cacheKey) === request) inFlightLoads.delete(cacheKey);
    });
  inFlightLoads.set(cacheKey, request);
  return request;
}

export function useAsyncData(loader, deps = [], options = {}) {
  const cacheKey = options.cacheKey;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    let active = true;
    setLoading(true);
    setError(null);
    try {
      const result = await runLoader(loader, cacheKey);
      if (active) setData(result);
      return result;
    } catch (caughtError) {
      if (active) setError(caughtError);
      return null;
    } finally {
      if (active) setLoading(false);
    }
  }, [...deps, cacheKey]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    runLoader(loader, cacheKey)
      .then((result) => {
        if (!ignore) setData(result);
      })
      .catch((caughtError) => {
        if (!ignore) setError(caughtError);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [...deps, cacheKey]);

  return { data, loading, error, reload, setData };
}
