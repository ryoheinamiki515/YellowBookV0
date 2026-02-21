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
import { decodeCursor, encodeCursor } from "./api/pagination/planCursor.js";
import { PlanPatchSchema, toPrismaUpdate, validateTimeSemantics } from "./api/patch/planPatch.js";

const app = express();
app.use(express.json({ type: ["application/json", "application/*+json"] }));
app.use(cookieParser());
app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - started;
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });
    next();
});

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
            const ownerId = (req as any).userId as string;

            const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
            const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

            let cursor: { updatedAt: Date; id: string } | null = null;
            if (cursorStr) {
                try {
                    const c = decodeCursor(cursorStr);
                    cursor = { updatedAt: new Date(c.updatedAt), id: c.id };
                } catch (e) {
                    return next({ status: 400, expose: true, message: "invalid_cursor" });
                }
            }

            // Deterministic order: updatedAt desc, id desc (tie-breaker)
            const orderBy = [{ updatedAt: "desc" as const }, { id: "desc" as const }];

            // Composite cursor filter using OR conditions for multi-column sort
            const where = {
                ownerId,
                ...(cursor
                    ? {
                        OR: [
                            { updatedAt: { lt: cursor.updatedAt } },
                            {
                                updatedAt: cursor.updatedAt,
                                id: { lt: cursor.id },
                            },
                        ],
                    }
                    : {}),
            };

            const rows = await prisma.socialPlan.findMany({
                where,
                orderBy,
                take: limit + 1,
                include: { participants: true },
            });

            const hasNext = rows.length > limit;
            const pageRows = hasNext ? rows.slice(0, limit) : rows;

            let nextCursor: string | null = null;
            if (hasNext) {
                const lastRow = pageRows[pageRows.length - 1];
                if (lastRow) {
                    nextCursor = encodeCursor({
                        updatedAt: lastRow.updatedAt.toISOString(),
                        id: lastRow.id,
                    });
                }
            }

            res.json({
                data: pageRows.map(serializeSocialPlan),
                page: { limit, nextCursor },
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
v1.patch("/plans/:planId", ...requireUser(["create:socialplans"]), async (req: any, res, next) => {
    try {
        const ownerId = req.userId as string;
        const planId = req.params.planId;

        const current = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!current) return next({ status: 404, expose: true, message: "not_found" });

        const currentEtag = planEtag(current);
        const ifMatch = req.header("If-Match") ?? undefined;
        if (ifMatchFailed(ifMatch, currentEtag)) {
            return next({ status: 409, expose: true, message: "etag_mismatch" });
        }

        const patch = PlanPatchSchema.parse(req.body);

        // Apply patch in-memory to validate cross-field semantics against the *final* state.
        const finalTimePrecision = (("timePrecision" in patch) ? patch.timePrecision : current.timePrecision) ?? "UNSPECIFIED";
        const finalAnchorStart =
            ("anchorStart" in patch)
                ? (patch.anchorStart === null ? null : (patch.anchorStart === undefined ? current.anchorStart : new Date(patch.anchorStart)))
                : current.anchorStart;
        const finalAnchorEnd =
            ("anchorEnd" in patch)
                ? (patch.anchorEnd === null ? null : (patch.anchorEnd === undefined ? current.anchorEnd : new Date(patch.anchorEnd)))
                : current.anchorEnd;

        validateTimeSemantics({
            timePrecision: finalTimePrecision as any,
            anchorStart: finalAnchorStart,
            anchorEnd: finalAnchorEnd,
        });

        const updated = await prisma.socialPlan.update({
            where: { id: current.id },
            data: toPrismaUpdate(patch),
            include: { participants: true },
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
