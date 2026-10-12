# BusFlow — Developer Guide

A self-hosted multi-branch bus booking application adapted from the supplied BiteN Go v6.1 reference. React 19 + Vite + TypeScript frontend, Express + TypeScript API, and central PostgreSQL database. **This is the agreed MVP, not completion of all 151 sections of the source specification.**

For passenger and staff operating instructions, see [README.md](README.md). This guide covers installation, architecture, configuration, testing, and deployment.

## Development setup

Requirements: Node.js 22.12+ (24 LTS recommended), npm, and PostgreSQL 16+ with a database you can create. No C++ compiler is required. The ZIP contains source and lockfiles; install dependencies before running.

1. Extract the ZIP into a folder such as `C:\Projects\BusFlow`.
2. Create a **new** PostgreSQL database. Do not run this schema against your old BiteN Go database:

   ```sh
   createdb -U postgres busflow
   ```

3. Copy `backend/.env.example` to `backend/.env`. Set:
   - `DATABASE_URL` to your new database connection string; URL-encode special characters in the password.
   - `JWT_SECRET` to a random secret. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `SEED_PASSWORD` to your chosen development password (at least 12 characters).

4. Install and initialize the backend:

   ```sh
   cd backend
   npm ci
   npm run db:migrate
   npm run seed
   npm run dev
   ```

5. In a second terminal, from the project folder:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

6. Open **http://localhost:5173**. Sign in with `admin` and your `SEED_PASSWORD`.

PowerShell users whose execution policy blocks `npm.ps1` can use `npm.cmd` instead. The `start-backend.bat` and `start-frontend.bat` launch each service after installation. PostgreSQL must already be running.

The seed refuses nonempty company data and refuses `NODE_ENV=production`. It creates five branches, five counters, two bus layouts (32 and 24 seats), two routes with map stops, schedules, fourteen upcoming trips, sample payment/ticket, and these accounts:

| Username | Role / scope |
| --- | --- |
| admin | Super administrator, company-wide |
| head01 | Head office administrator |
| regional01 | Yangon regional manager |
| branch01 | Yangon branch manager |
| branch02 | Mandalay branch manager |
| counter01 | Yangon Counter 1 |
| agent01, agent02 | Separate ticket agents |
| driver01 | Assigned trip driver |
| conductor01 | Assigned trip conductor |
| customer01, customer02 | Separate customers |
| finance01 | Finance staff |
| operations01 | Operations staff |

All development accounts use the configured seed password. No actual `.env`, credentials from the supplied ZIP, database dump, or test database is distributed. Create and secure real accounts before any real deployment.

## Demonstrate a complete booking

1. Sign in as `customer01`, open **Find trips**, choose a departure and up to six seats, and enter passenger names and phone numbers.
2. Select **Reserve seats & review**. Copy the booking reference and note the hold deadline (10 minutes by default).
3. In a separate browser session, sign in as `admin`. Open **Bookings & tickets**, find the reference, and record a verified received payment using a unique receipt reference.
4. Refresh the customer's booking. A printable ticket with a reference-only QR code is available. Browser Print can save it as PDF.
5. As `driver01`, open the assigned trip and change its status to `boarding`.
6. As `conductor01`, open the trip's manifest, enter the ticket reference in the search field, and mark the passenger boarded.

Counter staff can reserve, record payment, and print in one session. Customer and agent users cannot mark a payment received. For their reservations, head office or authorized branch staff records the receipt. Payment methods are **manual records of cash, bank transfer, or mobile-wallet receipts**. There is no live gateway, money transfer, or automatic receipt verification. Refund completion similarly records a payment that staff has independently made.

## Included workflows

- Local login, customer registration, hashed passwords, JWT sessions, login throttling, explicit database permissions.
- Region/branch/counter scoping and agent/customer ownership enforced by the API.
- Role-aware navigation and overview, trip search and pagination, live database seat inventory, seat selection and passenger entry.
- Transactional holds, expiry, duplicate-seat prevention, payment idempotency, tickets, cancellation policy and pending refunds.
- Agent commission statements; cancellation reverses earned commission.
- Assigned driver trip transitions and conductor manifest/boarding with ticket-reference lookup.
- Organization/fleet/route lists, new branch, new bus with generated layout, new route with stops, new dated trip with bus/crew overlap validation, and user creation.
- Finance receipt/refund lists, append-only audit table, persisted booking notifications.
- Editable company name/contact/ticket footer, light/dark theme, responsive navigation, Leaflet/OSRM route map.

Amounts are whole MMK integers. Tickets cover the full route. A single company is seeded; branch hierarchy is independent of role. Staff have one branch/counter assignment; regional managers have one region.

## Project layout and reference reuse

