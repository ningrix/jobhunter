import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { createApplicationSchema, listApplicationsQuerySchema } from "@/shared/schemas";
import { createApplication, listApplications } from "@/server/core/application-service";

export const GET = defineRoute(
  { auth: true, query: listApplicationsQuerySchema },
  async ({ user, query }) => {
    return ok(await listApplications(user!.id, (query as { stage?: never }).stage));
  },
);

export const POST = defineRoute(
  { auth: true, body: createApplicationSchema },
  async ({ user, body }) => {
    return ok(await createApplication(user!.id, body), 201);
  },
);
