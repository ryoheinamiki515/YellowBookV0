import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { derivePermissions, type PlanPermissions } from "./planView.js";

describe("derivePermissions", () => {
    describe("issue #24 — non-owner can mark done", () => {
        test("returns canChangeState=true for MEMBER role", () => {
            const perms = derivePermissions("MEMBER");
            assert.equal(perms.canChangeState, true);
        });

        test("returns canChangeState=true for OWNER role", () => {
            const perms = derivePermissions("OWNER");
            assert.equal(perms.canChangeState, true);
        });

        test("MEMBER cannot edit plan fields", () => {
            const perms = derivePermissions("MEMBER");
            assert.equal(perms.canEdit, false);
        });

        test("MEMBER cannot delete plan", () => {
            const perms = derivePermissions("MEMBER");
            assert.equal(perms.canDelete, false);
        });

        test("MEMBER cannot share plan", () => {
            const perms = derivePermissions("MEMBER");
            assert.equal(perms.canShare, false);
        });

        test("MEMBER can leave plan", () => {
            const perms = derivePermissions("MEMBER");
            assert.equal(perms.canLeave, true);
        });

        test("OWNER cannot leave plan", () => {
            const perms = derivePermissions("OWNER");
            assert.equal(perms.canLeave, false);
        });
    });

    describe("issue #23 — private notes", () => {
        test("both OWNER and MEMBER can discuss (required for private note storage on membership)", () => {
            assert.equal(derivePermissions("OWNER").canDiscuss, true);
            assert.equal(derivePermissions("MEMBER").canDiscuss, true);
        });
    });

    describe("issue #14 — respond to shared plan", () => {
        test("MEMBER can respond", () => {
            assert.equal(derivePermissions("MEMBER").canRespond, true);
        });

        test("OWNER cannot respond (they are implicitly accepted)", () => {
            assert.equal(derivePermissions("OWNER").canRespond, false);
        });
    });

    describe("issue #15 — discussion", () => {
        test("both roles can discuss", () => {
            assert.equal(derivePermissions("OWNER").canDiscuss, true);
            assert.equal(derivePermissions("MEMBER").canDiscuss, true);
        });
    });

    describe("OWNER full permissions", () => {
        test("OWNER has edit, delete, share, discuss, changeState", () => {
            const perms = derivePermissions("OWNER");
            const expected: PlanPermissions = {
                canEdit: true,
                canChangeState: true,
                canDelete: true,
                canShare: true,
                canRespond: false,
                canDiscuss: true,
                canLeave: false,
            };
            assert.deepEqual(perms, expected);
        });
    });

    describe("MEMBER full permissions", () => {
        test("MEMBER has respond, discuss, changeState, leave", () => {
            const perms = derivePermissions("MEMBER");
            const expected: PlanPermissions = {
                canEdit: false,
                canChangeState: true,
                canDelete: false,
                canShare: false,
                canRespond: true,
                canDiscuss: true,
                canLeave: true,
            };
            assert.deepEqual(perms, expected);
        });
    });
});
