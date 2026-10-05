import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdSeconds, watchBooking } from "../src/lib/bookingWatcher";

describe("live booking status", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T10:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  const held = (seconds = 60) => ({ status: "held", held_until: new Date(Date.now() + seconds * 1000).toISOString() });
  const start = (fetch: () => Promise<ReturnType<typeof held>>) => {
    const data = vi.fn(), error = vi.fn(), checking = vi.fn(), tick = vi.fn();
    return { ...watchBooking(fetch, data, error, checking, tick), data, error, checking, tick };
  };

  it("uses wall-clock time and clamps expired countdowns", () => {
    const deadline = held(60).held_until;
    expect(holdSeconds(deadline, Date.now())).toBe(60);
    expect(holdSeconds(deadline, Date.now() + 59_500)).toBe(1);
    expect(holdSeconds(deadline, Date.now() + 80_000)).toBe(0);
  });

  it("polls held bookings and stops fetching after confirmation", async () => {
    const booking = held();
    const fetch = vi.fn().mockResolvedValueOnce(booking).mockResolvedValue({ ...booking, status: "confirmed" });
    const watcher = start(fetch);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(watcher.data).toHaveBeenLastCalledWith({ ...booking, status: "confirmed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it("refreshes at expiry before the next periodic check", async () => {
    const booking = held(3);
    const fetch = vi.fn().mockResolvedValueOnce(booking).mockResolvedValue({ ...booking, status: "expired" });
    const watcher = start(fetch);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(watcher.data).toHaveBeenLastCalledWith({ ...booking, status: "expired" });
    watcher.stop();
  });

  it("preserves data after a failed poll and recovers when the tab resumes", async () => {
    const booking = held();
    const fetch = vi.fn().mockResolvedValueOnce(booking).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(booking);
    const watcher = start(fetch);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(watcher.data).toHaveBeenCalledTimes(1);
    expect(watcher.error).toHaveBeenLastCalledWith("Offline");
    watcher.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.error).toHaveBeenLastCalledWith("");
    expect(fetch).toHaveBeenCalledTimes(3);
    watcher.stop();
  });

  it("does not overlap slow polls; manual refresh fetches after the older read", async () => {
    const booking = held();
    let resolve!: (value: typeof booking) => void;
    const fetch = vi.fn().mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValue({ ...booking, status: "cancelled" });
    const watcher = start(fetch);
    const manual = watcher.refresh();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(booking);
    await manual;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(watcher.data).toHaveBeenLastCalledWith({ ...booking, status: "cancelled" });
    watcher.stop();
  });

  it("ignores responses after leaving the booking and clears its timer", async () => {
    const booking = held();
    let resolve!: (value: typeof booking) => void;
    const fetch = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    const watcher = start(fetch);
    watcher.stop();
    resolve(booking);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(watcher.data).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
