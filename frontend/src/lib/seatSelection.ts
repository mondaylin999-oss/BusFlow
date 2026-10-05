export type PassengerDraft = {
  seatId: number | null;
  seatNumber: string;
  name: string;
  phone: string;
};
export type SeatAvailability = { id: number; status: string };

export function reconcileSeats(drafts: PassengerDraft[], seats: SeatAvailability[]) {
  const available = new Set(seats.filter(s => s.status === "available").map(s => s.id));
  return drafts.map(draft =>
    draft.seatId !== null && !available.has(draft.seatId)
      ? { ...draft, seatId: null }
      : draft,
  );
}

export function toggleSeat(drafts: PassengerDraft[], seatId: number, seatNumber: string) {
  if (drafts.some(draft => draft.seatId === seatId))
    return drafts.filter(draft => draft.seatId !== seatId);
  const replacement = drafts.findIndex(draft => draft.seatId === null);
  if (replacement !== -1)
    return drafts.map((draft, index) => index === replacement ? { ...draft, seatId, seatNumber } : draft);
  if (drafts.length >= 6) return drafts;
  return [...drafts, { seatId, seatNumber, name: "", phone: "" }];
}
