import type { Prisma } from "@prisma/client";
import { serializePerson, linkedUserProfileSelect } from "./person.js";

/// Loads everything serializeGroup needs: each member's Person plus the linked
/// User overlay (so linked connections show their real name/photo).
export const groupInclude = {
    members: {
        include: {
            person: {
                include: { linkedUser: { select: linkedUserProfileSelect } },
            },
        },
    },
} satisfies Prisma.GroupInclude;

type GroupWithMembers = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

export function serializeGroup(group: GroupWithMembers) {
    const members = group.members
        .map((m) => {
            const person = serializePerson(m.person);
            return {
                personId: person.id,
                displayName: person.displayName,
                profileImageUrl: person.profileImageUrl,
            };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return {
        id: group.id,
        name: group.name,
        memberCount: members.length,
        members,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
    };
}
