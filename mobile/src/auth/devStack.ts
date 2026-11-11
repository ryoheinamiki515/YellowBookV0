/**
 * Local simulator testing (scripts/sim/sim.sh) runs the app against an API on this machine
 * started with DEV_AUTH=1 (api/src/middleware/devAuth.ts), which accepts `dev:<name>` tokens.
 *
 * The stack's API URL comes from EXPO_PUBLIC_DEV_STACK_API_URL rather than
 * EXPO_PUBLIC_API_BASE_URL because in development Expo lets mobile/.env override the
 * process environment for any key it defines.
 */
export function devStackApiUrl(env: { configured: string | undefined; isDevBundle: boolean }): string | null {
    if (!env.isDevBundle || !env.configured) return null;
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.configured) ? env.configured : null;
}

const DEV_USER_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Token for `yellowbook://login?devUser=<name>`, or null when the param isn't a valid dev user. */
export function devAccessTokenFor(devUser: string | string[] | undefined): string | null {
    if (typeof devUser !== "string" || !DEV_USER_PATTERN.test(devUser)) return null;
    return `dev:${devUser}`;
}
