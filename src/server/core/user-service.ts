import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { userProfiles } from "@/db/schema";
import type { z } from "zod";
import type { profileSchema } from "@/shared/schemas";

export type ProfilePatch = z.infer<typeof profileSchema>;
export type ProfileRow = typeof userProfiles.$inferSelect;

export async function getProfile(userId: string): Promise<ProfileRow> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (row) return row;
  const [created] = await db.insert(userProfiles).values({ userId }).returning();
  return created;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow> {
  const db = getDb();
  await getProfile(userId);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) updates[k] = v;
  }
  const [row] = await db
    .update(userProfiles)
    .set(updates)
    .where(eq(userProfiles.userId, userId))
    .returning();
  return row;
}
