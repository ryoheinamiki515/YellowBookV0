import type { PrismaClient } from "@prisma/client";

import { linkOrCreateLinkedPerson } from "../personLinking.js";
import { requireDisplayName } from "../api/displayName.js";

export type AcceptInviteError = { status: number; expose: boolean; message: string };

export type AcceptInviteResult = { status: "connected" };

export async function acceptConnectionInvite(
    prisma: PrismaClient,
    { acceptorId, token, now = new Date() }: { acceptorId: string; token: string; now?: Date }
): Promise<AcceptInviteResult> {
    const invite = await prisma.connectionInvite.findUnique({ where: { token } });

    if (!invite) {
        throw { status: 404, expose: true, message: "invite_not_found_or_expired" } satisfies AcceptInviteError;
    }

    if (invite.senderId === acceptorId) {
        throw { status: 400, expose: true, message: "cannot_accept_own_invite" } satisfies AcceptInviteError;
    }

    // Idempotent: if the acceptor is already connected to the sender (e.g. this
    // invite was already accepted), the desired end state holds — report success
    // rather than 404-ing on the consumed invite or 409-ing on the connection.
    const existing = await prisma.connection.findUnique({
        where: { userId_targetId: { userId: invite.senderId, targetId: acceptorId } },
    });
    if (existing) {
        return { status: "connected" };
    }

    if (invite.status !== "PENDING" || invite.expiresAt < now) {
        throw { status: 404, expose: true, message: "invite_not_found_or_expired" } satisfies AcceptInviteError;
    }

    const [senderUser, acceptorUser] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: invite.senderId } }),
        prisma.user.findUniqueOrThrow({ where: { id: acceptorId } }),
    ]);
    const senderDisplayName = requireDisplayName(senderUser.displayName);
    const acceptorDisplayName = requireDisplayName(acceptorUser.displayName);

    await prisma.$transaction(async (tx) => {
        // Create bidirectional connections
        await tx.connection.createMany({
            data: [
                { userId: invite.senderId, targetId: acceptorId },
                { userId: acceptorId, targetId: invite.senderId },
            ],
        });

        // Link or create Person records in each other's libraries
        await linkOrCreateLinkedPerson(tx, {
            ownerId: invite.senderId,
            linkedUserId: acceptorId,
            displayName: acceptorDisplayName,
        });
        await linkOrCreateLinkedPerson(tx, {
            ownerId: acceptorId,
            linkedUserId: invite.senderId,
            displayName: senderDisplayName,
        });

        // Mark invite as accepted
        await tx.connectionInvite.update({
            where: { id: invite.id },
            data: { status: "ACCEPTED" },
        });
    });

    return { status: "connected" };
}
