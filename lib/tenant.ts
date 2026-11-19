import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedAccount } from "@/lib/auth";
import Timesheet from "@/models/Timesheet";

export async function authorizeTimesheet(timesheetId: unknown) {
  const account = await getAuthenticatedAccount();
  if (!account) return { account: null, timesheet: null, status: 401 as const };
  const id = String(timesheetId || "");
  if (!/^[a-f\d]{24}$/i.test(id)) return { account, timesheet: null, status: 400 as const };
  await connectToDatabase();
  const timesheet = await Timesheet.findOne({ _id: id, ownerId: String(account._id) }).lean();
  if (!timesheet) return { account, timesheet: null, status: 404 as const };
  return { account, timesheet, status: 200 as const };
}
