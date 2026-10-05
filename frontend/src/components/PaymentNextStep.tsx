type Props = {
  reference: string;
  total: string;
  deadline: string;
  remaining: number;
  checking: boolean;
  phone?: string;
  email?: string;
  canRecordPayment: boolean;
  onRefresh: () => void;
};

export function PaymentNextStep({
  reference,
  total,
  deadline,
  remaining,
  checking,
  phone,
  email,
  canRecordPayment,
  onRefresh,
}: Props) {
  const contactPhone = phone?.trim() || "";
  const dialPhone = contactPhone.replace(/[\s().-]/g, "");
  const canCall = /^\+?\d{5,15}$/.test(dialPhone);
  const contactEmail = email?.trim() || "";
  const canEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(contactEmail);
  const emailQuery = new URLSearchParams({
    subject: `Payment arrangements for booking ${reference}`,
    body: `Hello, I would like to arrange payment for booking ${reference}.\nTotal: ${total}.\nSeats held until: ${deadline} (Myanmar time).\nPlease let me know how to pay and confirm my booking.`,
  }).toString().replace(/\+/g, "%20");

  if (remaining <= 0) return (
    <section className="notice payment-next-step" aria-label="Payment next step">
      <h3>Hold deadline reached</h3>
      <p role="status">Checking the latest booking status. Do not send payment until staff confirms your reservation is still valid.</p>
      <p>Booking reference: <strong>{reference}</strong></p>
      <button type="button" onClick={onRefresh} disabled={checking}>
        {checking ? "Checking status…" : "Check booking status"}
      </button>
    </section>
  );

  return (
    <section className="notice payment-next-step" aria-label="Payment next step">
      <h3>{canRecordPayment ? "Next: record received payment" : "Next: arrange payment"}</h3>
      <p className="hold-countdown" role="timer" aria-live="off">
        Time left to confirm payment: <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
      </p>
      <p>
        Your seats are held until <strong>{deadline} (Myanmar time)</strong>.
        This reservation is awaiting payment confirmation; it is not yet a travel ticket.
      </p>
      <p>
        {canRecordPayment
          ? "After verifying receipt, use the Record received payment form below before the hold expires."
          : "Contact company staff to arrange payment. Staff must verify receipt and record your payment before the hold expires."}
        {" "}Online payment is not available here.
      </p>
      <p>
        Quote booking <strong>{reference}</strong> · Amount due: <strong>{total}</strong>
      </p>
      {(canCall || canEmail) ? (
        <div className="payment-contact-actions">
          {canCall && (
            <a className="button primary" href={`tel:${dialPhone}`}>
              Call company: {contactPhone}
            </a>
          )}
          {canEmail && (
            <a className="button" href={`mailto:${encodeURIComponent(contactEmail)}?${emailQuery}`}>
              Email company: {contactEmail}
            </a>
          )}
        </div>
      ) : (
        <p>
          Company contact details are not available here. Visit the company's booking
          counter or contact the staff member who arranged your reservation.
        </p>
      )}
      <p>Already paid? Status updates automatically every 15 seconds. Wait for staff confirmation before using this reservation to travel.</p>
      <button type="button" onClick={onRefresh} disabled={checking}>
        {checking ? "Checking status…" : "Check payment status"}
      </button>
    </section>
  );
}
