import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { moneyPercent } from "./policy.js";
const run = promisify(execFile);
export async function calculatePercent(amount: number, percent: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw new Error("Invalid money input");
  if (!process.env.CPP_ENGINE) return moneyPercent(amount, percent);
  const { stdout } = await run(
    process.env.CPP_ENGINE,
    [String(amount), String(percent)],
    { timeout: 3000, windowsHide: true },
  );
  const value = Number(stdout.trim());
  if (!Number.isSafeInteger(value) || value !== moneyPercent(amount, percent))
    throw new Error("C++ rules result invalid");
  return value;
}
