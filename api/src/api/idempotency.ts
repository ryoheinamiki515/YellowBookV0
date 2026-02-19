import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { serializeSocialPlan } from "./serializers/socialPlan.js";
import { planEtag } from "./etag.js";

export function hashBody(body: any) {
    return crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

export function makeWithIdempotency(prisma: PrismaClient) {
    return function withIdempotency(
        scope: string,
        handler: (req: Request, res: Response, next: NextFunction) => Promise<any>
    ) {
        return async (req: Request, res: Response, next: NextFunction) => {
            const ownerId = (req as any).userId as string;              // from requireUser
            const key = req.header("Idempotency-Key");
            if (!key) return handler(req, res, next);

            const requestHash = hashBody(req.body);

            try {
                // Try to reserve this key
                await prisma.idempotencyKey.create({
                    data: { ownerId, key, scope, requestHash },
                });

                // First time: run handler, then persist resource pointer
                const originalJson = res.json.bind(res);
                res.json = (async (payload: any) => {
                    // Expect your handler returns { data: { id: ... } }
                    const resourceId = payload?.data?.id;
                    if (resourceId) {
                        await prisma.idempotencyKey.update({
                            where: { ownerId_key_scope: { ownerId, key, scope } },
                            data: { resourceType: "SocialPlan", resourceId },
                        });
                    }
                    return originalJson(payload);
                }) as any;

                return handler(req, res, next);
            } catch (e: any) {
                // Key already used => replay
                if (e?.code === "P2002") {
                    const record = await prisma.idempotencyKey.findUnique({
                        where: { ownerId_key_scope: { ownerId, key, scope } },
                    });

                    // Same key but different body = client bug; make it loud
                    if (record?.requestHash !== requestHash) {
                        return next({ status: 409, expose: true, message: "idempotency_key_reused_with_different_body" });
                    }

                    // If we already created a resource, return it
                    if (record?.resourceType === "SocialPlan" && record.resourceId) {
                        const plan = await prisma.socialPlan.findFirst({
                            where: { id: record.resourceId, ownerId },
                        });
                        if (!plan) return next({ status: 409, expose: true, message: "idempotent_resource_missing" });

                        res.setHeader("ETag", planEtag(plan));
                        res.status(201);
                        return res.json({ data: serializeSocialPlan(plan) });
                    }

                    // Key reserved but not completed (rare race) — fail fast
                    return next({ status: 409, expose: true, message: "idempotency_in_progress" });
                }
                return next(e);
            }
        };
    };
}
