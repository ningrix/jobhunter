import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { aiSettingsSchema } from "@/shared/schemas";
import { clearAiSettings, getAiSettingsView, upsertAiSettings } from "@/server/ai/settings";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await getAiSettingsView(user!.id));
});

export const PUT = defineRoute({ auth: true, body: aiSettingsSchema }, async ({ user, body }) => {
  return ok(await upsertAiSettings(user!.id, body));
});

export const DELETE = defineRoute({ auth: true }, async ({ user }) => {
  await clearAiSettings(user!.id);
  return ok({ cleared: true });
});
