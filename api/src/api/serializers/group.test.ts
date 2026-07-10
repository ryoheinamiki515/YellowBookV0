import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { serializeGroup } from "./group.js";

function makePerson(overrides: Record<string, unknown> = {}) {
    return {
        id: "person-id",
        ownerId: "owner-1",
        linkedUserId: null,
        displayName: "Person",
        pronouns: null,
        neighborhood: null,
        notes: null,
        birthdayMonth: null,
        birthdayDay: null,
        birthdayYear: null,
        archivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        linkedUser: null,
        ...overrides,
    };
}

function makeMember(person: ReturnType<typeof makePerson>) {
    return {
        groupId: "g1",
        personId: person.id,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        person,
    };
}

const GROUP = {
    id: "g1",
    ownerId: "owner-1",
    name: "Badminton",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    members: [
        makeMember(makePerson({ id: "p-uma", displayName: "Uma" })),
        makeMember(
            makePerson({
                id: "p-alex",
                displayName: "Alex",
                linkedUser: {
                    displayName: "Alex",
                    birthdayMonth: null,
                    birthdayDay: null,
                    birthdayYear: null,
                    profileImageUrl: "https://img/alex.png",
                },
            })
        ),
    ],
};

describe("serializeGroup", () => {
    test("returns id/name/memberCount with members sorted by name and profileImageUrl overlaid", () => {
        const out = serializeGroup(GROUP as any);

        assert.equal(out.id, "g1");
        assert.equal(out.name, "Badminton");
        assert.equal(out.memberCount, 2);
        // Sorted by displayName: Alex before Uma (input order was reversed).
        assert.deepEqual(out.members.map((m) => m.displayName), ["Alex", "Uma"]);

        const [alex, uma] = out.members;
        assert.equal(alex.personId, "p-alex");
        assert.equal(alex.profileImageUrl, "https://img/alex.png");
        assert.equal(uma.profileImageUrl, null);

        assert.equal(out.createdAt, "2026-01-01T00:00:00.000Z");
        assert.equal(out.updatedAt, "2026-01-03T00:00:00.000Z");
    });

    test("never leaks ownerId (privacy)", () => {
        const out = serializeGroup(GROUP as any);
        assert.equal("ownerId" in out, false);
        assert.equal(JSON.stringify(out).includes("owner-1"), false);
        for (const m of out.members) {
            assert.equal("ownerId" in m, false);
        }
    });

    test("an empty group serializes to memberCount 0 and no members", () => {
        const out = serializeGroup({ ...GROUP, members: [] } as any);
        assert.equal(out.memberCount, 0);
        assert.deepEqual(out.members, []);
    });
});
