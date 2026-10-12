import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
    PlanParticipantCreateSchema,
    dedupePlanParticipants,
    assertPeopleOwned,
    type OwnershipError,
} from "./planParticipants.js";

describe("PlanParticipantCreateSchema", () => {
    test("accepts a personId and defaults isPrimary to false", () => {
        const parsed = PlanParticipantCreateSchema.parse({
            personId: "11111111-1111-4111-a111-111111111111",
        });
        assert.equal(parsed.isPrimary, false);
    });

    test("accepts a displayName-only participant", () => {
        const parsed = PlanParticipantCreateSchema.parse({ displayName: "Sam" });
        assert.equal(parsed.displayName, "Sam");
    });

    test("rejects a participant with neither personId nor displayName", () => {
        assert.throws(() => PlanParticipantCreateSchema.parse({ isPrimary: true }));
    });
});

describe("dedupePlanParticipants", () => {
    test("drops duplicate personIds, keeping the first", () => {
        const out = dedupePlanParticipants([
            { personId: "p1", displayName: "Sam", isPrimary: true },
            { personId: "p2", displayName: "Uma", isPrimary: false },
            { personId: "p1", displayName: "Sam again", isPrimary: false },
        ]);
        assert.deepEqual(out.map((p) => p.personId), ["p1", "p2"]);
        assert.equal(out[0]?.displayName, "Sam"); // first wins
    });

    test("keeps multiple displayName-only entries (nulls are not duplicates)", () => {
        const out = dedupePlanParticipants([
            { personId: null, displayName: "Guest", isPrimary: false },
            { personId: null, displayName: "Guest", isPrimary: false },
        ]);
        assert.equal(out.length, 2);
    });
});

describe("assertPeopleOwned (IDOR guard)", () => {
    function mockPrisma(ownedIds: string[]) {
        return {
            person: {
                findMany: ({ where }: any) =>
                    Promise.resolve(
                        (where.id.in as string[])
                            .filter((id) => ownedIds.includes(id))
                            .map((id) => ({ id }))
                    ),
            },
        } as any;
    }

    test("no-op for an empty list", async () => {
        let called = false;
        const prisma = {
            person: { findMany: () => { called = true; return Promise.resolve([]); } },
        } as any;
        await assertPeopleOwned(prisma, "owner", []);
        assert.equal(called, false);
    });

    test("passes when every person belongs to the owner", async () => {
        await assertPeopleOwned(mockPrisma(["a", "b"]), "owner", ["a", "b"]);
    });

    test("throws 404 when any person is not owned by the caller", async () => {
        await assert.rejects(
            () => assertPeopleOwned(mockPrisma(["a"]), "owner", ["a", "someone-elses"]),
            (e: unknown) => (e as OwnershipError).status === 404
        );
    });
});
