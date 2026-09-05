import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { createReminderSchema, listRemindersQuerySchema } from "@/shared/schemas";
import { createReminder, listReminders } from "@/server/core/reminder-service";

export const GET = defineRoute(
  { auth: true, query: listRemindersQuerySchema },
  async ({ user, query }) => {
    const q = query as { status: "pending" | "done" | "ignored" | "all"; due?: "1" | "0" };
    return ok(await listReminders(user!.id, q));
  },
);

export const POST = defineRoute({ auth: true, body: createReminderSchema }, async ({ user, body }) => {
  return ok(await createReminder(user!.id, body), 201);
});