```text
frontend/src/components/ui.tsx       Reused shared cards, fields and state components
frontend/src/components/RouteMap.tsx Reused Leaflet/OSRM map
frontend/src/lib/api.ts              Adapted single REST client
frontend/src/lib/auth.tsx            Adapted shared authentication context
frontend/src/lib/prefs.tsx            Reused token-based theme preferences
frontend/src/App.tsx                 Bus portals and workflow forms
frontend/src/bus.css                 Bus-specific responsive layouts
backend/src/auth.ts                  Reused scrypt and JWT implementation
backend/src/app.ts                   REST endpoints, validation and transactions
backend/src/policy.ts                Authorization and state-transition policies
backend/src/database.ts              Shared PostgreSQL pool and transaction helper
backend/src/seed.ts                  Configurable development seed
database/schema.sql                 Bus-domain schema and constraints
backend/cpp/                        Optional integer percentage engine
docs/                               Scope, test evidence and source specification
```

The existing React/Vite/Express/PostgreSQL stack, shared UI, REST access pattern, authentication implementation, map and theme tokens are retained. Domain-specific canteen, student wallet and monthly ferry-pass modules are not carried into the bus application. The old schema and ORM mappings were replaced with a separate bus schema and parameterized PostgreSQL queries; it is a **new-database adaptation**, not an in-place migration. Original project files are untouched. See `docs/MVP_SCOPE.md` for omitted features.

## Validation

```sh
cd backend
npm run check
npm run build
npm test
cd ../frontend
npm run check
npm run build
node ../backend/node_modules/vitest/vitest.mjs run tests
```

The frontend tests use the backend's installed Vitest runner and cover booking status timing and seat-conflict recovery; no database is required.

For database/API tests, create a disposable database, point `backend/.env` to it, run migration and seed, then:

```powershell
cd backend
$env:ALLOW_TEST_WRITES = 'yes'
npm run test:integration
```

On bash use `ALLOW_TEST_WRITES=yes npm run test:integration`. These tests mutate bookings, payments, boarding, and audit data. Use a freshly seeded database for each run. Never point this command at real business data. See `docs/VALIDATION.md` for the delivered test results.

## Configuration

Backend `.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_ORIGIN`, `COMPANY_NAME`, `HOLD_MINUTES`, `CANCEL_HOURS`, `REFUND_PERCENT`, `COMMISSION_PERCENT`. Company name is copied into the database during seeding; subsequent changes use Company settings. Default cancellation deadline is two hours before departure; default refund is 90%, agent commission 5% (rounded down to whole MMK). Holds expire logically on reads and are reclaimed transactionally on inventory access/booking; a background timer is not required.

Frontend normally uses `/api` through Vite's proxy. Set `VITE_API_URL` only if hosting the API elsewhere. On a LAN, set the API's `FRONTEND_ORIGIN` to the browser origin in use. The default is `http://localhost:5173`. The map requests OpenStreetMap tiles and public OSRM geometry; internet is needed for these. It labels a straight-line fallback if road routing fails. Configure `VITE_OSRM_URL` for your own routing service.

Display currency and time are currently MMK and Myanmar time. Other currencies/timezones, full Myanmar translation, editable logos and theme branding are not implemented.

## Self-hosting

Build the frontend and serve `frontend/dist` from a web server, using `try_files $uri /index.html` for client routes. Proxy `/api/` to `http://127.0.0.1:8000/` and use HTTPS. Backend: `npm run build`, then `npm run serve`. Set `NODE_ENV=production`, a strong secret, database credentials for a dedicated application role, and `FRONTEND_ORIGIN` to the HTTPS frontend origin. Use a process supervisor and a restricted database account; keep PostgreSQL private. There is no hosted service dependency for business data.

JWTs last eight hours and are stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Keep the frontend and API on the same site and serve them over HTTPS so browsers accept and send the session cookie. Logout clears the cookie; server-side revocation, MFA, password reset mail and distributed throttling are future work. A password-change API exists but has no settings UI yet. The in-process login limiter is intended for one API process; an internet-facing installation needs perimeter rate limiting. The endpoint `/health` reports database status without credentials. This MVP has not had an independent production security review.

### Database backup and restore

Run with PostgreSQL tools, supplying passwords through a protected `.pgpass` or interactive prompt:

```sh
pg_dump -h localhost -U postgres -Fc -f bus-backup.dump busflow
createdb -U postgres busflow_restore
pg_restore -h localhost -U postgres --no-owner -d busflow_restore bus-backup.dump
```

Test restores in a separate database. Keep backups protected and outside the app folder. An application table export does not replace a database backup.

## Optional C++ component

TypeScript is the default and is sufficient. The small C++17 percentage calculator is optional for demonstrating a native rules boundary:

```sh
cd backend
g++ -std=c++17 -O2 cpp/bus_rules.cpp -o cpp/bus_rules.exe
```

Set `CPP_ENGINE=./cpp/bus_rules.exe` in `backend/.env` to enable. On Linux omit `.exe`. CMake is also supplied. Only refund/commission percentages use it; PostgreSQL always owns seat locking. No native binaries are packaged.
