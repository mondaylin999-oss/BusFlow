export type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  company_id: number;
  region_id: number | null;
  branch_id: number | null;
  counter_id: number | null;
  permissions: string[];
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requirePermission(user: User, key: string) {
  if (!user.permissions.includes(key))
    throw new HttpError(403, "Permission denied");
}
export function branchAllowed(
  user: User,
  branch: { id: number; region_id: number; company_id: number },
) {
  if (branch.company_id !== user.company_id) return false;
  if (
    [
      "super_admin",
      "head_office_admin",
      "finance_staff",
      "operations_staff",
    ].includes(user.role)
  )
    return true;
  if (user.role === "regional_manager")
    return user.region_id === branch.region_id;
  return user.branch_id === branch.id;
}
export function ownsBooking(
  user: User,
  booking: { created_by: number; counter_id: number | null },
  branch: { id: number; region_id: number; company_id: number },
) {
  if (["customer", "agent"].includes(user.role))
    return (
      booking.created_by === user.id && branch.company_id === user.company_id
    );
  if (user.role === "counter_staff")
    return (
      branchAllowed(user, branch) && booking.counter_id === user.counter_id
    );
  return branchAllowed(user, branch);
}
export const transitions: Record<string, string[]> = {
  scheduled: ["boarding", "delayed"],
  delayed: ["boarding"],
  boarding: ["departed"],
  departed: ["in_transit"],
  in_transit: ["arrived"],
  arrived: ["completed"],
  completed: [],
  cancelled: [],
};
export function checkTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw new HttpError(409, `Cannot change ${from} to ${to}`);
}
export function moneyPercent(amount: number, percent: number) {
  return Number((BigInt(amount) * BigInt(percent)) / 100n);
}
