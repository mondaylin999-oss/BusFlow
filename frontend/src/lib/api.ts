// ===========================================================================
//  api.ts — the single place where the app talks to the BusFlow backend.
//
//  FINDING THE BACKEND
//  -------------------
//  The app does not assume one fixed URL. It tries several, in order, and
//  keeps the first that answers /health:
//
//    1. VITE_API_URL from frontend/.env, if you set one (use in production)
//    2. <this page's origin>/api  — the Vite dev proxy in vite.config.ts.
//       This works no matter which address you opened the page from,
//       including from your phone on the same Wi-Fi.
//    3. <this page's host>:8000  — the API on the same machine, direct
//    4. http://localhost:8000 / http://127.0.0.1:8000 — last resort
//
//  That is what avoids the classic "cannot reach the server at
//  http://172.16.x.x:8000" problem, where Windows serves the page from a
//  virtual adapter the API is not listening on.
//
//  SESSIONS
//  --------
//  The backend stores the JWT in an HttpOnly, Secure, SameSite=Lax cookie.
//  Requests include credentials so the browser can send that cookie.
// ===========================================================================

const BASE_CACHE_KEY = "busflow_api_base";

try {
  localStorage.removeItem("busflow_token");
} catch {
  // Storage can be unavailable in private browsing.
}

function candidateBaseUrls(): string[] {
  const list: string[] = [];
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim())
    list.push(configured.trim().replace(/\/+$/, ""));

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    list.push(`${origin}/api`);
    list.push(`${protocol}//${hostname}:8000`);
  }
  list.push("http://localhost:8000");
  list.push("http://127.0.0.1:8000");

  return list.filter((value, index) => value && list.indexOf(value) === index);
}

export const API_BASE_GUESS = candidateBaseUrls()[0] ?? "http://localhost:8000";

let resolvedBase: string | null = null;
let resolving: Promise<string> | null = null;

async function pingHealth(base: string, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${base}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveApiBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;
  if (resolving) return resolving;

  resolving = (async () => {
    try {
      const cached = sessionStorage.getItem(BASE_CACHE_KEY);
      if (cached && (await pingHealth(cached))) {
        resolvedBase = cached;
        return cached;
      }
    } catch {
      /* sessionStorage blocked — just probe */
    }

    for (const candidate of candidateBaseUrls()) {
      if (await pingHealth(candidate)) {
        resolvedBase = candidate;
        try {
          sessionStorage.setItem(BASE_CACHE_KEY, candidate);
        } catch {
          /* ignore */
        }
        return candidate;
      }
    }

    throw new ApiError(
      0,
      "Cannot reach the bus server. Start the backend first:\n" +
        "    cd backend && npm run dev\n" +
        "then reload this page.",
    );
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- requests --------------------------------------------------------------

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export async function request<T>(
  pathname: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = await resolveApiBase();
  const url = new URL(
    `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    window.location.origin,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    resolvedBase = null; // the address may have changed — probe again next time
    throw new ApiError(
      0,
      "Cannot reach the bus server. Is the backend still running?",
    );
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        "error" in payload &&
        String((payload as any).error)) ||
      `Request failed (${response.status}).`;
    throw new ApiError(response.status, String(message));
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const api = {
  get: <T>(pathname: string, query?: RequestOptions["query"]) =>
    request<T>(pathname, { query }),
  post: <T>(pathname: string, body?: unknown) =>
    request<T>(pathname, { method: "POST", body }),
  patch: <T>(pathname: string, body?: unknown) =>
    request<T>(pathname, { method: "PATCH", body }),
  delete: <T>(pathname: string) => request<T>(pathname, { method: "DELETE" }),
};

export type Role =
  | "super_admin"
  | "head_office_admin"
  | "regional_manager"
  | "branch_manager"
  | "counter_staff"
  | "agent"
  | "driver"
  | "conductor"
  | "customer"
  | "finance_staff"
  | "operations_staff";
export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: Role;
  company_id: number;
  branch_id: number | null;
  counter_id: number | null;
  permissions: string[];
};
export type Health = {
  status: string;
  database: string;
  version: string;
  environment: string;
};
