# BusFlow — User Guide

Use BusFlow to reserve seats, manage tickets, record received payments, and coordinate departures. The menus and records you can access depend on your role and assigned branch.

**For installation, development, configuration, testing, and deployment, see [README1.md — Developer Guide](README1.md).** This guide covers using an application that has already been set up.

## 1. Open the application

Open the website address supplied by your administrator. For a local installation, the usual address is `http://localhost:5173`.

If your local Windows copy is already configured, start PostgreSQL, then open `start-backend.bat` and `start-frontend.bat`. Keep both terminal windows open while using the app. First-time installation instructions are in the Developer Guide.

## 2. Sign in

Enter your username and password, then select **Sign in**. Staff accounts must be created and assigned by an administrator.

New passengers can select **New passenger? Create an account**, then enter their full name, username, and a password of at least 12 characters. If you forget your password, contact the administrator; self-service password recovery is not included.

Use the sun/moon button to change the theme. On a phone, use the menu button or bottom navigation. Select **Sign out** when finished, especially on shared computers.

## 3. Passengers: reserve seats

1. Open **Find trips**.
2. Enter the departure city, destination, or date, then select **Search trips**. Leave filters blank to see all trips available to your account.
3. Review the bus, departure time, arrival time, boarding gate, fare, and available seats.
4. Select **Choose seats** and choose up to six available seats. Selected seats turn blue; grey seats cannot be selected.
5. Enter each passenger's full name and phone number.
6. Check the total and select **Reserve seats & review**.
7. Keep the booking reference and note the hold deadline.

Selecting a seat alone does not reserve it. The hold starts when you submit the passenger form and lasts 10 minutes by default. If someone reserves a seat first, choose another one and try again.

All departure times use Myanmar time. Prices are in Myanmar kyat (MMK). Tickets cover the full route; booking individual sections between stops is not included.

## 4. Arrange payment and confirm the booking

This MVP does **not** accept online payments inside the application. Contact authorized company staff to arrange payment and provide your booking reference. Staff must verify receipt and record the payment before your hold expires.

| Status | Meaning |
| --- | --- |
| Held | Seats are temporarily reserved, awaiting payment confirmation. |
| Confirmed | Staff recorded received payment and a ticket was issued. |
| Expired | The hold deadline passed; make a new reservation if seats are still available. |
| Cancelled | The reservation was cancelled. |

Refresh the booking page after staff confirms payment. A held reservation is not a confirmed travel ticket.

## 5. View and print tickets

1. Open **Bookings & tickets**.
2. Search by booking reference, passenger name, or phone number.
3. Select **View booking**.
4. Check the passenger names, seats, route, departure time, and boarding gate.
5. On a confirmed booking, select **Print / save PDF**. Choose a printer or the browser's PDF destination.

The ticket includes a QR code containing a ticket reference. Follow the arrival instructions printed on the ticket and keep the reference available for boarding checks.

## 6. Cancel a booking

Open the booking, enter a reason in **Cancel booking**, and select **Confirm cancellation** only when you intend to cancel.

The application checks the cancellation window and ticket status. The default deadline is two hours before departure, but the company may configure a different policy. Boarded tickets cannot be cancelled through this workflow.

Cancelling a paid booking creates a refund request. The default refund is 90% of the recorded payment, subject to the company's configured policy. Staff processes the refund separately and records completion. The application does not transfer money automatically. Contact company staff for refund arrangements.

## 7. Counter staff: sell tickets

1. Sign in with your assigned counter account.
2. Search for a trip, choose seats, enter passenger details, and select **Reserve seats & review**.
3. After receiving and verifying payment, use **Record received payment**.
4. Choose **Cash**, **Bank transfer**, or **Mobile wallet** and enter the unique receipt or transaction reference.
5. Select **Confirm payment received**.
6. Check that the booking is **Confirmed**, then print the ticket.

Use **Bookings & tickets** to find and reprint tickets available to your counter. If a customer or agent booking is outside your scope, ask authorized branch or head-office staff to handle it.

