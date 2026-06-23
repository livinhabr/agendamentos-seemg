import { useCallback, useEffect, useState } from "react";
import type { PgErr } from "@/lib/data/agenda";

export function useResource<T = any>(
  loader: () => Promise<{ data: T[]; error: PgErr }>,
  deps: any[],
) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<PgErr>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    const r = await loader();
    setData(r.data);
    setError(r.error);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
