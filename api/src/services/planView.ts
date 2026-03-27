import type { PrismaClient, PlanMemberRole, PlanMemberResponse } from "@prisma/client";
import { buildSharedPeople, type SharedPerson } from "../api/serializers/socialPlan.js";
import { SYSTEM_LINKED_PERSON_PLACEHOLDER } from "../personLinking.js";

export type PlanPermissions = {
    canEdit: boolean;
    canChangeState: boolean;
    canDelete: boolean;
    canShare: boolean;
    canRespond: boolean;
    canDiscuss: boolean;
    canLeave: boolean;
};

export type MembershipView = {
    role: "owner" | "member";
    response: PlanMemberResponse;
    privateNote: string | null;
    markedDoneAt: string | null;
};

function apiRole(role: PlanMemberRole): "owner" | "member" {
    return role === "OWNER" ? "owner" : "member";
}

export type PlanView = {
    plan: Record<string, unknown>;
    membership: MembershipView;
    permissions: PlanPermissions;
    sharedPeople: SharedPerson[];
};

export function derivePermissions(role: PlanMemberRole): PlanPermissions {
    const isOwner = role === "OWNER";
    return {
        canEdit: isOwner,
        canChangeState: true,
        canDelete: isOwner,
        canShare: isOwner,
        canRespond: !isOwner,
        canDiscuss: true,
        canLeave: !isOwner,
    };
}

export async function loadConnectionMapForUser(
    prisma: PrismaClient,
    userId: string
) {
    const linkedPeople = await prisma.person.findMany({
        where: { ownerId: userId, linkedUserId: { not: null } },
        select: {
            linkedUserId: true,
            displayName: true,
            id: true,
            linkedUser: { select: { displayName: true } },
        },
    });

    return new Map(
        linkedPeople.map((person) => {
            const displayName =
                person.displayName === SYSTEM_LINKED_PERSON_PLACEHOLDER &&
                person.linkedUser?.displayName
                    ? person.linkedUser.displayName
                    : person.displayName;
            return [
                person.linkedUserId!,
                { personId: person.id, displayName },
            ];
        })
    );
}

export async function getPlanView(
    prisma: PrismaClient,
    viewerId: string,
    planId: string
): Promise<PlanView | null> {
    const membership = await prisma.planMembership.findUnique({
        where: { planId_userId: { planId, userId: viewerId } },
    });
    if (!membership) return null;

    const plan = await prisma.socialPlan.findUnique({
        where: { id: planId },
        include: {
            owner: { select: { displayName: true } },
            participants: {
                include: {
                    person: { select: { linkedUserId: true, displayName: true } },
                },
            },
        },
    });
    if (!plan) return null;

    const connectionMap = await loadConnectionMapForUser(prisma, viewerId);

    const ownerDisplayName =
        membership.role === "MEMBER"
            ? connectionMap.get(plan.ownerId)?.displayName ?? plan.owner?.displayName ?? null
            : plan.owner?.displayName ?? null;

    const sharedPeople = buildSharedPeople({
        ownerId: plan.ownerId,
        ownerDisplayName,
        participants: plan.participants,
        connectionMap,
        viewerUserId: viewerId,
    });

    const participants = plan.participants.map((part) => {
        const currentPersonDisplayName =
            "person" in part ? part.person?.displayName ?? null : null;
        if (membership.role === "MEMBER") {
            const linkedUserId =
                "person" in part ? part.person?.linkedUserId : null;
            const connected = linkedUserId
                ? connectionMap.get(linkedUserId)
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
    });

    const serializedPlan = {
        id: plan.id,
        ownerId: plan.ownerId,
        ownerDisplayName,
        intentText: plan.intentText,
        contextNote: membership.role === "OWNER" ? plan.contextNote ?? null : null,
        locationText: plan.locationText ?? null,
        state: plan.state,
        timePrecision: plan.timePrecision,
        anchorStart: plan.anchorStart?.toISOString() ?? null,
        anchorEnd: plan.anchorEnd?.toISOString() ?? null,
        timezone: plan.timezone ?? null,
        participants,
        sharedPeople,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
    };

    return {
        plan: serializedPlan,
        membership: {
            role: apiRole(membership.role),
            response: membership.response,
            privateNote: membership.privateNote,
            markedDoneAt: membership.markedDoneAt?.toISOString() ?? null,
        },
        permissions: derivePermissions(membership.role),
        sharedPeople,
    };
}

export type AssertPermissionError = { status: number; expose: boolean; message: string };

export async function assertPlanPermission(
    prisma: PrismaClient,
    viewerId: string,
    planId: string,
    permission: keyof PlanPermissions
): Promise<PlanView> {
    const view = await getPlanView(prisma, viewerId, planId);
    if (!view) {
        throw { status: 404, expose: true, message: "not_found" } satisfies AssertPermissionError;
    }
    if (!view.permissions[permission]) {
        throw { status: 403, expose: true, message: "forbidden" } satisfies AssertPermissionError;
    }
    return view;
}

export async function updateMembership(
    prisma: PrismaClient,
    actorId: string,
    planId: string,
    patch: {
        response?: PlanMemberResponse;
        privateNote?: string | null;
        markedDoneAt?: Date | null;
    }
): Promise<MembershipView> {
    const membership = await prisma.planMembership.findUnique({
        where: { planId_userId: { planId, userId: actorId } },
    });
    if (!membership) {
        throw { status: 404, expose: true, message: "not_found" };
    }

    const data: Record<string, unknown> = {};
    if (patch.response !== undefined) data.response = patch.response;
    if (patch.privateNote !== undefined) data.privateNote = patch.privateNote;
    if (patch.markedDoneAt !== undefined) data.markedDoneAt = patch.markedDoneAt;

    const updated = await prisma.planMembership.update({
        where: { id: membership.id },
        data,
    });

    if (patch.response !== undefined && patch.response !== membership.response) {
        const actor = await prisma.user.findUnique({
            where: { id: actorId },
            select: { displayName: true },
        });
        await prisma.planActivity.create({
            data: {
                planId,
                actorId,
                kind: "RESPONSE",
                metadata: {
                    previousResponse: membership.response,
                    newResponse: patch.response,
                    actorDisplayName: actor?.displayName ?? "Someone",
                },
            },
        });
    }

    if (patch.markedDoneAt !== undefined && patch.markedDoneAt !== null && !membership.markedDoneAt) {
        await prisma.planActivity.create({
            data: {
                planId,
                actorId,
                kind: "STATE_CHANGE",
                metadata: { action: "marked_done" },
            },
        });
    }

    return {
        role: apiRole(updated.role),
        response: updated.response,
        privateNote: updated.privateNote,
        markedDoneAt: updated.markedDoneAt?.toISOString() ?? null,
    };
}

