import type {
    SocialPlan as DbPlan,
    SocialPlanParticipant as DbParticipant,
    User as DbUser,
} from "@prisma/client";

type ParticipantWithLinkedUser = DbParticipant & {
    person?: { linkedUserId: string | null } | null;
};

type SerializablePlan = DbPlan & {
    participants?: (DbParticipant | ParticipantWithLinkedUser)[];
    owner?: Pick<DbUser, "displayName"> | null;
};

export type SerializationContext =
    | { role: "owner" }
    | {
          role: "subscriber";
          connectionMap: Map<string, { personId: string; displayName: string }>;
      };

export function serializeSocialPlan(
    p: SerializablePlan,
    context: SerializationContext = { role: "owner" }
) {
    return {
        id: p.id,
        ownerId: p.ownerId,
        ownerDisplayName: p.owner?.displayName ?? null,
        intentText: p.intentText,
        contextNote: context.role === "subscriber" ? null : p.contextNote ?? null,
        locationText: p.locationText ?? null,
        state: p.state,
        timePrecision: p.timePrecision,
        anchorStart: p.anchorStart?.toISOString() ?? null,
        anchorEnd: p.anchorEnd?.toISOString() ?? null,
        timezone: p.timezone ?? null,
        participants: (p.participants || []).map((part) => {
            if (context.role === "subscriber") {
                const linkedUserId =
                    "person" in part ? part.person?.linkedUserId : null;
                const connected = linkedUserId
                    ? context.connectionMap.get(linkedUserId)
                    : null;

                return {
                    id: part.id,
                    planId: part.planId,
                    displayName: connected?.displayName ?? part.displayName ?? null,
                    createdAt: part.createdAt.toISOString(),
                };
            }

            return {
                id: part.id,
                planId: part.planId,
                personId: part.personId,
                displayName: part.displayName ?? null,
                isPrimary: part.isPrimary,
                createdAt: part.createdAt.toISOString(),
            };
        }),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

export function serializeSubscribedPlan(
    p: DbPlan & {
        participants?: ParticipantWithLinkedUser[];
        owner?: Pick<DbUser, "displayName"> | null;
    },
    connectionMap: Map<string, { personId: string; displayName: string }>
) {
    return serializeSocialPlan(p, {
        role: "subscriber",
        connectionMap,
    });
}
