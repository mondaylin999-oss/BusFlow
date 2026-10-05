const steps = [
  ["trip", "Trip"],
  ["passengers", "Seats & passengers"],
  ["review", "Review"],
  ["payment", "Awaiting payment"],
  ["ticket", "Ticket"],
] as const;

export type BookingStage = typeof steps[number][0];

export function BookingProgress({ stage }: { stage: BookingStage }) {
  const current = steps.findIndex(([key]) => key === stage);
  return (
    <nav aria-label="Booking progress" className="booking-progress">
      <p className="muted small">Step {current + 1} of {steps.length}: {steps[current][1]}</p>
      <ol>
        {steps.map(([key, label], index) => (
          <li key={key} aria-current={key === stage ? "step" : undefined}
            className={index < current ? "complete" : ""}>
            <span className="booking-step-number" aria-hidden="true">{index < current ? "✓" : index + 1}</span>
            <span>{label}{index < current && <span className="sr-only"> (completed)</span>}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
