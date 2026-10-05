import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingProgress, type BookingStage } from "../src/components/BookingProgress";
import { BookingReview } from "../src/components/BookingReview";

describe("guided booking steps", () => {
  it.each<BookingStage>(["trip", "passengers", "review", "payment", "ticket"])(
    "marks exactly one current step for %s", stage => {
      const html = renderToStaticMarkup(<BookingProgress stage={stage} />);
      expect(html.match(/aria-current="step"/g)).toHaveLength(1);
      expect(html.match(/<li\b/g)).toHaveLength(5);
      expect(html).toContain('aria-label="Booking progress"');
    },
  );

  it("does not represent a held booking as a completed ticket", () => {
    const html = renderToStaticMarkup(<BookingProgress stage="payment" />);
    expect(html).toContain("Step 4 of 5: Awaiting payment");
    expect(html).not.toContain("Ticket<span class=\"sr-only\"> (completed)");
    expect(html.match(/\(completed\)/g)).toHaveLength(3);
  });

  const props = {
    route: "Yangon → Mandalay", departure: "5 Oct 2026, 09:00",
    arrival: "5 Oct 2026, 18:00", bus: "BUS-01", gate: "Gate A",
    total: "25,000 MMK", passengers: [{ seatId: 1, seatNumber: "1A", name: "Test Passenger", phone: "091234567" }],
    busy: false, onEdit() {}, onReserve() {},
  };

  it("shows the full review and explains when the hold begins", () => {
    const html = renderToStaticMarkup(<BookingReview {...props} />);
    for (const expected of ["Yangon → Mandalay", "09:00", "18:00", "BUS-01", "Gate A", "1A", "Test Passenger", "091234567", "25,000 MMK", "Seats are not held yet", "Back to seats &amp; passengers", "Reserve seats"])
      expect(html).toContain(expected);
    expect(html).toContain('tabindex="-1"');
  });

  it("disables both review actions while a reservation is being submitted", () => {
    const html = renderToStaticMarkup(<BookingReview {...props} busy />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Reserving…");
  });
});
