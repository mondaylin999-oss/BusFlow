import type { PassengerDraft } from "../lib/seatSelection";

export function BookingReview({ route, departure, arrival, bus, gate, total, passengers, busy, onEdit, onReserve }: {
  route: string;
  departure: string;
  arrival: string;
  bus: string;
  gate: string;
  total: string;
  passengers: PassengerDraft[];
  busy: boolean;
  onEdit: () => void;
  onReserve: () => void;
}) {
  return (
    <section className="stack" aria-labelledby="booking-stage-heading">
      <h3 id="booking-stage-heading" tabIndex={-1}>Review your reservation</h3>
      <div>
        <strong>{route}</strong>
        <p>Departs {departure} · Arrives {arrival} (Myanmar time)</p>
        <p>{bus} · Boarding gate: {gate}</p>
      </div>
      <ul className="booking-review-passengers">
        {passengers.map((p, index) => (
          <li key={index}>
            <strong>Seat {p.seatNumber} · {p.name}</strong>
            <span>{p.phone}</span>
          </li>
        ))}
      </ul>
      <p className="total">Total for {passengers.length} passenger{passengers.length === 1 ? "" : "s"} <strong>{total}</strong></p>
      <p className="notice">
        Seats are not held yet. Select Reserve seats to start your hold, then
        contact company staff to arrange payment before the deadline shown on your
        booking. Your ticket is issued after staff records payment. Online payment
        is not available here.
      </p>
      <div className="payment-contact-actions">
        <button type="button" onClick={onEdit} disabled={busy}>Back to seats & passengers</button>
        <button type="button" className="primary" onClick={onReserve} disabled={busy}>
          {busy ? "Reserving…" : "Reserve seats"}
        </button>
      </div>
    </section>
  );
}
