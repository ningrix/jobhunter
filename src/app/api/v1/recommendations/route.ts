import { z } from "zod";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { RECOMMEND_BUCKETS } from "@/shared/types";
import { listRecommendations } from "@/server/core/recommendation-service";

const querySchema = z.object({
  bucket: z.enum(RECOMMEND_BUCKETS).default("all"),
  resumeId: z.string().optional(),
});

export const GET = defineRoute({ auth: true, query: querySchema }, async ({ user, query }) => {
  const { bucket, resumeId } = query as unknown as {
    bucket: (typeof RECOMMEND_BUCKETS)[number];
    resumeId?: string;
  };
  return ok(await listRecommendations(user!.id, bucket, resumeId));
});
