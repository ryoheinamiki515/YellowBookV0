const DEFAULT_HOME_PATH = "/(main)/plans";

/**
 * Where an authenticated, profile-complete session should be redirected, or null
 * to stay put. Covers two cases:
 *  - Landing on /login or /complete-profile → resume the deferred path (or home).
 *  - Already on a normal route with a deferred path pending (e.g. a push tap that
 *    cold-started the app while the profile was still loading) → go drain it.
 *    Without this, a pending path set outside the login flow is never consumed.
 */
export function resumeNavigationTarget({
    isLogin,
    isCompleteProfile,
    resumablePendingPath,
}: {
    isLogin: boolean;
    isCompleteProfile: boolean;
    resumablePendingPath: string | null;
}): string | null {
    if (isLogin || isCompleteProfile) {
        return resumablePendingPath ?? DEFAULT_HOME_PATH;
    }
    if (resumablePendingPath) {
        return resumablePendingPath;
    }
    return null;
}
