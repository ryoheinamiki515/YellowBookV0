import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";

/** Verifies the request's credentials and sets `req.auth.payload.sub`, or calls next with an error. */
export type Authenticate = (req: Request, res: Response, next: (err?: unknown) => void) => void;

export function makeRequireUser(opts: { prisma: PrismaClient; authenticate: Authenticate }) {
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
                opts.authenticate(req, res, async (err) => {
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
