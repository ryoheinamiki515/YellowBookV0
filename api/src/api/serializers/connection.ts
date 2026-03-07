import type { Connection, User, Person } from "@prisma/client";

type ConnectionWithRelations = Connection & {
    target: Pick<User, "id" | "displayName">;
};

export function serializeConnection(
    conn: ConnectionWithRelations,
    personForTarget: Pick<Person, "id"> | null
) {
    return {
        id: conn.id,
        targetUserId: conn.target.id,
        targetDisplayName: conn.target.displayName,
        personId: personForTarget?.id ?? null,
        createdAt: conn.createdAt.toISOString(),
    };
}
