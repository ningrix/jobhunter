import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { dashboardOverview } from "@/server/core/dashboard-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await dashboardOverview(user!.id));
});
