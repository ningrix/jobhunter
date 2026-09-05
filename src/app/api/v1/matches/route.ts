import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { computeMatchSchema } from "@/shared/schemas";
import { computeMatch, listMatches } from "@/server/core/match-service";

const listQuerySchema = z.object({ jobId: z.string().optional() });

export const GET = defineRoute({ auth: true, query: listQuerySchema }, async ({ user, query }) => {
  return ok(await listMatches(user!.id, (query as { jobId?: string }).jobId));
});

export const POST = defineRoute({ auth: true, body: computeMatchSchema }, async ({ user, body }) => {
  const { match, taskId } = await computeMatch(user!.id, body);
  return ok({ match, taskId }, 201);
});
