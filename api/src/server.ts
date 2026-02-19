import "dotenv/config";
import path from "node:path";
import express from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { auth, requiredScopes } from "express-oauth2-jwt-bearer";
import { middleware as openapiValidator } from "express-openapi-validator";

const app = express();
app.use(express.json());

app.use(
    openapiValidator({
        apiSpec: path.join(process.cwd(), "openapi.yaml"),
        validateRequests: true,
        validateResponses: process.env.NODE_ENV !== "production",
    })
);

const prisma = new PrismaClient();

// Auth0 JWT validation middleware
const jwtCheck = auth({
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL!,
    audience: process.env.AUTH0_AUDIENCE!,
});

// ---------------------------------------------------------------------------
// JIT User Provisioning
// ---------------------------------------------------------------------------
// Given an Auth0 `sub` claim, find-or-create a local User row and return
// the internal UUID. Uses upsert so it's safe to call on every request.
// ---------------------------------------------------------------------------
async function resolveUser(sub: string): Promise<string> {
    const user = await prisma.user.upsert({
        where: { auth0Sub: sub },
        update: {},
        create: { auth0Sub: sub },
    });
    return user.id;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// POST /plans — Create a social plan
// ---------------------------------------------------------------------------
const CreatePlanSchema = z.object({
    intentText: z.string().min(1).max(2000),
    contextNote: z.string().max(2000).optional(),
    locationText: z.string().max(500).optional(),
    timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).optional(),
    anchorStart: z.string().datetime().optional(),
    anchorEnd: z.string().datetime().optional(),
    timezone: z.string().max(64).optional(),
});

app.post(
    "/plans",
    jwtCheck,
    requiredScopes("create:socialplans"),
    async (req, res, next) => {
        try {
            const data = CreatePlanSchema.parse(req.body);

            // @ts-ignore — express-oauth2-jwt-bearer attaches auth to req
            const sub: string | undefined = req.auth?.payload.sub;
            if (!sub) return res.status(401).json({ error: "missing_sub" });

            const ownerId = await resolveUser(sub);

            const plan = await prisma.socialPlan.create({
                data: {
                    ownerId,
                    intentText: data.intentText,
                    contextNote: data.contextNote ?? null,
                    locationText: data.locationText ?? null,
                    timePrecision: data.timePrecision ?? "UNSPECIFIED",
                    anchorStart: data.anchorStart ? new Date(data.anchorStart) : null,
                    anchorEnd: data.anchorEnd ? new Date(data.anchorEnd) : null,
                    timezone: data.timezone ?? null,
                },
            });

            res.status(201).json(plan);
        } catch (err) {
            next(err);
        }
    }
);

// ---------------------------------------------------------------------------
// GET /plans — List my plans
// ---------------------------------------------------------------------------
app.get(
    "/plans",
    jwtCheck,
    requiredScopes("read:socialplans"),
    async (req, res, next) => {
        try {
            // @ts-ignore
            const sub: string | undefined = req.auth?.payload.sub;
            if (!sub) return res.status(401).json({ error: "missing_sub" });

            const ownerId = await resolveUser(sub);

            const plans = await prisma.socialPlan.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
            });

            res.json({ plans });
        } catch (err) {
            next(err);
        }
    }
);

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.name === "ZodError") {
        return res.status(400).json({ error: "validation", details: err.errors });
    }
    if (err?.name === "UnauthorizedError" || err?.name === "InsufficientScopeError") {
        return res.status(err.status || 401).json({
            error: err.code || "unauthorized",
            message: err.message
        });
    }
    console.error(err);
    res.status(500).json({ error: "server_error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
