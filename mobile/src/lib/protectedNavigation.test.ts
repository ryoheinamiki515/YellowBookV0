import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeNavigationTarget } from "./protectedNavigation.js";

describe("resumeNavigationTarget", () => {
    test("resumes the deferred path from the login screen", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: true,
                isCompleteProfile: false,
                resumablePendingPath: "/plan/abc",
            }),
            "/plan/abc"
        );
    });

    test("falls back to home from login when nothing is pending", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: true,
                isCompleteProfile: false,
                resumablePendingPath: null,
            }),
            "/(main)/plans"
        );
    });

    // Regression: a push tap that cold-starts an already-authenticated app defers
    // /plan/:id to pendingPath while the profile loads. Once ready the user is on a
    // normal route (not /login or /complete-profile), so the deferred path must
    // still be drained — previously it was stranded and the plan never opened.
    test("drains a deferred path for an already-authenticated session on a normal route", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: false,
                isCompleteProfile: false,
                resumablePendingPath: "/plan/xyz",
            }),
            "/plan/xyz"
        );
    });

    test("stays put for a normal authenticated route with nothing pending", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: false,
                isCompleteProfile: false,
                resumablePendingPath: null,
            }),
            null
        );
    });
});
