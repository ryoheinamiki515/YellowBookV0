import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeNavigationTarget } from "./protectedNavigation.js";

describe("resumeNavigationTarget", () => {
    test("replaces with the deferred path from the login screen", () => {
        assert.deepEqual(
            resumeNavigationTarget({
                isLogin: true,
                isCompleteProfile: false,
                resumablePendingPath: "/plan/abc",
                currentPath: "/login",
            }),
            { path: "/plan/abc", mode: "replace" }
        );
    });

    test("falls back to home from login when nothing is pending", () => {
        assert.deepEqual(
            resumeNavigationTarget({
                isLogin: true,
                isCompleteProfile: false,
                resumablePendingPath: null,
                currentPath: "/login",
            }),
            { path: "/(main)/plans", mode: "replace" }
        );
    });

    // Regression: a push tap that cold-starts an already-authenticated app defers
    // /plan/:id to pendingPath while the profile loads. Once ready the user is on a
    // normal route (not /login or /complete-profile), so the deferred path must
    // still be drained — previously it was stranded and the plan never opened.
    // It is pushed (not replaced) so back returns to the home screen already shown.
    test("pushes a deferred path for an already-authenticated session on a normal route", () => {
        assert.deepEqual(
            resumeNavigationTarget({
                isLogin: false,
                isCompleteProfile: false,
                resumablePendingPath: "/plan/xyz",
                currentPath: "/plans",
            }),
            { path: "/plan/xyz", mode: "push" }
        );
    });

    // Regression: navigating updates currentPath before the async clearPendingPath
    // nulls pendingPath, re-running the effect with the target still pending. Once
    // we've arrived at the target we must return null, or a second push stacks a
    // duplicate /plan/... entry and the first back press stays on the detail screen.
    test("returns null once already at the target so it does not re-navigate", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: false,
                isCompleteProfile: false,
                resumablePendingPath: "/plan/xyz",
                currentPath: "/plan/xyz",
            }),
            null
        );
    });

    test("stays put for a normal authenticated route with nothing pending", () => {
        assert.equal(
            resumeNavigationTarget({
                isLogin: false,
                isCompleteProfile: false,
                resumablePendingPath: null,
                currentPath: "/plans",
            }),
            null
        );
    });
});
