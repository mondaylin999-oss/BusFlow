import { describe, it, expect } from "vitest";
import {
  branchAllowed,
  ownsBooking,
  checkTransition,
  moneyPercent,
  requirePermission,
  type User,
} from "./policy.js";
const u = (role: string, overrides: Partial<User> = {}): User => ({
  id: 9,
  username: "test",
  name: "Test",
  role,
  company_id: 1,
  region_id: 1,
  branch_id: 1,
  counter_id: 1,
  permissions: [],
  ...overrides,
});
const branch = { id: 1, region_id: 1, company_id: 1 };
describe("Organization and ownership", () => {
  it("denies cross-company access even for super admin", () =>
    expect(branchAllowed(u("super_admin"), { ...branch, company_id: 2 })).toBe(
      false,
    ));
  it("isolates branches", () =>
    expect(branchAllowed(u("branch_manager"), { ...branch, id: 2 })).toBe(
      false,
    ));
  it("isolates regions", () =>
    expect(
      branchAllowed(u("regional_manager"), { ...branch, region_id: 2 }),
    ).toBe(false));
  it.each(["customer", "agent"])("isolates %s bookings", (role) =>
    expect(
      ownsBooking(u(role), { created_by: 10, counter_id: 1 }, branch),
    ).toBe(false),
  );
  it("isolates counters", () =>
    expect(
      ownsBooking(u("counter_staff"), { created_by: 9, counter_id: 2 }, branch),
    ).toBe(false));
  it("allows assigned region", () =>
    expect(branchAllowed(u("regional_manager"), { ...branch, id: 2 })).toBe(
      true,
    ));
  it("requires an explicit permission", () =>
    expect(() =>
      requirePermission(u("super_admin"), "users.create"),
    ).toThrow());
});
describe("Business rules", () => {
  it("uses integer commission rounding", () =>
    expect(moneyPercent(30001, 5)).toBe(1500));
  it("calculates policy refunds", () =>
    expect(moneyPercent(45000, 90)).toBe(40500));
  it("accepts sequential departure", () =>
    expect(() => checkTransition("boarding", "departed")).not.toThrow());
  it("rejects invalid state jumps", () =>
    expect(() => checkTransition("scheduled", "completed")).toThrow());
  it("rejects reopening completed trips", () =>
    expect(() => checkTransition("completed", "boarding")).toThrow());
});
