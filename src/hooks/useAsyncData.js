import { useCallback, useEffect, useState } from "react";

export function useAsyncData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    let active = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (active) setData(result);
      return result;
    } catch (caughtError) {
      if (active) setError(caughtError);
      return null;
    } finally {
      if (active) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    loader()
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
  }, deps);

  return { data, loading, error, reload, setData };
}
