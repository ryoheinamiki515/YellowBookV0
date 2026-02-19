import "dotenv/config";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { middleware as openapiValidator } from "express-openapi-validator";
import { serializeSocialPlan } from "./api/serializers/socialPlan.js";
import { makeRequireUser } from "./middleware/requireUser.js";
import { planEtag, ifMatchFailed } from "./api/etag.js";
import { makeWithIdempotency } from "./api/idempotency.js";

const app = express();
app.use(express.json({ type: ["application/json", "application/*+json"] }));
app.use(cookieParser());

app.use(
    openapiValidator({
        apiSpec: path.join(process.cwd(), "openapi.yaml"),
        validateRequests: true,
        validateResponses: process.env.NODE_ENV !== "production",
    })
);

const prisma = new PrismaClient();

const requireUser = makeRequireUser({
    prisma,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL!,
    audience: process.env.AUTH0_AUDIENCE!,
});

const withIdempotency = makeWithIdempotency(prisma);

const v1 = express.Router();
app.use("/v1", v1);

v1.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// GET /v1/me — Get the current authenticated user (MeResponse)
// ---------------------------------------------------------------------------
v1.get("/me", ...requireUser([]), async (req, res) => {
    const id = (req as any).userId as string;
    const authSubject = (req as any).authSubject as string;

    res.json({
        data: { id, authSubject },
    });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------
const SocialPlanConstraints = z
    .object({
        timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]),
        anchorStart: z.date().nullable(),
        anchorEnd: z.date().nullable(),
    })
    .superRefine((data, ctx) => {
        if (data.timePrecision === "NONE") {
            if (data.anchorStart !== null || data.anchorEnd !== null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "anchorStart and anchorEnd must be null when timePrecision is NONE",
                    path: ["timePrecision"],
                });
            }
        }

        if (data.timePrecision === "WINDOW" || data.timePrecision === "EXACT") {
            if (data.anchorStart === null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `anchorStart is required when timePrecision is ${data.timePrecision}`,
                    path: ["anchorStart"],
                });
            }
        }

        if (data.anchorStart && data.anchorEnd && data.anchorEnd < data.anchorStart) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "anchorEnd cannot be before anchorStart",
                path: ["anchorEnd"],
            });
        }
    });

// ---------------------------------------------------------------------------
// POST /plans — Create a social plan
// ---------------------------------------------------------------------------
const CreatePlanSchema = z
    .object({
        intentText: z.string().min(1).max(2000),
        contextNote: z.string().max(2000).optional(),
        locationText: z.string().max(500).optional(),
        timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).default("UNSPECIFIED"),
        anchorStart: z.string().datetime().nullable().optional(),
        anchorEnd: z.string().datetime().nullable().optional(),
        timezone: z.string().max(64).optional(),
    })
    .superRefine((data, ctx) => {
        // Run deep constraints
        SocialPlanConstraints.parse({
            timePrecision: data.timePrecision,
            anchorStart: data.anchorStart ? new Date(data.anchorStart) : null,
            anchorEnd: data.anchorEnd ? new Date(data.anchorEnd) : null,
        });
    });

v1.post(
    "/plans",
    ...requireUser(["create:socialplans"]),
    withIdempotency("POST /v1/plans", async (req, res, next) => {
        try {
            const data = CreatePlanSchema.parse(req.body);

            const ownerId = (req as any).userId;

            const plan = await prisma.socialPlan.create({
                data: {
                    ownerId,
                    intentText: data.intentText,
                    contextNote: data.contextNote ?? null,
                    locationText: data.locationText ?? null,
                    timePrecision: data.timePrecision,
                    anchorStart: data.anchorStart ? new Date(data.anchorStart) : null,
                    anchorEnd: data.anchorEnd ? new Date(data.anchorEnd) : null,
                    timezone: data.timezone ?? null,
                },
            });

            res.setHeader("ETag", planEtag(plan));
            res.status(201).json({ data: serializeSocialPlan(plan) });
        } catch (err) {
            next(err);
        }
    })
);

