import type { PrismaClient } from "@prisma/client";

export async function deleteAccount(
    prisma: PrismaClient,
    { userId, deleteProfileImage }: { userId: string; deleteProfileImage: (userId: string) => Promise<void> }
): Promise<void> {
    // Remove the stored photo first so a failure leaves the account intact and
    // retryable, rather than orphaning personal data in object storage.
    await deleteProfileImage(userId);

    // IdempotencyKey has no FK to User, so it isn't covered by the cascade that
    // removes the user's people, plans, connections, invites and push tokens.
    await prisma.$transaction([
        prisma.idempotencyKey.deleteMany({ where: { ownerId: userId } }),
        prisma.user.delete({ where: { id: userId } }),
    ]);
}
