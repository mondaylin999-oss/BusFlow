import { describe, expect, it } from "vitest";
import { reconcileSeats, toggleSeat, type PassengerDraft } from "../src/lib/seatSelection";

const drafts: PassengerDraft[] = [
  { seatId: 1, seatNumber: "1A", name: "First Passenger", phone: "091111111" },
  { seatId: 2, seatNumber: "1B", name: "Second Passenger", phone: "092222222" },
];

describe("seat conflict recovery", () => {
  it("clears held, booked and missing seats while preserving passenger details", () => {
    for (const seats of [
      [{ id: 1, status: "held" }, { id: 2, status: "available" }],
      [{ id: 1, status: "booked" }, { id: 2, status: "available" }],
      [{ id: 2, status: "available" }],
    ]) {
      const recovered = reconcileSeats(drafts, seats);
      expect(recovered[0]).toEqual({ ...drafts[0], seatId: null });
      expect(recovered[1]).toEqual(drafts[1]);
      expect(drafts[0].seatId).toBe(1);
    }
  });

  it("assigns a replacement to the affected passenger without changing other passengers", () => {
    const recovered = reconcileSeats(drafts, [{ id: 2, status: "available" }]);
    const replaced = toggleSeat(recovered, 3, "2A");
    expect(replaced).toEqual([{ ...drafts[0], seatId: 3, seatNumber: "2A" }, drafts[1]]);
  });

  it("replaces multiple conflicts in passenger order, including repeated conflicts", () => {
    const recovered = reconcileSeats(drafts, []);
    const first = toggleSeat(recovered, 3, "2A");
    const second = toggleSeat(first, 4, "2B");
    const repeated = reconcileSeats(second, [{ id: 4, status: "available" }]);
    expect(toggleSeat(repeated, 5, "3A")).toEqual([
      { ...drafts[0], seatId: 5, seatNumber: "3A" },
      { ...drafts[1], seatId: 4, seatNumber: "2B" },
    ]);
  });

  it("does not assign duplicate seats when an available selection is toggled off", () => {
    const recovered = reconcileSeats(drafts, [{ id: 2, status: "available" }]);
    expect(toggleSeat(recovered, 2, "1B")).toEqual([recovered[0]]);
  });

  it("allows replacements at the six-passenger limit but no additional passengers", () => {
    const six = Array.from({ length: 6 }, (_, index) => ({
      ...drafts[0], seatId: index + 1, seatNumber: String(index + 1),
    }));
    expect(toggleSeat(six, 7, "7")).toEqual(six);
    const recovered = reconcileSeats(six, six.slice(1).map(p => ({ id: p.seatId, status: "available" })));
    const replaced = toggleSeat(recovered, 7, "7");
    expect(replaced).toHaveLength(6);
    expect(replaced[0]).toEqual({ ...six[0], seatId: 7, seatNumber: "7" });
  });

  it("preserves pending replacements on subsequent inventory refreshes", () => {
    const recovered = reconcileSeats(drafts, []);
    expect(reconcileSeats(recovered, [{ id: 1, status: "available" }])).toEqual(recovered);
  });
});
