import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Person } from "@prisma/client";
import { buildMergedPersonUpdate } from "./personMerge.js";

function makePerson(overrides: Partial<Person> = {}): Person {
    return {
        id: overrides.id ?? "person-1",
        ownerId: overrides.ownerId ?? "owner-1",
        linkedUserId: overrides.linkedUserId ?? null,
        displayName: overrides.displayName ?? "Friend",
        pronouns: overrides.pronouns ?? null,
        neighborhood: overrides.neighborhood ?? null,
        notes: overrides.notes ?? null,
        birthdayMonth: overrides.birthdayMonth ?? null,
        birthdayDay: overrides.birthdayDay ?? null,
        birthdayYear: overrides.birthdayYear ?? null,
        archivedAt: overrides.archivedAt ?? null,
        createdAt: overrides.createdAt ?? new Date("2026-03-07T12:00:00.000Z"),
        updatedAt: overrides.updatedAt ?? new Date("2026-03-07T12:00:00.000Z"),
    };
}

describe("buildMergedPersonUpdate", () => {
    test("keeps the current alias while inheriting a linked user", () => {
        assert.deepEqual(
            buildMergedPersonUpdate({
                personToKeep: makePerson({
                    displayName: "TK",
                }),
                personToMerge: makePerson({
                    id: "person-2",
                    displayName: "Chanmi",
                    linkedUserId: "user-chanmi",
                }),
            }),
            {
                displayName: "TK",
                linkedUserId: "user-chanmi",
                pronouns: null,
                neighborhood: null,
                notes: null,
                birthdayMonth: null,
                birthdayDay: null,
                birthdayYear: null,
                archivedAt: null,
            }
        );
    });

    test("replaces the placeholder name when a better name exists", () => {
        const merged = buildMergedPersonUpdate({
            personToKeep: makePerson({
                displayName: "Friend",
            }),
            personToMerge: makePerson({
                id: "person-2",
                displayName: "Chanmi",
            }),
        });

        assert.equal(merged.displayName, "Chanmi");
    });

    test("fills blank fields from the merged record and preserves matching birthday year", () => {
        const merged = buildMergedPersonUpdate({
            personToKeep: makePerson({
                displayName: "TK",
                birthdayMonth: 5,
                birthdayDay: 9,
                birthdayYear: null,
            }),
            personToMerge: makePerson({
                id: "person-2",
                displayName: "Chanmi",
                pronouns: "she/her",
                neighborhood: "Queens",
                birthdayMonth: 5,
                birthdayDay: 9,
                birthdayYear: 1992,
            }),
        });

        assert.equal(merged.pronouns, "she/her");
        assert.equal(merged.neighborhood, "Queens");
        assert.equal(merged.birthdayYear, 1992);
    });

    test("appends distinct source notes", () => {
        const merged = buildMergedPersonUpdate({
            personToKeep: makePerson({
                displayName: "TK",
                notes: "Met through college.",
            }),
            personToMerge: makePerson({
                id: "person-2",
                displayName: "Chanmi",
                notes: "Prefers weekday evenings.",
            }),
        });

        assert.match(merged.notes ?? "", /Met through college/);
        assert.match(merged.notes ?? "", /Prefers weekday evenings/);
    });

    test("rejects merging two different linked users", () => {
        assert.throws(
            () =>
                buildMergedPersonUpdate({
                    personToKeep: makePerson({
                        displayName: "TK",
                        linkedUserId: "user-tk",
                    }),
                    personToMerge: makePerson({
                        id: "person-2",
                        displayName: "Chanmi",
                        linkedUserId: "user-chanmi",
                    }),
                }),
            (error: unknown) =>
                typeof error === "object" &&
                error != null &&
                "message" in error &&
                (error as { message: string }).message ===
                    "cannot_merge_people_with_different_linked_users"
        );
    });
});
