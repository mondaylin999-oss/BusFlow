import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://localhost/busflow_test";
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-thirty-two-characters";

const {
  hashPassword,
  isLegacyPasswordHash,
  isUsableHash,
  verifyPassword,
} = await import("./auth.js");

describe("password hashing", () => {
  it("stores Argon2id hashes and verifies the full password", async () => {
    const password = "correct horse battery staple 🚌".repeat(4);
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(isUsableHash(hash)).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password + "x", hash)).toBe(false);
  });

  it("continues verifying legacy scrypt hashes for login migration", async () => {
    const password = "legacy-password";
    const salt = "a".repeat(32);
    const key = scryptSync(password, salt, 64).toString("hex");
    const hash = `scrypt:${salt}:${key}`;

    expect(isUsableHash(hash)).toBe(true);
    expect(isLegacyPasswordHash(hash)).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("incorrect-password", hash)).toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    expect(isUsableHash("not-a-password-hash")).toBe(false);
    expect(isLegacyPasswordHash("not-a-password-hash")).toBe(false);
    expect(await verifyPassword("any-password", "not-a-password-hash")).toBe(
      false,
    );
  });
});
