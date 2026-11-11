import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "express-oauth2-jwt-bearer";

/**
 * Local-testing sign-in: `Authorization: Bearer dev:<name>` authenticates as the
 * user whose auth subject is `dev|<name>`, with no identity provider involved.
 * Only allowed outside production against a database on this machine; see assertDevAuthAllowed.
 */
export const DEV_TOKEN_PREFIX = "dev:";
export const DEV_SUBJECT_PREFIX = "dev|";

const DEV_NAME_PATTERN = /^[a-z0-9-]{1,40}$/;

export function isDevAuthEnabled(env: NodeJS.ProcessEnv): boolean {
    return env.DEV_AUTH === "1";
}

export function assertDevAuthAllowed(env: NodeJS.ProcessEnv): void {
    if (!isDevAuthEnabled(env)) return;
    if (env.NODE_ENV === "production") {
        throw new Error("DEV_AUTH=1 is not allowed when NODE_ENV=production");
    }
    if (!isLocalDatabase(env.DATABASE_URL)) {
        throw new Error("DEV_AUTH=1 is only allowed with a DATABASE_URL on localhost");
    }
}

function isLocalDatabase(databaseUrl: string | undefined): boolean {
    try {
        return ["localhost", "127.0.0.1"].includes(new URL(databaseUrl ?? "").hostname);
    } catch {
        return false;
    }
}

export function devSubjectFromAuthorization(header: string | undefined): string | null {
    const match = /^Bearer (.+)$/.exec(header ?? "");
    const token = match?.[1];
    if (!token?.startsWith(DEV_TOKEN_PREFIX)) return null;

    const name = token.slice(DEV_TOKEN_PREFIX.length);
    return DEV_NAME_PATTERN.test(name) ? `${DEV_SUBJECT_PREFIX}${name}` : null;
}

/** Sets `req.auth.payload.sub` the same way the Auth0 JWT check does. */
export function devAuthenticate(req: Request, _res: Response, next: NextFunction): void {
    const sub = devSubjectFromAuthorization(req.header("Authorization"));
    if (!sub) return next(new UnauthorizedError("Expected a dev token: Bearer dev:<name>"));

    (req as any).auth = { payload: { sub } };
    next();
}