## 8. Agents: bookings and commission

Reserve passenger seats through **Find trips**. Keep the booking reference and arrange payment confirmation with authorized staff before the hold expires. Agent accounts cannot mark payments received.

Use **Bookings & tickets** to view your own bookings and **My commission** to view commissions. A commission is recorded when staff confirms an agent booking's payment; cancelling the booking reverses it. Agent wallets and automatic settlements are not included.

## 9. Drivers: operate assigned trips

1. Open the trip navigation and select **Open trip** for an assigned departure.
2. Review the bus, route, stops, and passenger manifest.
3. In **Trip operations**, select the next status and choose **Update trip**.

The normal sequence is:

`scheduled → boarding → departed → in_transit → arrived → completed`

A scheduled trip can be marked `delayed`, then moved to `boarding`. Required states cannot be skipped. Update the status when the actual operation reaches that stage.

## 10. Conductors: check passengers

1. Select **Open trip** for your assigned departure.
2. Search the **Passenger manifest** by passenger name, seat, or ticket reference.
3. Check the passenger against their ticket.
4. Select **Board** when they board, or **No-show** when appropriate.

Boarding updates are available while the trip is `boarding` or `departed`. Ask authorized operations staff to update the trip status first if needed. Select **Print manifest** for a paper list.

Camera QR scanning is not included. Enter the ticket reference or use a scanner that types the reference into the search field.

## 11. Managers and administrators

Depending on your permissions, these menus are available:

| Menu | Purpose |
| --- | --- |
| Overview | Review departures, available seats, and recent notifications. |
| Find trips | Search departures, view seat availability, and open trip operations. |
| Bookings & tickets | Find bookings, record permitted payments, print tickets, and cancel allowed reservations. |
| Branches & fleet | View branches, counters, buses, and routes. Authorized administrators can add branches, buses, routes, and dated trips. |
| People | View accounts and create permitted staff or customer accounts. |
| Payments & refunds | Review receipts and refund requests within your scope. |
| Audit trail | Review recorded business actions. |
| Company settings | Update the company name, contact details, address, and ticket footer. |

Not every manager has all menus. Branch managers see their assigned branch; regional managers see their assigned region. Some setup forms require technical details such as route-stop coordinates. Ask your developer or system administrator for help with these forms.

## 12. Finance staff: complete refunds

Open **Payments & refunds**, review the pending refund, and verify that the refund has actually been paid through the company's payment process. If your account has permission, select **Confirm refund paid** to record completion.

This action records a refund; it does not send money. Records should match the company's actual receipts and transfers.

## 13. Common problems

| Problem | What to do |
| --- | --- |
| Cannot reach the server | Ask the administrator to check the services. For a local copy, confirm PostgreSQL and both application terminals are running. |
| Sign-in fails | Check your username and password; ask the administrator to check your account if necessary. |
| Too many login attempts | Wait before retrying. Repeated failures temporarily block further attempts. |
| No matching trips | Clear filters, check city spelling and date, or ask staff about available departures. |
| Seat no longer available | Refresh the inventory and choose a different seat. |
| Hold expired | Make a new reservation. The previous seats may now be available to other people. |
| Page or record access denied | Ask the administrator to check your role and assignment. |
| Trip status change rejected | Follow the permitted status sequence. |
| Map fails to load | Check internet access. Trip information remains available without map tiles or road routing. |
| Forgotten password | Contact the administrator. Self-service recovery is not included. |

## 14. Current version

This release is a working MVP for reservations, staff-recorded payments, tickets, selected branch administration, and basic trip operations. It does not include a live payment gateway, automatic refund transfers, camera scanning, full accounting, or every feature in the master specification.

See [README1.md](README1.md) for technical setup and support, [MVP_SCOPE.md](docs/MVP_SCOPE.md) for detailed limitations, and [VALIDATION.md](docs/VALIDATION.md) for the existing application test results.
