export type HeldBooking = { status: string; held_until: string };

// Keep background reads serialized. A manual refresh waits for any older read
// so a payment/cancellation response cannot be replaced by stale booking data.
export function watchBooking<T extends HeldBooking>(
  fetchBooking: () => Promise<T>,
  onData: (booking: T) => void,
  onError: (message: string) => void,
  onChecking: (checking: boolean) => void,
  onTick: (now: number) => void,
) {
  let stopped = false;
  let booking: T | null = null;
  let pending: Promise<void> | null = null;
  let lastCheck = 0;
  let checkedExpiry = false;

  async function refresh(): Promise<void> {
    if (pending) {
      await pending;
      if (!stopped) return refresh();
      return;
    }
    if (stopped) return;
    lastCheck = Date.now();
    onChecking(true);
    pending = (async () => {
      try {
        const next = await fetchBooking();
        if (stopped) return;
        if (next.held_until !== booking?.held_until) checkedExpiry = false;
        booking = next;
        onData(next);
        onError("");
      } catch (error) {
        if (!stopped) onError(error instanceof Error ? error.message : "Could not refresh booking.");
      } finally {
        if (!stopped) onChecking(false);
      }
    })();
    await pending;
    pending = null;
  }

  const timer = setInterval(() => {
    if (booking?.status !== "held") return;
    const now = Date.now();
    onTick(now);
    if (pending) return;
    const expired = now >= Date.parse(booking.held_until);
    if ((expired && !checkedExpiry) || now - lastCheck >= 15_000) {
      if (expired) checkedExpiry = true;
      void refresh();
    }
  }, 1000);

  void refresh();
  return {
    refresh,
    resume() {
      onTick(Date.now());
      if (!pending && booking?.status === "held") void refresh();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

export function holdSeconds(deadline: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
}
