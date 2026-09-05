import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { createResumeSchema } from "@/shared/schemas";
import { createResume, listResumes } from "@/server/core/resume-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await listResumes(user!.id));
});

export const POST = defineRoute({ auth: true, body: createResumeSchema }, async ({ user, body }) => {
  const { resume, version } = await createResume(user!.id, body);
  return ok({ resume, version }, 201);
});
