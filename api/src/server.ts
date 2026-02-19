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
// POST /plans — Create a social plan
// ---------------------------------------------------------------------------
const CreatePlanSchema = z.object({
    intentText: z.string().min(1).max(2000),
    contextNote: z.string().max(2000).optional(),
    locationText: z.string().max(500).optional(),
    timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).optional(),
    anchorStart: z.iso.datetime().optional(),
    anchorEnd: z.iso.datetime().optional(),
    timezone: z.string().max(64).optional(),
});

v1.post(
    "/plans",
    ...requireUser(["create:socialplans"]),
    async (req, res, next) => {
        try {
            const data = CreatePlanSchema.parse(req.body);

            const ownerId = (req as any).userId;

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

            res.status(201).json({ data: serializeSocialPlan(plan) });
        } catch (err) {
            next(err);
        }
    }
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
