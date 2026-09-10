import "dotenv/config";
const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Set ${key} in backend/.env`);
  return value;
};
export const ENV = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpireMinutes: 480,
  loginRateWindowSeconds: 900,
  loginRateLimit: 20,
  port: Number(process.env.PORT || 8000),
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  holdMinutes: Number(process.env.HOLD_MINUTES || 10),
  cancelHours: Number(process.env.CANCEL_HOURS || 2),
  refundPercent: Number(process.env.REFUND_PERCENT || 90),
  commissionPercent: Number(process.env.COMMISSION_PERCENT || 5),
  companyName: process.env.COMPANY_NAME || "BusFlow",
  version: "1.0.0-mvp",
};
if (ENV.jwtSecret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters");
for (const n of [
  ENV.holdMinutes,
  ENV.cancelHours,
  ENV.refundPercent,
  ENV.commissionPercent,
])
  if (!Number.isInteger(n) || n < 0)
    throw new Error("Business settings must be nonnegative integers");
if (
  ENV.holdMinutes < 1 ||
  ENV.refundPercent > 100 ||
  ENV.commissionPercent > 100
)
  throw new Error("Invalid business settings");
