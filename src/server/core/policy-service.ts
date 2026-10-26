import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { applicationPolicies } from "@/db/schema";
import type { DeliveryPolicyRules } from "@/shared/types";

export type PolicyRow = typeof applicationPolicies.$inferSelect;

export async function getPolicy(userId: string): Promise<PolicyRow | null> {
  const [row] = await getDb()
    .select()
    .from(applicationPolicies)
    .where(eq(applicationPolicies.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertPolicy(
  userId: string,
  rules: DeliveryPolicyRules,
  name?: string,
): Promise<PolicyRow> {
  const db = getDb();
  const [existing] = await db
    .select({ id: applicationPolicies.id })
    .from(applicationPolicies)
    .where(eq(applicationPolicies.userId, userId))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(applicationPolicies)
      .set({ rules, ...(name !== undefined ? { name } : {}) })
      .where(eq(applicationPolicies.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(applicationPolicies)
    .values({ userId, rules, ...(name ? { name } : {}) })
    .returning();
  return row;
}
