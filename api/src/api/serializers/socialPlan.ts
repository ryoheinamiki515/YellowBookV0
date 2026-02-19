import type { SocialPlan as DbPlan, SocialPlanParticipant as DbParticipant } from "@prisma/client";

export function serializeSocialPlan(p: DbPlan & { participants?: DbParticipant[] }) {
    return {
        id: p.id,
        ownerId: p.ownerId,
        intentText: p.intentText,
        contextNote: p.contextNote,
        locationText: p.locationText,
        state: p.state,
        timePrecision: p.timePrecision,
        anchorStart: p.anchorStart?.toISOString() ?? null,
        anchorEnd: p.anchorEnd?.toISOString() ?? null,
        timezone: p.timezone,
        participants: (p.participants || []).map(part => ({
            id: part.id,
            planId: part.planId,
            personId: part.personId,
            displayName: part.displayName,
            isPrimary: part.isPrimary,
            createdAt: part.createdAt.toISOString(),
        })),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}
