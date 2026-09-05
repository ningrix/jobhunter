import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { updateReminderSchema } from "@/shared/schemas";
import { finishReminder } from "@/server/core/reminder-service";

export const PATCH = defineRoute(
  { auth: true, body: updateReminderSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await finishReminder(user!.id, id, body.status));
  },
);
