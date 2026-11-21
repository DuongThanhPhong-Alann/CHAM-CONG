import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedAccount } from "@/lib/auth";
import Timesheet from "@/models/Timesheet";

type TimesheetRecord = { _id: unknown; ownerId: string; name: string; logicKey: string };
type TimesheetCacheEntry = { value: TimesheetRecord; expiresAt: number };
type TenantState = { timesheets?: Map<string, TimesheetCacheEntry> };

const globalWithTenantState = globalThis as typeof globalThis & { tenantState?: TenantState };
const tenantState = globalWithTenantState.tenantState ?? { timesheets: new Map<string, TimesheetCacheEntry>() };
globalWithTenantState.tenantState = tenantState;
const TENANT_CACHE_MS = 5000;

export function invalidateTimesheetAuthorizationCache(ownerId?: string) {
  const cache = tenantState.timesheets;
  if (!cache) return;
  if (!ownerId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${ownerId}:`)) cache.delete(key);
  }
}

export async function authorizeTimesheet(timesheetId: unknown) {
  const account = await getAuthenticatedAccount();
  if (!account) return { account: null, timesheet: null, status: 401 as const };
  const id = String(timesheetId || "");
  if (!/^[a-f\d]{24}$/i.test(id)) return { account, timesheet: null, status: 400 as const };
  const ownerId = String(account._id);
  const cacheKey = `${ownerId}:${id}`;
  const cached = tenantState.timesheets?.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { account, timesheet: cached.value, status: 200 as const };
  tenantState.timesheets?.delete(cacheKey);
  await connectToDatabase();
  const timesheet = await Timesheet.findOne({ _id: id, ownerId }).lean();
  if (!timesheet) return { account, timesheet: null, status: 404 as const };
  const cachedTimesheet = timesheet as TimesheetRecord;
  tenantState.timesheets?.set(cacheKey, { value: cachedTimesheet, expiresAt: Date.now() + TENANT_CACHE_MS });
  return { account, timesheet: cachedTimesheet, status: 200 as const };
}
