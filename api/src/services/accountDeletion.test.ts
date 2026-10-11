import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deleteAccount } from "./accountDeletion.js";

function makeMockPrisma() {
    const calls: string[] = [];
    const prisma = {
        idempotencyKey: {
            deleteMany({ where }: any) {
                calls.push(`idempotencyKey.deleteMany:${where.ownerId}`);
                return Promise.resolve({ count: 0 });
            },
        },
        user: {
            delete({ where }: any) {
                calls.push(`user.delete:${where.id}`);
                return Promise.resolve({ id: where.id });
            },
        },
        $transaction(ops: Promise<unknown>[]) {
            calls.push("$transaction");
            return Promise.all(ops);
        },
    };
    return { prisma: prisma as any, calls };
}

describe("deleteAccount", () => {
    test("deletes the profile image, idempotency keys and the user", async () => {
        const { prisma, calls } = makeMockPrisma();
        const deletedImages: string[] = [];

        await deleteAccount(prisma, {
            userId: "user-1",
            deleteProfileImage: async (id) => {
                deletedImages.push(id);
            },
        });

        assert.deepEqual(deletedImages, ["user-1"]);
        assert.ok(calls.includes("idempotencyKey.deleteMany:user-1"));
        assert.ok(calls.includes("user.delete:user-1"));
        assert.ok(calls.includes("$transaction"));
    });

    test("leaves the account intact when the profile image cannot be deleted", async () => {
        const { prisma, calls } = makeMockPrisma();

        await assert.rejects(
            deleteAccount(prisma, {
                userId: "user-1",
                deleteProfileImage: async () => {
                    throw new Error("storage unavailable");
                },
            }),
            /storage unavailable/
        );

        assert.deepEqual(calls, []);
    });
});
