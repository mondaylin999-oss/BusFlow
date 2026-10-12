import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";

process.env.DATABASE_URL ??= "postgres://localhost/busflow_test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-thirty-two-characters";

const { app } = await import("./app.js");
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
