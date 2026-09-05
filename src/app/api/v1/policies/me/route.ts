import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { deliveryPolicySchema } from "@/shared/schemas";
import { getPolicy, upsertPolicy } from "@/server/core/policy-service";

export const GET = defineRoute({ auth: true }, async ({ user }) => {
  return ok(await getPolicy(user!.id));
});

export const PUT = defineRoute({ auth: true, body: deliveryPolicySchema }, async ({ user, body }) => {
  const { name, ...rules } = body;
  return ok(await upsertPolicy(user!.id, rules, name));
});
