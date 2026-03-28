import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { serializePerson } from "./person.js";

function basePerson(overrides: Record<string, unknown> = {}) {
    return {
        id: "person-1",
        ownerId: "owner-1",
        linkedUserId: null,
        displayName: "Alex",
        pronouns: null,
        neighborhood: null,
        notes: null,
        birthdayMonth: null,
        birthdayDay: null,
        birthdayYear: null,
        archivedAt: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
        ...overrides,
    } as any;
}

describe("serializePerson — normalization overlay", () => {
    test("overlays linked User displayName when Person has placeholder", () => {
        const person = basePerson({
            displayName: "Friend",
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null },
        });

        const result = serializePerson(person);
        assert.equal(result.displayName, "Kevin");
    });

    test("preserves owner's custom name even when linked User has a different name", () => {
        const person = basePerson({
            displayName: "Kev",
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null },
        });

        const result = serializePerson(person);
        assert.equal(result.displayName, "Kev");
    });

    test("uses Person displayName when there is no linked User", () => {
        const person = basePerson({ displayName: "Alex" });

        const result = serializePerson(person);
        assert.equal(result.displayName, "Alex");
    });

    test("overlays linked User birthday when Person has no birthday", () => {
        const person = basePerson({
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: 3, birthdayDay: 15, birthdayYear: 1990 },
        });

        const result = serializePerson(person);
        assert.deepEqual(result.birthday, { month: 3, day: 15, year: 1990 });
    });

    test("linked User birthday takes precedence over Person birthday", () => {
        const person = basePerson({
            birthdayMonth: 6,
            birthdayDay: 20,
            birthdayYear: null,
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: 3, birthdayDay: 15, birthdayYear: 1990 },
        });

        const result = serializePerson(person);
        assert.deepEqual(result.birthday, { month: 3, day: 15, year: 1990 });
    });

    test("falls back to Person birthday when linked User has no birthday", () => {
        const person = basePerson({
            birthdayMonth: 6,
            birthdayDay: 20,
            birthdayYear: null,
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null },
        });

        const result = serializePerson(person);
        assert.deepEqual(result.birthday, { month: 6, day: 20, year: null });
    });

    test("returns null birthday when neither Person nor linked User has one", () => {
        const person = basePerson({
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null },
        });

        const result = serializePerson(person);
        assert.equal(result.birthday, null);
    });

    test("returns Person birthday when there is no linked User", () => {
        const person = basePerson({
            birthdayMonth: 12,
            birthdayDay: 25,
            birthdayYear: 2000,
        });

        const result = serializePerson(person);
        assert.deepEqual(result.birthday, { month: 12, day: 25, year: 2000 });
    });

    test("linked User yearless birthday still takes precedence", () => {
        const person = basePerson({
            birthdayMonth: 6,
            birthdayDay: 20,
            birthdayYear: 1985,
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: 3, birthdayDay: 15, birthdayYear: null, profileImageUrl: null },
        });

        const result = serializePerson(person);
        assert.deepEqual(result.birthday, { month: 3, day: 15, year: null });
    });

    test("overlays linked User profileImageUrl", () => {
        const person = basePerson({
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null, profileImageUrl: "https://example.com/photo.jpg" },
        });

        const result = serializePerson(person);
        assert.equal(result.profileImageUrl, "https://example.com/photo.jpg");
    });

    test("returns null profileImageUrl when linked User has none", () => {
        const person = basePerson({
            linkedUserId: "user-2",
            linkedUser: { displayName: "Kevin", birthdayMonth: null, birthdayDay: null, birthdayYear: null, profileImageUrl: null },
        });

        const result = serializePerson(person);
        assert.equal(result.profileImageUrl, null);
    });

    test("returns null profileImageUrl when there is no linked User", () => {
        const person = basePerson();

        const result = serializePerson(person);
        assert.equal(result.profileImageUrl, null);
    });
});
