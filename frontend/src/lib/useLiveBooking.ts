import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { watchBooking, type HeldBooking } from "./bookingWatcher";

export function useLiveBooking<T extends HeldBooking>(id: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [now, setNow] = useState(Date.now);
  const watcher = useRef<ReturnType<typeof watchBooking<T>> | null>(null);
  useEffect(() => {
    setData(null);
    setError("");
    setNow(Date.now());
    const current = watchBooking(
      () => api.get<T>("/bookings/" + id),
      setData, setError, setChecking, setNow,
    );
    watcher.current = current;
    const resume = () => {
      if (document.visibilityState === "visible") current.resume();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      current.stop();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [id]);
  const refresh = useCallback(() => watcher.current?.refresh(), []);
  return {
    data, now, checking, refresh,
    loading: !data && checking,
    error: data ? "" : error,
    refreshError: data ? error : "",
  };
}
