# Validation record

Validated locally on Windows on 8 September 2026 using a separate PostgreSQL cluster on localhost port 55439. The supplied project's database and files were not changed. Final API checks ran against a second freshly created and seeded database.

| Check | Result |
| --- | --- |
| Backend TypeScript check | Passed |
| Backend production compilation | Passed |
| Frontend TypeScript check | Passed |
| Frontend Vite production build | Passed |
| Schema install into empty PostgreSQL | Passed |
| Development seed | Passed |
| Unit tests | 13 passed |
| PostgreSQL/HTTP integration assertions | 29 passed |
| Backend and frontend production dependency audits | 0 reported vulnerabilities at validation time |
| Optional C++17 compilation | Passed |
| Optional C++ integer examples | 30001 × 5% = 1500; 45000 × 90% = 40500 |

## Integration coverage

Health; anonymous denial; counter denial from user administration; branch list and ID isolation; concurrent requests for the same seat (exactly one 201 and one 409); customer ownership; customer payment-forgery denial; forged branch request denial; duplicate payment idempotency and one persisted payment; ticket confirmation; policy cancellation; refund calculation and completion; released cancelled seats; expired-payment denial and automatic seat reclamation; agent booking isolation and commission; invalid trip-state rejection; driver assignment and boarding transition; conductor manifest and boarding; manifest denial to customers; audit generation and immutability.

Unit tests cover region/company/branch/counter ownership, customer/agent ownership, explicit permissions, integer calculations and state transitions.

## Browser checks

- Administrator login and role navigation rendered successfully.
- Desktop overview inspected in dark mode; trip search inspected in light mode.
- A 24-seat layout loaded from the API, seat A1 selected, passenger form submitted, and a hold created through the UI.
- A disposable manual receipt was recorded through the UI; booking became confirmed and a QR ticket appeared.
- Leaflet map displayed route stops and OSRM road distance/duration.
- Confirmed ticket and QR/footer inspected at a 390 × 844 phone viewport, with bottom navigation visible and the table contained in its card.

No live money moved; browser actions used disposable test records. External gateways, camera scanning, printers and all physical mobile devices were not tested. Print CSS exists, but actual paper/PDF output was not visually verified. This is not a load test or an independent security audit.

The Vite build reports a nonfatal >500 kB chunk warning for the inherited Leaflet Routing Machine dependency (loaded dynamically). Full translation and all master-specification features remain outside this MVP. See MVP_SCOPE.md.
