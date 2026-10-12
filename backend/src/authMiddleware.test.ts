import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";

process.env.DATABASE_URL ??= "postgres://localhost/busflow_test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-thirty-two-characters";

const { app } = await import("./app.js");
const {
  readSessionCookie,
  SESSION_COOKIE_CLEAR_OPTIONS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} = await import("./auth.js");
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("server-side authentication middleware", () => {
  it("configures session cookies as HttpOnly, Secure, and SameSite=Lax", () => {
    expect(SESSION_COOKIE_NAME).toBe("busflow_session");
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    expect(SESSION_COOKIE_CLEAR_OPTIONS).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("reads only a single session cookie", () => {
    expect(readSessionCookie("theme=dark; busflow_session=abc.def")).toBe(
      "abc.def",
    );
    expect(
      readSessionCookie("busflow_session=first; busflow_session=second"),
    ).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });

  it.each([
    ["GET", "/auth/me"],
    ["GET", "/trips"],
    ["POST", "/bookings"],
    ["POST", "/auth/password"],
  ])("rejects unauthenticated %s %s", async (method, path) => {
    const response = await fetch(baseUrl + path, { method });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Please sign in" });
  });

  it("ignores bearer tokens and clears invalid cookies with secure flags", async () => {
    const bearer = await fetch(baseUrl + "/auth/me", {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(bearer.status).toBe(401);

    const invalidCookie = await fetch(baseUrl + "/auth/me", {
      headers: { Cookie: "busflow_session=invalid" },
    });
    expect(invalidCookie.status).toBe(401);
    expect(invalidCookie.headers.get("set-cookie")).toMatch(
      /HttpOnly; Secure; SameSite=Lax/i,
    );
  });

  it("keeps login and registration public", async () => {
    const login = await fetch(baseUrl + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const registration = await fetch(baseUrl + "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(login.status).toBe(400);
    expect(registration.status).toBe(400);
  });
});
