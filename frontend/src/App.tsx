import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Route, Switch, useLocation, Redirect } from "wouter";
import {
  Bus,
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  Wallet,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  MapPin,
  ArrowRight,
  Settings,
  ClipboardList,
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { usePrefs } from "./lib/prefs";
import { Card, PageHeader, StatTile } from "./components/ui";
import { RouteMap } from "./components/RouteMap";
import { PaymentNextStep } from "./components/PaymentNextStep";
import "./bus.css";

type Row = Record<string, any>;
const money = (n: number) => new Intl.NumberFormat("en-US").format(n) + " MMK";
const duration = (minutes: number) => {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const date = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Yangon",
  }).format(new Date(s));
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [path]);
  return { data, error, loading, refresh };
}
function State({
  error,
  loading,
  children,
}: {
  error: string;
  loading: boolean;
  children: ReactNode;
}) {
  return error ? (
    <div role="alert" className="notice error">
      {error}
    </div>
  ) : loading ? (
    <p role="status" className="notice">
      Loading…
    </p>
  ) : (
    <>{children}</>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Badge({ children }: { children: ReactNode }) {
  return <span className={"status status-" + children}>{children}</span>;
}
function Table({
  rows,
  columns,
}: {
  rows: Row[];
  columns: [string, string][];
}) {
  return !rows.length ? (
    <p className="notice">No records yet.</p>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([key, name]) => (
              <th key={key}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(([key]) => (
                <td key={key}>
                  {typeof r[key] === "object"
                    ? JSON.stringify(r[key])
                    : String(r[key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Action({
  label,
  action,
  onDone,
}: {
  label: string;
  action: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await action();
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

function Login({ branding }: { branding: Row }) {
  const { login, register } = useAuth();
  const [registering, setRegistering] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (registering)
        await register({
          name: String(f.get("name")),
          username: String(f.get("username")),
          password: String(f.get("password")),
        });
      else await login(String(f.get("username")), String(f.get("password")));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <Bus size={42} />
        <p className="eyebrow">CONNECTED JOURNEYS</p>
        <h1>
          Every seat.
          <br />
          Every branch.
          <br />
          One place.
        </h1>
        <p>
          Book your next journey or sign in to manage departures, passengers,
          and ticket sales.
        </p>
        <div className="route-preview">
          <span>Yangon</span>
          <span>
            ••••••••• <Bus /> •••••••••
          </span>
          <span>Mandalay</span>
        </div>
      </section>
      <section className="login-form">
        <div>
          <div className="wordmark">
            <Bus />
            {branding.name || "Bus Operations"}
          </div>
          <h2>{registering ? "Create your account" : "Welcome aboard"}</h2>
          <p className="muted">
            {registering
              ? "Register to reserve seats and manage your tickets."
              : "Sign in to your customer or staff portal."}
          </p>
          <form onSubmit={submit}>
            {registering && (
              <Field label="Full name">
                <input name="name" required maxLength={160} />
              </Field>
            )}
            <Field label="Username">
              <input name="username" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 12 : 1}
                required
              />
            </Field>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Please wait…"
                : registering
                  ? "Create account"
                  : "Sign in"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => setRegistering(!registering)}
          >
            {registering
              ? "Already registered? Sign in"
              : "New passenger? Create an account"}
          </button>
          <p className="muted small">
            Staff accounts are assigned by your company administrator.
          </p>
        </div>
      </section>
    </main>
  );
}

const links = [
  ["/", "Overview", "trips.view", LayoutDashboard],
  ["/trips", "Find trips", "trips.view", Bus],
  ["/bookings", "Bookings & tickets", "bookings.view", Ticket],
  ["/organization", "Branches & fleet", "catalog.view", Building2],
  ["/users", "People", "users.view", Users],
  ["/finance", "Payments & refunds", "finance.view", Wallet],
  ["/commissions", "My commission", "commissions.view", Wallet],
  ["/audit", "Audit trail", "audit.view", ClipboardList],
  ["/settings", "Company settings", "settings.update", Settings],
] as const;
export default function App() {
  const { user, loading, logout } = useAuth();
  const branding = useData<Row>("/branding");
  const { theme, toggleTheme } = usePrefs();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (branding.data?.name) document.title = branding.data.name;
  }, [branding.data]);
  if (loading)
    return <p className="notice">Connecting to your operations portal…</p>;
  if (!user) return <Login branding={branding.data || {}} />;
  const permitted = links.filter((l) => user.permissions.includes(l[2]));
  const nav = (
    <>
      {permitted.map(([path, label, _p, Icon]) => (
        <Link
          key={path}
          href={path}
          onClick={() => setOpen(false)}
          className={
            "nav-item " + (location === path ? "nav-item-active-ferry" : "")
          }
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </>
  );
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="mobile-only"
          aria-label="Open navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <span className="wordmark">
          <Bus />
          {branding.data?.name || "Bus Operations"}
        </span>
        <div className="top-actions">
          <span className="muted small">
            {user.name} · {user.role.replaceAll("_", " ")}
          </span>
          <button onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={logout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <aside className={"sidebar " + (open ? "is-open" : "")}>
        <p className="eyebrow">WORKSPACE</p>
        {nav}
        <div className="sidebar-footer">
          <Badge>
            {user.branch_id ? "Branch " + user.branch_id : "Company portal"}
          </Badge>
          <p>v1.0.0 · MVP</p>
        </div>
      </aside>
      <main className="workspace">
        <Switch>
          <Route path="/">
            {user.permissions.includes("trips.view") ? (
              <Overview />
            ) : (
              <Redirect to="/finance" />
            )}
          </Route>
          <Route path="/trips">
            <Guard permission="trips.view">
              <Trips />
            </Guard>
          </Route>
          <Route path="/bookings">
            <Guard permission="bookings.view">
              <Bookings />
            </Guard>
          </Route>
          <Route path="/bookings/:id">
            {(params) => (
              <Guard permission="bookings.view">
                <BookingDetail id={params.id} branding={branding.data || {}} />
              </Guard>
            )}
          </Route>
          <Route path="/organization">
            <Guard permission="catalog.view">
              <Organization />
            </Guard>
          </Route>
          <Route path="/users">
            <Guard permission="users.view">
              <People />
            </Guard>
          </Route>
          <Route path="/finance">
            <Guard permission="finance.view">
              <Finance />
            </Guard>
          </Route>
          <Route path="/commissions">
            <Guard permission="commissions.view">
              <DataPage
                title="My commission"
                path="/commissions"
                columns={[
                  ["reference", "Booking"],
                  ["amount", "Commission (MMK)"],
                  ["status", "Status"],
                ]}
              />
            </Guard>
          </Route>
          <Route path="/audit">
            <Guard permission="audit.view">
              <DataPage
                title="Audit trail"
                path="/audit"
                columns={[
                  ["created_at", "Time"],
                  ["user_id", "User"],
                  ["action", "Action"],
                  ["entity", "Entity"],
                  ["entity_id", "Record"],
                  ["details", "Details"],
                ]}
              />
            </Guard>
          </Route>
          <Route path="/settings">
            <Guard permission="settings.update">
              <Branding
                branding={branding.data || {}}
                refresh={branding.refresh}
              />
            </Guard>
          </Route>
          <Route>
            <p>
              Page not found. <Link href="/">Return home</Link>
            </p>
          </Route>
        </Switch>
      </main>
      <nav className="bottom-nav">
        {permitted.slice(0, 3).map(([path, label, _p, Icon]) => (
          <Link key={path} href={path}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
function Guard({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  return user?.permissions.includes(permission) ? (
    <>{children}</>
  ) : (
    <p className="notice error">You do not have access to this page.</p>
  );
}
function Overview() {
  const { user } = useAuth();
  const trips = useData<Row>("/trips?pageSize=5");
  const notes = useData<Row[]>("/notifications");
  const customer = user?.role === "customer",
    crew = ["driver", "conductor"].includes(user?.role || "");
  return (
    <div className="stack">
      <PageHeader
        title={
          customer
            ? "Where will you go next?"
            : crew
              ? "Your duty board"
              : "Operations overview"
        }
        subtitle={
          customer
            ? "Find a journey, choose your seat, and manage your tickets."
            : crew
              ? "Your assigned trips and passenger operations."
              : "A connected view of your permitted transport operations."
        }
      />
      <section className="hero">
        <div>
          <p className="eyebrow">
            {customer ? "YOUR NEXT JOURNEY" : "DEPARTURE CONTROL"}
          </p>
          <h2>
            {customer
              ? "A better journey starts here."
              : "Keep every journey moving."}
          </h2>
          <p>All departure times are shown in Myanmar time.</p>
          <Link className="button primary" href="/trips">
            {crew ? "Open duty board" : "Explore trips"}{" "}
            <ArrowRight size={18} />
          </Link>
        </div>
        <Bus size={100} strokeWidth={1} />
      </section>
      <div className="stats">
        <StatTile
          label={crew ? "Assigned trips" : "Trips in scope"}
          value={trips.data?.total ?? "—"}
          tone="ferry"
        />
        <StatTile
          label="Seats available"
          value={
            trips.data?.items.reduce(
              (n: number, t: Row) => n + t.available,
              0,
            ) ?? "—"
          }
          hint="Across the five departures below"
        />
        <StatTile
          label="Portal"
          value={user?.role.replaceAll("_", " ")}
          hint="Your assigned workspace"
        />
      </div>
      <Card title="Next departures">
        <State {...trips}>
          <Table
            rows={
              trips.data?.items.map((t: Row) => ({
                ...t,
                journey: t.origin + " → " + t.destination,
                time: date(t.departure_at),
                availability: t.available + "/" + t.seats,
              })) || []
            }
            columns={[
              ["time", "Departure"],
              ["journey", "Journey"],
              ["bus", "Bus"],
              ["availability", "Available"],
              ["status", "Status"],
            ]}
          />
        </State>
      </Card>
      <Card title="Recent notifications">
        <State {...notes}>
          {notes.data?.length ? (
            notes.data.map((n) => (
              <p key={n.id} className="notification">
                {n.message}
                <small>{date(n.created_at)}</small>
              </p>
            ))
          ) : (
            <p className="muted">No notifications yet.</p>
          )}
        </State>
      </Card>
    </div>
  );
}
// Departure bands and sort orders, matching what public bus-booking sites
// offer. Both are resolved server-side against a whitelist.
const BANDS = [
  { key: "", label: "Any time" },
  { key: "morning", label: "Morning", hint: "5am - 12pm" },
  { key: "afternoon", label: "Afternoon", hint: "12pm - 5pm" },
  { key: "evening", label: "Evening", hint: "5pm - 9pm" },
  { key: "night", label: "Night", hint: "9pm - 5am" },
];
const SORTS = [
  { key: "departure", label: "Departure time" },
  { key: "fare_low", label: "Price: low to high" },
  { key: "fare_high", label: "Price: high to low" },
  { key: "duration", label: "Shortest journey" },
  { key: "seats", label: "Most seats free" },
];

function Trips() {
  const { user } = useAuth();
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [band, setBand] = useState(""),
    [sort, setSort] = useState("departure"),
    [selected, setSelected] = useState<Row | null>(null);
  const result = useData<Row>(
    "/trips?page=" +
      page +
      query +
      (band ? "&depart=" + band : "") +
      "&sort=" +
      sort,
  );
  const canSell = user!.permissions.includes("bookings.create");
  return (
    <div className="stack">
      <PageHeader
        title={canSell ? "Find your trip" : "Trip board"}
        subtitle="Search departures and open live seat availability."
      />
      <Card>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPage(1);
            setSelected(null);
            setQuery(
              "&" +
                new URLSearchParams(
                  [...f.entries()]
                    .filter(([, v]) => v)
                    .map(([k, v]) => [k, String(v)]),
                ).toString(),
            );
          }}
        >
          <Field label="From">
            <input name="from" placeholder="Yangon" />
          </Field>
          <Field label="To">
            <input name="to" placeholder="Mandalay" />
          </Field>
          <Field label="Departure date">
            <input name="date" type="date" />
          </Field>
          <button className="primary">Search trips</button>
        </form>
      </Card>
      <div className="refine">
        <div className="bands" role="group" aria-label="Departure time">
          {BANDS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={"chip" + (band === b.key ? " on" : "")}
              aria-pressed={band === b.key}
              title={b.hint}
              onClick={() => {
                setPage(1);
                setSelected(null);
                setBand(b.key);
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        <label className="sort">
          <span className="muted small">Sort by</span>
          <select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSelected(null);
              setSort(e.target.value);
            }}
          >
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <State {...result}>
        {result.data?.items.length ? (
          result.data.items.map((t: Row) => (
            <article className="trip-card" key={t.id}>
              <div className="trip-icon">
                <Bus />
              </div>
              <div>
                <Badge>{t.status}</Badge>
                <h3>
                  {t.origin} <span className="muted">→</span> {t.destination}
                </h3>
                <p>{date(t.departure_at)}</p>
                <p className="muted small">
                  {t.bus}
                  {t.bus_model ? ` · ${t.bus_model}` : ""} · {t.gate}
                  {t.duration_minutes
                    ? ` · ${duration(t.duration_minutes)}`
                    : ""}{" "}
                  · Arrives {date(t.arrival_at)}
                </p>
              </div>
              <div className="trip-price">
                <strong>{money(t.fare)}</strong>
                <span
                  className={
                    t.available === 0
                      ? "seats-none"
                      : t.available <= 5
                        ? "seats-low"
                        : undefined
                  }
                >
                  {t.available === 0
                    ? "Sold out"
                    : t.available <= 5
                      ? `Only ${t.available} seats left`
                      : `${t.available} of ${t.seats} seats available`}
                </span>
                <button onClick={() => setSelected(t)}>
                  {canSell ? "Choose seats" : "Open trip"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="notice">No trips match these filters.</p>
        )}
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} · {result.data?.total || 0} trips
          </span>
          <button
            disabled={page >= (result.data?.totalPages || 1)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </State>
      {selected && (
        <div id="trip-details" style={{ scrollMarginTop: 90 }}>
          <TripPanel
            key={selected.id}
            trip={selected}
            close={() => setSelected(null)}
            refresh={result.refresh}
          />
        </div>
      )}
    </div>
  );
}
function TripPanel({
  trip,
  close,
  refresh,
}: {
  trip: Row;
  close: () => void;
  refresh: () => void;
}) {
  const { user } = useAuth();
  const seats = useData<Row[]>("/trips/" + trip.id + "/seats"),
    stops = useData<Row[]>("/trips/" + trip.id + "/stops");
  const [chosen, setChosen] = useState<number[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const can = (p: string) => user!.permissions.includes(p);
  useEffect(() => {
    document
      .getElementById("trip-details")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [trip.id]);
  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const b = await api.post<Row>("/bookings", {
        tripId: trip.id,
        passengers: chosen.map((seatId) => ({
          seatId,
          name: String(f.get("name" + seatId)),
          phone: String(f.get("phone" + seatId)),
        })),
      });
      navigate("/bookings/" + b.id);
    } catch (e) {
      setError((e as Error).message);
      void seats.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title={trip.origin + " → " + trip.destination}
      actions={
        <button onClick={close} aria-label="Close trip">
          <X size={18} />
        </button>
      }
    >
      <div className="seat-content">
        <div>
          <p className="eyebrow">FRONT OF BUS</p>
          <State {...seats}>
            <div
              className="seat-grid"
              style={{
                gridTemplateColumns: `repeat(${Math.max(...(seats.data || []).map((s) => s.column_number), 1)}, minmax(42px,1fr))`,
              }}
            >
              {seats.data?.map((s) => (
                <button
                  key={s.id}
                  aria-label={"Seat " + s.seat_number + ", " + s.status}
                  aria-pressed={chosen.includes(s.id)}
                  style={{ gridRow: s.row_number, gridColumn: s.column_number }}
                  className={
                    "seat " +
                    s.status +
                    (chosen.includes(s.id) ? " selected" : "")
                  }
                  disabled={
                    !can("bookings.create") ||
                    s.status !== "available" ||
                    (!chosen.includes(s.id) && chosen.length >= 6)
                  }
                  onClick={() =>
                    setChosen(
                      chosen.includes(s.id)
                        ? chosen.filter((id) => id !== s.id)
                        : [...chosen, s.id],
                    )
                  }
                >
                  {s.seat_number}
                </button>
              ))}
            </div>
            <p className="muted small">
              Blue: selected · Grey: booked/held · Choose up to 6 seats
            </p>
          </State>
        </div>
        <div>
          {can("bookings.create") ? (
            <form onSubmit={book}>
              <h3>Passenger details</h3>
              <p className="muted">
                Full-route tickets. Your seats are held when you submit this
                form.
              </p>
              {chosen.map((seatId) => (
                <div className="passenger-form" key={seatId}>
                  <strong>
                    Seat {seats.data?.find((s) => s.id === seatId)?.seat_number}
                  </strong>
                  <Field label="Full name">
                    <input name={"name" + seatId} required maxLength={160} />
                  </Field>
                  <Field label="Phone">
                    <input
                      name={"phone" + seatId}
                      required
                      minLength={5}
                      maxLength={30}
                    />
                  </Field>
                </div>
              ))}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <p className="total">
                Total <strong>{money(chosen.length * trip.fare)}</strong>
              </p>
              <button
                className="primary wide"
                disabled={!chosen.length || busy}
              >
                {busy ? "Reserving…" : "Reserve seats & review"}
              </button>
            </form>
          ) : (
            <p className="muted">Seat inventory for this trip.</p>
          )}
          {can("trips.update") && (
            <div className="stack">
              <h3>Trip operations</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const status = String(
                    new FormData(e.currentTarget).get("status"),
                  );
                  try {
                    await api.post("/trips/" + trip.id + "/status", { status });
                    refresh();
                    close();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <select name="status">
                  {[
                    "boarding",
                    "departed",
                    "in_transit",
                    "arrived",
                    "completed",
                    "delayed",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button>Update trip</button>
              </form>
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </div>
      </div>
      {stops.data && (
        <div className="route-map">
          <RouteMap nodes={stops.data as any} />
        </div>
      )}
      {can("manifest.view") && <Manifest tripId={trip.id} />}
    </Card>
  );
}
function Manifest({ tripId }: { tripId: number }) {
  const data = useData<Row[]>("/trips/" + tripId + "/manifest");
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  return (
    <section className="stack print-area">
      <div className="section-heading">
        <h3>Passenger manifest</h3>
        <button onClick={() => window.print()}>Print manifest</button>
      </div>
      <input
        aria-label="Find passenger or ticket"
        placeholder="Enter ticket reference, passenger, or seat…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <State {...data}>
        {data.data
          ?.filter((p) =>
            [p.name, p.seat_number, p.ticket].some((v) =>
              v.toLowerCase().includes(search.toLowerCase()),
            ),
          )
          .map((p) => (
            <div key={p.id} className="manifest-row">
              <strong>{p.seat_number}</strong>
              <div>
                {p.name}
                <small>
                  {p.phone} · {p.ticket}
                </small>
              </div>
              <Badge>{p.boarding_status}</Badge>
              {user!.permissions.includes("boarding.update") && (
                <>
                  <Action
                    label="Board"
                    action={() =>
                      api.post("/trips/" + tripId + "/boarding", {
                        passengerId: p.id,
                        status: "boarded",
                      })
                    }
                    onDone={data.refresh}
                  />
                  <Action
                    label="No-show"
                    action={() =>
                      api.post("/trips/" + tripId + "/boarding", {
                        passengerId: p.id,
                        status: "no_show",
                      })
                    }
                    onDone={data.refresh}
                  />
                </>
              )}
            </div>
          ))}
        {!data.data?.length && <p>No confirmed passengers.</p>}
      </State>
    </section>
  );
}
function Bookings() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const data = useData<Row>(
    "/bookings?page=" + page + "&q=" + encodeURIComponent(q),
  );
  return (
    <div className="stack">
      <PageHeader
        title="Bookings & tickets"
        subtitle="Search by booking reference, passenger name, or phone."
      />
      <input
        aria-label="Search bookings"
        placeholder="Search bookings…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <State {...data}>
        {data.data?.items.map((b: Row) => (
          <article className="trip-card" key={b.id}>
            <Ticket />
            <div>
              <Link href={"/bookings/" + b.id}>
                <h3>{b.reference}</h3>
              </Link>
              <p>
                {b.origin} → {b.destination} · {date(b.departure_at)}
              </p>
            </div>
            <div className="trip-price">
              <Badge>{b.status}</Badge>
              <strong>{money(b.total)}</strong>
              <Link href={"/bookings/" + b.id}>View booking →</Link>
            </div>
          </article>
        ))}
        {!data.data?.items.length && (
          <p className="notice">No bookings found.</p>
        )}
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} · {data.data?.total || 0} bookings
          </span>
          <button
            disabled={page >= (data.data?.totalPages || 1)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </State>
    </div>
  );
}
function BookingDetail({ id, branding }: { id: string; branding: Row }) {
  const result = useData<Row>("/bookings/" + id);
  const { user } = useAuth();
  const [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const b = result.data;
  useEffect(() => {
    if (b?.ticket)
      void QRCode.toDataURL(b.ticket.number, { width: 150, margin: 1 }).then(
        setQr,
      );
  }, [b?.ticket?.number]);
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api.post("/bookings/" + id + "/payment", Object.fromEntries(f));
      void result.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title="Booking details"
        actions={<Link href="/bookings">All bookings</Link>}
      />
      <State {...result}>
        {b && (
          <>
            <Card>
              <div className="section-heading">
                <h2>{b.reference}</h2>
                <Badge>{b.status}</Badge>
              </div>
              <h3>
                {b.trip.origin} → {b.trip.destination}
              </h3>
              <p>
                {date(b.trip.departure_at)} · {b.trip.bus} · {b.trip.gate}
              </p>
              <Table
                rows={b.passengers}
                columns={[
                  ["seat_number", "Seat"],
                  ["name", "Passenger"],
                  ["phone", "Phone"],
                ]}
              />
              <p className="total">
                Total <strong>{money(b.total)}</strong>
              </p>
              {b.status === "held" && (
                <PaymentNextStep
                  reference={b.reference}
                  total={money(b.total)}
                  deadline={date(b.held_until)}
                  phone={branding.phone}
                  email={branding.email}
                  canRecordPayment={user!.permissions.includes("payments.record")}
                  onRefresh={result.refresh}
                />
              )}
            </Card>
            {b.status === "held" &&
              user!.permissions.includes("payments.record") && (
                <Card title="Record received payment">
                  <form onSubmit={pay} className="filters">
                    <Field label="Payment method">
                      <select name="method">
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="mobile_wallet">Mobile wallet</option>
                      </select>
                    </Field>
                    <Field label="Receipt / transaction reference">
                      <input
                        name="reference"
                        required
                        minLength={4}
                        maxLength={100}
                      />
                    </Field>
                    <button className="primary" disabled={busy}>
                      {busy ? "Recording…" : "Confirm payment received"}
                    </button>
                  </form>
                  <p className="muted small">
                    Record only payments you have independently verified as
                    received.
                  </p>
                </Card>
              )}
            {b.ticket && (
              <section className="ticket print-area">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">PASSENGER TICKET</p>
                    <h2>{branding.name}</h2>
                  </div>
                  <Bus size={40} />
                </div>
                <h2>
                  {b.trip.origin} → {b.trip.destination}
                </h2>
                <p>
                  {date(b.trip.departure_at)} · {b.trip.gate} · {b.trip.bus}
                </p>
                <Table
                  rows={b.passengers}
                  columns={[
                    ["seat_number", "Seat"],
                    ["name", "Passenger"],
                  ]}
                />
                <div className="section-heading">
                  <div>
                    <strong>{b.reference}</strong>
                    <p>{b.ticket.number}</p>
                    <p>
                      {money(b.total)} · Payment received · Ticket{" "}
                      {b.ticket.status}
                    </p>
                  </div>
                  {qr && (
                    <img alt="Ticket verification reference QR code" src={qr} />
                  )}
                </div>
                <p>{branding.ticket_footer}</p>
                <button onClick={() => window.print()}>Print / save PDF</button>
              </section>
            )}
            {["held", "confirmed"].includes(b.status) &&
              user!.permissions.includes("bookings.cancel") && (
                <Card title="Cancel booking">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError("");
                      const reason = String(
                        new FormData(e.currentTarget).get("reason"),
                      );
                      try {
                        await api.post("/bookings/" + id + "/cancel", {
                          reason,
                        });
                        void result.refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label="Cancellation reason">
                      <input name="reason" required maxLength={160} />
                    </Field>
                    <p className="muted small">
                      Cancellation is subject to the company time window. Paid
                      bookings create a refund request for staff processing.
                    </p>
                    <button disabled={busy}>Confirm cancellation</button>
                  </form>
                </Card>
              )}
          </>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </State>
    </div>
  );
}

function DataPage({
  title,
  path,
  columns,
}: {
  title: string;
  path: string;
  columns: [string, string][];
}) {
  const data = useData<Row[]>(path);
  return (
    <div className="stack">
      <PageHeader
        title={title}
        subtitle="Showing up to the latest 100 records in your permitted scope."
      />
      <Card>
        <State {...data}>
          <Table rows={data.data || []} columns={columns} />
        </State>
      </Card>
    </div>
  );
}
function EntryForm({
  title,
  path,
  fields,
  onDone,
  transform,
}: {
  title: string;
  path: string;
  fields: [string, string, string, Row[]?][];
  onDone: () => void;
  transform?: (data: Row) => Row;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>
        {open ? "Close form" : title}
      </button>
      {open && (
        <form
          className="entry-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const data: Row = {};
            for (const [key, , type] of fields)
              data[key] =
                type === "number" || type === "select"
                  ? Number(f.get(key))
                  : String(f.get(key));
            setBusy(true);
            setError("");
            try {
              await api.post(path, transform ? transform(data) : data);
              form.reset();
              setOpen(false);
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {fields.map(([key, label, type, options]) => (
            <Field key={key} label={label}>
              {type === "select" ? (
                <select name={key} required>
                  {options?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name || o.code || o.username}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={key}
                  type={type}
                  required
                  min={type === "number" ? 1 : undefined}
                />
              )}
            </Field>
          ))}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
function Organization() {
  const data = useData<Row>("/catalog");
  const { user } = useAuth();
  const can = (p: string) => user!.permissions.includes(p);
  return (
    <div className="stack">
      <PageHeader
        title="Branches & fleet"
        subtitle="Organization, physical buses, routes, and dated departures."
      />
      <State {...data}>
        {data.data && (
          <>
            <Card title="Branches">
              {can("branches.create") && (
                <EntryForm
                  title="Add branch"
                  path="/branches"
                  onDone={data.refresh}
                  fields={[
                    ["name", "Name", "text"],
                    ["code", "Code", "text"],
                    ["city_id", "City", "select", data.data.cities],
                    ["address", "Address", "text"],
                    ["phone", "Phone", "text"],
                  ]}
                />
              )}
              <Table
                rows={data.data.branches}
                columns={[
                  ["code", "Code"],
                  ["name", "Branch"],
                  ["address", "Address"],
                  ["status", "Status"],
                ]}
              />
            </Card>
            <Card title="Counters">
              <Table
                rows={data.data.counters}
                columns={[
                  ["name", "Counter"],
                  ["branch_id", "Branch ID"],
                ]}
              />
            </Card>
            <Card title="Fleet">
              {can("buses.create") && (
                <EntryForm
                  title="Add bus & generate seats"
                  path="/buses"
                  onDone={data.refresh}
                  fields={[
                    ["code", "Bus code", "text"],
                    ["plate_number", "Plate", "text"],
                    ["model", "Model", "text"],
                    ["branch_id", "Branch", "select", data.data.branches],
                    ["rows", "Seat rows (1–20)", "number"],
                    ["columns", "Seats per row (2–5)", "number"],
                  ]}
                />
              )}
              <Table
                rows={data.data.buses}
                columns={[
                  ["code", "Bus"],
                  ["plate_number", "Plate"],
                  ["model", "Model"],
                  ["seats", "Seats"],
                  ["status", "Status"],
                ]}
              />
            </Card>
            <Card title="Routes">
              {can("routes.create") && (
                <EntryForm
                  title="Add route"
                  path="/routes"
                  onDone={data.refresh}
                  fields={[
                    ["code", "Code", "text"],
                    ["origin", "Origin", "text"],
                    ["destination", "Destination", "text"],
                    ["duration_minutes", "Duration (minutes)", "number"],
                    ["distance_km", "Distance (km)", "number"],
                    [
                      "stops",
                      "Stops JSON: [{name,latitude,longitude}, …]",
                      "text",
                    ],
                  ]}
                  transform={(d) => ({ ...d, stops: JSON.parse(d.stops) })}
                />
              )}
              <Table
                rows={data.data.routes}
                columns={[
                  ["code", "Code"],
                  ["origin", "Origin"],
                  ["destination", "Destination"],
                  ["duration_minutes", "Minutes"],
                  ["distance_km", "Kilometres"],
                ]}
              />
            </Card>
            {can("trips.create") && (
              <Card title="Create departure">
                <EntryForm
                  title="Add dated trip"
                  path="/trips"
                  onDone={data.refresh}
                  fields={[
                    ["route_id", "Route", "select", data.data.routes],
                    ["bus_id", "Bus", "select", data.data.buses],
                    [
                      "origin_branch_id",
                      "Origin branch",
                      "select",
                      data.data.branches,
                    ],
                    [
                      "destination_branch_id",
                      "Destination branch",
                      "select",
                      data.data.branches,
                    ],
                    ["driver_id", "Driver user ID", "number"],
                    ["conductor_id", "Conductor user ID", "number"],
                    [
                      "departure_at",
                      "Departure (your device local time)",
                      "datetime-local",
                    ],
                    [
                      "arrival_at",
                      "Arrival (your device local time)",
                      "datetime-local",
                    ],
                    ["fare", "Fare (whole MMK)", "number"],
                  ]}
                  transform={(d) => ({
                    ...d,
                    departure_at: new Date(d.departure_at).toISOString(),
                    arrival_at: new Date(d.arrival_at).toISOString(),
                  })}
                />
              </Card>
            )}
          </>
        )}
      </State>
    </div>
  );
}
function People() {
  const data = useData<Row[]>("/users"),
    catalog = useData<Row>("/catalog");
  return (
    <div className="stack">
      <PageHeader
        title="People"
        subtitle="Create staff and customer accounts. Assign roles, branches, and ticket counters."
      />
      <Card>
        {catalog.data && (
          <EntryForm
            title="Add user"
            path="/users"
            onDone={data.refresh}
            fields={[
              ["username", "Username", "text"],
              ["name", "Full name", "text"],
              ["password", "Temporary password (12+ characters)", "password"],
              [
                "role",
                "Role: branch_manager / counter_staff / agent / driver / conductor / customer",
                "text",
              ],
              ["branch_id", "Branch", "select", catalog.data.branches],
              ["counter_id", "Counter", "select", catalog.data.counters],
            ]}
            transform={(d) => ({
              ...d,
              counter_id: d.role === "counter_staff" ? d.counter_id : null,
              branch_id: d.role === "customer" ? null : d.branch_id,
            })}
          />
        )}
        <State {...data}>
          <Table
            rows={data.data || []}
            columns={[
              ["id", "ID"],
              ["name", "Name"],
              ["username", "Username"],
              ["role", "Role"],
              ["branch_id", "Branch"],
              ["counter_id", "Counter"],
              ["status", "Status"],
            ]}
          />
        </State>
      </Card>
    </div>
  );
}
function Finance() {
  const data = useData<Row>("/finance");
  const { user } = useAuth();
  return (
    <div className="stack">
      <PageHeader
        title="Payments & refunds"
        subtitle="Recorded receipts and pending refund processing. Latest 100 records per list."
      />
      <State {...data}>
        <Card title="Payments">
          <Table
            rows={data.data?.payments || []}
            columns={[
              ["booking", "Booking"],
              ["reference", "Receipt reference"],
              ["method", "Method"],
              ["amount", "Amount (MMK)"],
              ["created_at", "Recorded at"],
            ]}
          />
        </Card>
        <Card title="Refunds">
          {data.data?.refunds.map((r: Row) => (
            <div className="manifest-row" key={r.id}>
              <strong>{r.booking}</strong>
              <span>{money(r.amount)}</span>
              <Badge>{r.status}</Badge>
              {r.status === "pending" &&
                user!.permissions.includes("finance.refund") && (
                  <Action
                    label="Confirm refund paid"
                    action={() => api.post("/refunds/" + r.id + "/complete")}
                    onDone={data.refresh}
                  />
                )}
            </div>
          ))}
          {!data.data?.refunds.length && (
            <p className="muted">No refund requests.</p>
          )}
        </Card>
      </State>
    </div>
  );
}
function Branding({
  branding,
  refresh,
}: {
  branding: Row;
  refresh: () => void;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      <PageHeader
        title="Company settings"
        subtitle="Shared branding used throughout the portal and tickets. Version 1.0.0-mvp."
      />
      <Card>
        <form
          className="entry-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.patch(
                "/branding",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
              setMessage("Settings saved.");
              refresh();
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          {["name", "phone", "email", "address", "ticket_footer"].map((key) => (
            <Field key={key} label={key.replaceAll("_", " ")}>
              <input
                name={key}
                defaultValue={branding[key] || ""}
                required={key === "name"}
              />
            </Field>
          ))}
          <button className="primary">Save settings</button>
          <p role="status">{message}</p>
        </form>
      </Card>
    </div>
  );
}
