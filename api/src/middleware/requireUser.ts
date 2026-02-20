import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import { auth, requiredScopes } from "express-oauth2-jwt-bearer";

export function makeRequireUser(opts: {
    prisma: PrismaClient;
    issuerBaseURL: string;
    audience: string;
}) {
    const jwtCheck = auth({
        issuerBaseURL: opts.issuerBaseURL,
        audience: opts.audience,
    });

    async function resolveUser(sub: string): Promise<string> {
        const user = await opts.prisma.user.upsert({
            where: { auth0Sub: sub },
            update: {},
            create: { auth0Sub: sub },
        });
        return user.id;
    }

    return function requireUser(scopes: string[] = []) {
        const scopeMw = scopes.length ? (requiredScopes as any)(...scopes) : (_r: any, _s: any, n: any) => n();

        return [
            async (req: any, res: Response, next: NextFunction) => {

                jwtCheck(req, res, (err) => {
                    if (err) return next(err);
                    scopeMw(req, res, async (err: any) => {
                        if (err) return next(err);

                        try {
                            const sub = (req as any).auth?.payload?.sub as string | undefined;
                            if (!sub) return next({ status: 401, expose: true, message: "missing_sub" });

                            const userId = await resolveUser(sub);

                            (req as any).authSubject = sub;
                            (req as any).userId = userId;

                            next();
                        } catch (e) {
                            next(e);
                        }
                    });
                });
            },
        ];
    };
}
