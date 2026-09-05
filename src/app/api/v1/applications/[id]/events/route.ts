import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { applicationNoteSchema } from "@/shared/schemas";
import { addNote } from "@/server/core/application-service";

export const POST = defineRoute(
  { auth: true, body: applicationNoteSchema },
  async ({ user, params, body }) => {
    const { id } = params as unknown as { id: string };
    return ok(await addNote(user!.id, id, body.note), 201);
  },
);
