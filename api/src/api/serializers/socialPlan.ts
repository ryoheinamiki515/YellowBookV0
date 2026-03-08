import type {
    SocialPlan as DbPlan,
    SocialPlanParticipant as DbParticipant,
    User as DbUser,
} from "@prisma/client";

type ParticipantWithLinkedUser = DbParticipant & {
    person?: { linkedUserId: string | null; displayName?: string | null } | null;
};

export type SharedPerson = {
    key: string;
    displayName: string;
    kind: "owner" | "participant";
    isViewer: boolean;
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
          viewerUserId: string;
      };

type BuildSharedPeopleParams = {
    ownerId: string;
    ownerDisplayName: string | null | undefined;
    participants?: (DbParticipant | ParticipantWithLinkedUser)[];
    connectionMap?: Map<string, { personId: string; displayName: string }>;
    viewerUserId?: string | null;
};

function normalizeName(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed?.length ? trimmed : null;
}

export function buildSharedPeople(params: BuildSharedPeopleParams): SharedPerson[] {
    const {
        ownerId,
        ownerDisplayName,
        participants = [],
        connectionMap,
        viewerUserId,
    } = params;

    const sharedPeople: SharedPerson[] = [];
    const seenLinkedUserIds = new Set<string>();
    const seenNames = new Set<string>();

    const pushSharedPerson = (person: {
        key: string;
        displayName: string | null;
        kind: "owner" | "participant";
        linkedUserId?: string | null;
        isViewer: boolean;
    }) => {
        const displayName = normalizeName(person.displayName);
        const linkedUserId = person.linkedUserId ?? null;

        if (linkedUserId && seenLinkedUserIds.has(linkedUserId)) return;

        const normalizedName = displayName?.toLocaleLowerCase() ?? null;
        if (!displayName) return;

        if (!linkedUserId && normalizedName && seenNames.has(normalizedName)) return;

        if (linkedUserId) seenLinkedUserIds.add(linkedUserId);
        if (normalizedName) seenNames.add(normalizedName);

        sharedPeople.push({
            key: person.key,
            displayName,
            kind: person.kind,
            isViewer: person.isViewer,
        });
    };

    pushSharedPerson({
        key: `owner:${ownerId}`,
        displayName: ownerDisplayName ?? "Plan owner",
        kind: "owner",
        linkedUserId: ownerId,
        isViewer: viewerUserId === ownerId,
    });

    for (const participant of participants) {
        const linkedUserId =
            "person" in participant ? participant.person?.linkedUserId ?? null : null;
        const currentPersonDisplayName =
            "person" in participant ? participant.person?.displayName ?? null : null;
        const reconciledDisplayName =
            linkedUserId && connectionMap
                ? connectionMap.get(linkedUserId)?.displayName ?? null
                : null;
        const displayName =
            reconciledDisplayName ??
            currentPersonDisplayName ??
            participant.displayName ??
            null;
        const fallbackName = normalizeName(displayName);
        const fallbackKey = fallbackName?.toLocaleLowerCase().replace(/\s+/g, "-");

        pushSharedPerson({
            key: linkedUserId
                ? `participant:user:${linkedUserId}`
                : `participant:name:${fallbackKey ?? participant.id}`,
            displayName,
            kind: "participant",
            linkedUserId,
            isViewer: Boolean(viewerUserId && linkedUserId === viewerUserId),
        });
    }

    return sharedPeople;
}

export function serializeSocialPlan(
    p: SerializablePlan,
    context: SerializationContext = { role: "owner" }
) {
    const ownerDisplayName =
        context.role === "subscriber"
            ? context.connectionMap.get(p.ownerId)?.displayName ?? p.owner?.displayName ?? null
            : p.owner?.displayName ?? null;
    const sharedPeople =
        context.role === "subscriber"
            ? buildSharedPeople({
                  ownerId: p.ownerId,
                  ownerDisplayName,
                  participants: p.participants ?? [],
                  connectionMap: context.connectionMap,
                  viewerUserId: context.viewerUserId,
              })
            : undefined;

    return {
        id: p.id,
        ownerId: p.ownerId,
        ownerDisplayName,
        intentText: p.intentText,
        contextNote: context.role === "subscriber" ? null : p.contextNote ?? null,
        locationText: p.locationText ?? null,
        state: p.state,
        timePrecision: p.timePrecision,
        anchorStart: p.anchorStart?.toISOString() ?? null,
        anchorEnd: p.anchorEnd?.toISOString() ?? null,
        timezone: p.timezone ?? null,
        participants: (p.participants || []).map((part) => {
            const currentPersonDisplayName =
                "person" in part ? part.person?.displayName ?? null : null;
            if (context.role === "subscriber") {
                const linkedUserId =
                    "person" in part ? part.person?.linkedUserId : null;
                const connected = linkedUserId
                    ? context.connectionMap.get(linkedUserId)
                    : null;

                return {
                    id: part.id,
                    planId: part.planId,
                    displayName:
                        connected?.displayName ??
                        currentPersonDisplayName ??
                        part.displayName ??
                        null,
                    createdAt: part.createdAt.toISOString(),
                };
            }

            return {
                id: part.id,
                planId: part.planId,
                personId: part.personId,
                displayName: currentPersonDisplayName ?? part.displayName ?? null,
                isPrimary: part.isPrimary,
                createdAt: part.createdAt.toISOString(),
            };
        }),
        sharedPeople,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

export function serializeSubscribedPlan(
    p: DbPlan & {
        participants?: ParticipantWithLinkedUser[];
        owner?: Pick<DbUser, "displayName"> | null;
    },
    connectionMap: Map<string, { personId: string; displayName: string }>,
    viewerUserId: string
) {
    return serializeSocialPlan(p, {
        role: "subscriber",
        connectionMap,
        viewerUserId,
    });
}
