import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { createVersionSchema } from "@/shared/schemas";
import { createVersion } from "@/server/core/resume-service";

export const POST = defineRoute(
  { auth: true, body: createVersionSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    const version = await createVersion(user!.id, id, body);
    return ok(version, 201);
  },
);
