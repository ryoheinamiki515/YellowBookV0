const DEFAULT_HOME_PATH = "/(main)/plans";

export type ResumeNavigation = {
    path: string;
    /**
     * How to navigate to `path`. "replace" leaves nothing beneath (auth flow —
     * we must not keep /login in the back stack). "push" stacks on top of the
     * current route so back returns to it (notification cold-start, where the
     * home screen is already showing).
     */
    mode: "push" | "replace";
};

/**
 * Where an authenticated, profile-complete session should be redirected, or null
 * to stay put. Covers two cases:
 *  - Landing on /login or /complete-profile → replace with the deferred path (or
 *    home), so the auth screen doesn't linger in the back stack.
 *  - Already on a normal route with a deferred path pending (e.g. a push tap that
 *    cold-started the app while the profile was still loading) → push it so back
 *    returns to the home screen already showing. Without this, a pending path set
 *    outside the login flow is never consumed.
 *
 * Returns null once `currentPath` already matches the target. Navigating updates
 * currentPath before the async clearPendingPath() nulls pendingPath, so the effect
 * re-runs with the target still pending; without this guard a second push would
 * stack a duplicate detail route and swallow the first back press.
 */
export function resumeNavigationTarget({
    isLogin,
    isCompleteProfile,
    resumablePendingPath,
    currentPath,
}: {
    isLogin: boolean;
    isCompleteProfile: boolean;
    resumablePendingPath: string | null;
    currentPath: string;
}): ResumeNavigation | null {
    let target: ResumeNavigation | null = null;
    if (isLogin || isCompleteProfile) {
        target = { path: resumablePendingPath ?? DEFAULT_HOME_PATH, mode: "replace" };
    } else if (resumablePendingPath) {
        target = { path: resumablePendingPath, mode: "push" };
    }

    return target && target.path === currentPath ? null : target;
}
