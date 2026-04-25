import type { Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import { auth } from "express-oauth2-jwt-bearer";

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

    return function requireUser() {
        return [
            async (req: any, res: Response, next: NextFunction) => {
                jwtCheck(req, res, async (err) => {
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
            },
        ];
    };
}
