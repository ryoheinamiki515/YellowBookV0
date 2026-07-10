import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
    createGroup,
    addGroupMember,
    removeGroupMember,
    type GroupServiceError,
} from "./groups.js";

function makeMockPrisma(
    opts: {
        groupFindFirst?: unknown;
        personFindFirst?: unknown;
        createdGroup?: unknown;
        createThrows?: unknown;
    } = {}
) {
    const calls = {
        groupCreate: null as any,
        upsert: null as any,
        deleteMany: null as any,
    };

    const prisma = {
        group: {
            findFirst: () => Promise.resolve(opts.groupFindFirst ?? null),
            create: (args: any) => {
                calls.groupCreate = args;
                if (opts.createThrows) return Promise.reject(opts.createThrows);
                return Promise.resolve(
                    opts.createdGroup ?? {
                        id: "g1",
                        ownerId: args.data.ownerId,
                        name: args.data.name,
                        members: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }
                );
            },
        },
        person: {
            findFirst: () => Promise.resolve(opts.personFindFirst ?? null),
        },
        personGroup: {
            upsert: (args: any) => {
                calls.upsert = args;
                return Promise.resolve({});
            },
            deleteMany: (args: any) => {
                calls.deleteMany = args;
                return Promise.resolve({ count: 1 });
            },
        },
    } as any;

    return { prisma, calls };
}

function expectStatus(status: number) {
    return (err: unknown) => {
        assert.equal((err as GroupServiceError).status, status);
        return true;
    };
}

describe("createGroup", () => {
    test("rejects a case-insensitive duplicate name with 409 and does not create", async () => {
        const { prisma, calls } = makeMockPrisma({ groupFindFirst: { id: "existing" } });
        await assert.rejects(
            () => createGroup(prisma, { ownerId: "o1", name: "badminton" }),
            expectStatus(409)
        );
        assert.equal(calls.groupCreate, null);
    });

    test("creates the group when no duplicate exists", async () => {
        const { prisma, calls } = makeMockPrisma({ groupFindFirst: null });
        const group = await createGroup(prisma, { ownerId: "o1", name: "Badminton" });
        assert.equal(calls.groupCreate.data.ownerId, "o1");
        assert.equal(calls.groupCreate.data.name, "Badminton");
        assert.equal(group.name, "Badminton");
    });

    test("maps a unique-constraint race (P2002) to 409", async () => {
        const { prisma } = makeMockPrisma({ groupFindFirst: null, createThrows: { code: "P2002" } });
        await assert.rejects(
            () => createGroup(prisma, { ownerId: "o1", name: "Badminton" }),
            expectStatus(409)
        );
    });
});

describe("addGroupMember", () => {
    test("404 when the group is not owned by the caller", async () => {
        const { prisma, calls } = makeMockPrisma({ groupFindFirst: null });
        await assert.rejects(
            () => addGroupMember(prisma, { ownerId: "o1", groupId: "g1", personId: "p1" }),
            expectStatus(404)
        );
        assert.equal(calls.upsert, null);
    });

    // Privacy guarantee: a Person owned by someone else is not found under
    // { id, ownerId }, so you can never add another user's person to your group.
    test("404 when the person is not in the caller's library (cross-owner)", async () => {
        const { prisma, calls } = makeMockPrisma({
            groupFindFirst: { id: "g1" },
            personFindFirst: null,
        });
        await assert.rejects(
            () =>
                addGroupMember(prisma, {
                    ownerId: "o1",
                    groupId: "g1",
                    personId: "someone-elses-person",
                }),
            expectStatus(404)
        );
        assert.equal(calls.upsert, null);
    });

    test("idempotently upserts the membership when both belong to the caller", async () => {
        const { prisma, calls } = makeMockPrisma({
            groupFindFirst: { id: "g1" },
            personFindFirst: { id: "p1" },
        });
        await addGroupMember(prisma, { ownerId: "o1", groupId: "g1", personId: "p1" });
        assert.deepEqual(calls.upsert.where, {
            groupId_personId: { groupId: "g1", personId: "p1" },
        });
        assert.deepEqual(calls.upsert.create, { groupId: "g1", personId: "p1" });
    });
});

describe("removeGroupMember", () => {
    test("404 when the group is not owned by the caller", async () => {
        const { prisma, calls } = makeMockPrisma({ groupFindFirst: null });
        await assert.rejects(
            () => removeGroupMember(prisma, { ownerId: "o1", groupId: "g1", personId: "p1" }),
            expectStatus(404)
        );
        assert.equal(calls.deleteMany, null);
    });

    test("deletes the membership (idempotent no-op if absent) when the group is owned", async () => {
        const { prisma, calls } = makeMockPrisma({ groupFindFirst: { id: "g1" } });
        await removeGroupMember(prisma, { ownerId: "o1", groupId: "g1", personId: "p1" });
        assert.deepEqual(calls.deleteMany.where, { groupId: "g1", personId: "p1" });
    });
});
