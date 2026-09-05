import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { applications, reminders } from "@/db/schema";
import { AppError, ErrorCode } from "@/shared/errors";

export type ReminderRow = typeof reminders.$inferSelect;

async function ownedReminder(userId: string, reminderId: string): Promise<ReminderRow> {
  const [row] = await getDb()
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
    .limit(1);
  if (!row) throw new AppError(ErrorCode.REMINDER_NOT_FOUND, "提醒不存在");
  return row;
}

export async function createReminder(
  userId: string,
  input: { title: string; content?: string; remindAt: Date; applicationId?: string },
): Promise<ReminderRow> {
  if (input.applicationId) {
    const [app] = await getDb()
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, userId)))
      .limit(1);
    if (!app) throw new AppError(ErrorCode.APPLICATION_NOT_FOUND, "投递记录不存在");
  }
  const [row] = await getDb()
    .insert(reminders)
    .values({
      userId,
      applicationId: input.applicationId,
      title: input.title,
      content: input.content,
      remindAt: input.remindAt,
    })
    .returning();
  return row;
}

export async function listReminders(
  userId: string,
  opts: { status?: "pending" | "done" | "ignored" | "all"; due?: "1" | "0" } = {},
): Promise<ReminderRow[]> {
  const db = getDb();
  const conditions = [eq(reminders.userId, userId)];
  if (opts.status && opts.status !== "all") conditions.push(eq(reminders.status, opts.status));
  if (opts.due === "1") conditions.push(eq(reminders.status, "pending"));
  const rows = await db
    .select()
    .from(reminders)
    .where(and(...conditions))
    .orderBy(asc(reminders.remindAt));
  if (opts.due === "1") {
    const now = Date.now();
    return rows.filter((r) => r.remindAt.getTime() <= now);
  }
  return rows;
}

export async function finishReminder(
  userId: string,
  reminderId: string,
  status: "done" | "ignored",
): Promise<ReminderRow> {
  await ownedReminder(userId, reminderId);
  const [row] = await getDb()
    .update(reminders)
    .set({ status, doneAt: new Date() })
    .where(eq(reminders.id, reminderId))
    .returning();
  return row;
}

/** 仪表盘：未来 7 天内的待办提醒 */
export async function upcomingReminders(userId: string, days = 7): Promise<ReminderRow[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const rows = await listReminders(userId, { status: "pending" });
  return rows.filter((r) => r.remindAt >= now && r.remindAt <= end);
}