// ---------------------------------------------------------------------------
// GET /plans — List my plans
// ---------------------------------------------------------------------------
v1.get(
    "/plans",
    ...requireUser(["read:socialplans"]),
    async (req, res, next) => {
        try {
            const ownerId = (req as any).userId;

            const plans = await prisma.socialPlan.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
            });

            res.json({
                data: plans.map(serializeSocialPlan),
                meta: {
                    limit: 50,
                    nextCursor: null,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

// ---------------------------------------------------------------------------
// GET /v1/plans/:planId — Get a social plan
// ---------------------------------------------------------------------------
v1.get("/plans/:planId", ...requireUser(["read:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        res.setHeader("ETag", planEtag(plan));
        res.json({ data: serializeSocialPlan(plan) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/plans/:planId — Update a social plan (JSON Merge Patch)
// ---------------------------------------------------------------------------
const UpdatePlanSchema = z.object({
    intentText: z.string().min(1).max(5000).optional(),
    contextNote: z.string().max(20000).nullable().optional(),
    locationText: z.string().max(5000).nullable().optional(),
    state: z.enum(["OPEN", "DONE", "DROPPED", "ARCHIVED"]).optional(),
    timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).optional(),
    anchorStart: z.string().datetime().nullable().optional(),
    anchorEnd: z.string().datetime().nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
});

v1.patch("/plans/:planId", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        const current = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!current) return next({ status: 404, expose: true, message: "not_found" });

        const currentEtag = planEtag(current);
        const ifMatch = req.header("If-Match") ?? undefined;
        if (ifMatchFailed(ifMatch, currentEtag)) {
            return next({ status: 409, expose: true, message: "etag_mismatch" });
        }

        const patch = UpdatePlanSchema.parse(req.body);

        // Merge implementation for validation (JSON Merge Patch semantics)
        const merged = {
            timePrecision: patch.timePrecision ?? current.timePrecision,
            anchorStart: patch.anchorStart !== undefined
                ? (patch.anchorStart ? new Date(patch.anchorStart) : null)
                : current.anchorStart,
            anchorEnd: patch.anchorEnd !== undefined
                ? (patch.anchorEnd ? new Date(patch.anchorEnd) : null)
                : current.anchorEnd,
        };

        // Deep Validation: Validate the RESULTING state of the resource
        SocialPlanConstraints.parse(merged);

        const updateData: any = {};
        if (patch.intentText !== undefined) updateData.intentText = patch.intentText;
        if (patch.contextNote !== undefined) updateData.contextNote = patch.contextNote;
        if (patch.locationText !== undefined) updateData.locationText = patch.locationText;
        if (patch.state !== undefined) updateData.state = patch.state;
        if (patch.timePrecision !== undefined) updateData.timePrecision = patch.timePrecision;
        if (patch.timezone !== undefined) updateData.timezone = patch.timezone;
        if (patch.anchorStart !== undefined) {
            updateData.anchorStart = patch.anchorStart ? new Date(patch.anchorStart) : null;
        }
        if (patch.anchorEnd !== undefined) {
            updateData.anchorEnd = patch.anchorEnd ? new Date(patch.anchorEnd) : null;
        }

        const updated = await prisma.socialPlan.update({
            where: { id: current.id },
            data: updateData,
        });

        res.setHeader("ETag", planEtag(updated));
        res.json({ data: serializeSocialPlan(updated) });
    } catch (e) {
        next(e);
    }
});

// Put AFTER all routes (including the OpenAPI validator middleware)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err?.status || err?.statusCode || 500);

    // Zod -> field errors
    const zodErrors =
        err?.name === "ZodError"
            ? err.errors?.map((e: any) => ({
                field: (e.path || []).join(".") || "body",
                message: e.message,
            }))
            : undefined;

    // express-openapi-validator typically provides err.errors for request/response validation
    const openapiErrors =
        Array.isArray(err?.errors) && err.errors.length
            ? err.errors.map((e: any) => ({
                field: e.path || e.instancePath || e.location || "request",
                message: e.message || e.error || "Invalid request",
            }))
            : undefined;

    // Auth errors from express-oauth2-jwt-bearer
    const isAuthErr =
        err?.name === "UnauthorizedError" || err?.name === "InsufficientScopeError";

    const problem = {
        type:
            status === 400
                ? "https://api.yellowbook.example.com/problems/validation-error"
                : status === 401
                    ? "https://api.yellowbook.example.com/problems/unauthorized"
                    : status === 404
                        ? "https://api.yellowbook.example.com/problems/not-found"
                        : "https://api.yellowbook.example.com/problems/server-error",
        title:
            status === 400
                ? "Validation error"
                : status === 401
                    ? "Unauthorized"
                    : status === 404
                        ? "Not found"
                        : "Server error",
        status,
        detail:
            err?.message ||
            (isAuthErr ? "Missing/invalid credentials or insufficient scope." : undefined),
        instance: req.originalUrl,
        errors: zodErrors || openapiErrors,
    };

    res
        .status(status)
        .type("application/problem+json")
        .json(problem);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
