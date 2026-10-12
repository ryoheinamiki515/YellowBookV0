import type { PrismaClient, Prisma } from "@prisma/client";

import { groupInclude } from "../api/serializers/group.js";

export type GroupServiceError = { status: number; expose: boolean; message: string };

type GroupWithMembers = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

/// Creates an owner-scoped group. Name uniqueness is case-insensitive per owner
/// (the DB unique index is a case-sensitive backstop, hence the P2002 catch).
export async function createGroup(
    prisma: PrismaClient,
    { ownerId, name }: { ownerId: string; name: string }
): Promise<GroupWithMembers> {
    const existing = await prisma.group.findFirst({
        where: { ownerId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
    });
    if (existing) {
        throw { status: 409, expose: true, message: "group_name_taken" } satisfies GroupServiceError;
    }

    try {
        return await prisma.group.create({ data: { ownerId, name }, include: groupInclude });
    } catch (e: any) {
        if (e?.code === "P2002") {
            throw { status: 409, expose: true, message: "group_name_taken" } satisfies GroupServiceError;
        }
        throw e;
    }
}

/// Idempotently adds a person to a group. Verifies BOTH the group and the person
/// belong to the caller, so you can never add someone else's Person or touch
/// someone else's group.
export async function addGroupMember(
    prisma: PrismaClient,
    { ownerId, groupId, personId }: { ownerId: string; groupId: string; personId: string }
): Promise<void> {
    const group = await prisma.group.findFirst({ where: { id: groupId, ownerId }, select: { id: true } });
    if (!group) throw { status: 404, expose: true, message: "not_found" } satisfies GroupServiceError;

    const person = await prisma.person.findFirst({ where: { id: personId, ownerId }, select: { id: true } });
    if (!person) throw { status: 404, expose: true, message: "not_found" } satisfies GroupServiceError;

    await prisma.personGroup.upsert({
        where: { groupId_personId: { groupId, personId } },
        create: { groupId, personId },
        update: {},
    });
}

/// Idempotently removes a person from a group (no-op if not a member). Verifies
/// the group belongs to the caller.
export async function removeGroupMember(
    prisma: PrismaClient,
    { ownerId, groupId, personId }: { ownerId: string; groupId: string; personId: string }
): Promise<void> {
    const group = await prisma.group.findFirst({ where: { id: groupId, ownerId }, select: { id: true } });
    if (!group) throw { status: 404, expose: true, message: "not_found" } satisfies GroupServiceError;

    await prisma.personGroup.deleteMany({ where: { groupId, personId } });
}
