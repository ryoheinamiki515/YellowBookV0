import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

/// One participant on a create/add request: a link to a People-Library person
/// and/or a displayName snapshot. Shared by POST /v1/plans (inline participants)
/// and POST /v1/plans/:planId/participants.
export const PlanParticipantCreateSchema = z
    .object({
        personId: z.string().uuid().nullable().optional(),
        displayName: z.string().max(120).nullable().optional(),
        isPrimary: z.boolean().default(false),
    })
    .refine((d) => d.personId || d.displayName, {
        message: "At least one of personId or displayName is required",
    });

export type PlanParticipantCreateInput = z.infer<typeof PlanParticipantCreateSchema>;

/// Drop duplicate linked people, keeping the first occurrence. The
/// [planId, personId] unique constraint would otherwise abort the whole create;
/// displayName-only entries (personId null) are always kept.
export function dedupePlanParticipants(
    participants: PlanParticipantCreateInput[]
): PlanParticipantCreateInput[] {
    const seen = new Set<string>();
    return participants.filter((p) => {
        if (!p.personId) return true;
        if (seen.has(p.personId)) return false;
        seen.add(p.personId);
        return true;
    });
}

export type OwnershipError = { status: number; expose: boolean; message: string };

/// IDOR guard: every referenced personId must belong to the caller. Throws 404
/// if any is foreign or missing. Pass a de-duplicated list of ids.
export async function assertPeopleOwned(
    prisma: Pick<PrismaClient, "person">,
    ownerId: string,
    personIds: string[]
): Promise<void> {
    if (personIds.length === 0) return;
    const owned = await prisma.person.findMany({
        where: { id: { in: personIds }, ownerId },
        select: { id: true },
    });
    if (owned.length !== personIds.length) {
        throw {
            status: 404,
            expose: true,
            message: "person_not_found",
        } satisfies OwnershipError;
    }
}
