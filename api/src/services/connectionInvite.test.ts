import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { acceptConnectionInvite, type AcceptInviteError } from "./connectionInvite.js";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const FUTURE = new Date("2026-08-01T00:00:00.000Z");
const PAST = new Date("2026-06-01T00:00:00.000Z");

type MockInvite = {
    id: string;
    token: string;
    senderId: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED";
    expiresAt: Date;
};

function makeMockPrisma(opts: {
    invite: MockInvite | null;
    existingConnection?: boolean;
    users?: Array<{ id: string; displayName: string | null }>;
}) {
    const calls = {
        transactionRan: false,
        createdConnections: 0,
        linkedPersons: [] as Array<Record<string, unknown>>,
        inviteUpdatedTo: null as string | null,
    };

    const tx = {
        connection: {
            createMany({ data }: any) {
                calls.createdConnections += data.length;
                return Promise.resolve({ count: data.length });
            },
        },
        person: {
            findFirst: () => Promise.resolve(null),
            findMany: () => Promise.resolve([]),
            create({ data }: any) {
                calls.linkedPersons.push(data);
                return Promise.resolve({ id: `person-${calls.linkedPersons.length}`, ...data });
            },
        },
        connectionInvite: {
            update({ data }: any) {
                calls.inviteUpdatedTo = data.status;
                return Promise.resolve({});
            },
        },
    };

    const prisma = {
        connectionInvite: {
            findUnique({ where }: any) {
                const invite = opts.invite;
                return Promise.resolve(invite && invite.token === where.token ? invite : null);
            },
        },
        connection: {
            findUnique() {
                return Promise.resolve(opts.existingConnection ? { userId: "x", targetId: "y" } : null);
            },
        },
        user: {
            findUniqueOrThrow({ where }: any) {
                const user = (opts.users ?? []).find((u) => u.id === where.id);
                if (!user) throw new Error(`user ${where.id} not found in mock`);
                return Promise.resolve(user);
            },
        },
        $transaction(fn: any) {
            calls.transactionRan = true;
            return fn(tx);
        },
    } as any;

    return { prisma, calls };
}

function expectError(status: number, message: string) {
    return (err: unknown) => {
        const e = err as AcceptInviteError;
        assert.equal(e.status, status);
        assert.equal(e.message, message);
        return true;
    };
}

describe("acceptConnectionInvite — idempotency", () => {
    // Regression: an already-ACCEPTED invite whose acceptor is already connected
    // used to 404 (server.ts previously gated on status === "PENDING" first),
    // stranding the invite screen. It must now resolve as success with no writes.
    test("already-accepted invite + existing connection resolves as connected, no writes", async () => {
        const { prisma, calls } = makeMockPrisma({
            invite: { id: "inv-1", token: "tok", senderId: "sender", status: "ACCEPTED", expiresAt: FUTURE },
            existingConnection: true,
        });

        const result = await acceptConnectionInvite(prisma, {
            acceptorId: "acceptor",
            token: "tok",
            now: NOW,
        });

        assert.deepEqual(result, { status: "connected" });
        assert.equal(calls.transactionRan, false);
        assert.equal(calls.createdConnections, 0);
    });

    test("fresh pending invite creates both connections, links both people, marks accepted", async () => {
        const { prisma, calls } = makeMockPrisma({
            invite: { id: "inv-1", token: "tok", senderId: "sender", status: "PENDING", expiresAt: FUTURE },
            existingConnection: false,
            users: [
                { id: "sender", displayName: "Sam" },
                { id: "acceptor", displayName: "Alex" },
            ],
        });

        const result = await acceptConnectionInvite(prisma, {
            acceptorId: "acceptor",
            token: "tok",
            now: NOW,
        });

        assert.deepEqual(result, { status: "connected" });
        assert.equal(calls.createdConnections, 2);
        assert.equal(calls.linkedPersons.length, 2);
        assert.equal(calls.inviteUpdatedTo, "ACCEPTED");
    });

    test("missing token throws 404", async () => {
        const { prisma } = makeMockPrisma({ invite: null });

        await assert.rejects(
            () => acceptConnectionInvite(prisma, { acceptorId: "acceptor", token: "nope", now: NOW }),
            expectError(404, "invite_not_found_or_expired")
        );
    });

    test("expired invite for a not-yet-connected acceptor throws 404", async () => {
        const { prisma } = makeMockPrisma({
            invite: { id: "inv-1", token: "tok", senderId: "sender", status: "PENDING", expiresAt: PAST },
            existingConnection: false,
        });

        await assert.rejects(
            () => acceptConnectionInvite(prisma, { acceptorId: "acceptor", token: "tok", now: NOW }),
            expectError(404, "invite_not_found_or_expired")
        );
    });

    test("accepting your own invite throws 400", async () => {
        const { prisma } = makeMockPrisma({
            invite: { id: "inv-1", token: "tok", senderId: "sender", status: "PENDING", expiresAt: FUTURE },
        });

        await assert.rejects(
            () => acceptConnectionInvite(prisma, { acceptorId: "sender", token: "tok", now: NOW }),
            expectError(400, "cannot_accept_own_invite")
        );
    });

    test("invite consumed by someone else (accepted, acceptor not connected) throws 404", async () => {
        const { prisma } = makeMockPrisma({
            invite: { id: "inv-1", token: "tok", senderId: "sender", status: "ACCEPTED", expiresAt: FUTURE },
            existingConnection: false,
        });

        await assert.rejects(
            () => acceptConnectionInvite(prisma, { acceptorId: "acceptor", token: "tok", now: NOW }),
            expectError(404, "invite_not_found_or_expired")
        );
    });
});
