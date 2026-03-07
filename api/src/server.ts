import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { middleware as openapiValidator } from "express-openapi-validator";
import { serializeSocialPlan, serializeSubscribedPlan } from "./api/serializers/socialPlan.js";
import { serializePerson } from "./api/serializers/person.js";
import { serializeConnection } from "./api/serializers/connection.js";
import { makeRequireUser } from "./middleware/requireUser.js";
import { planEtag, ifMatchFailed } from "./api/etag.js";
import { makeWithIdempotency } from "./api/idempotency.js";
import { decodeCursor, encodeCursor } from "./api/pagination/planCursor.js";
import { PlanPatchSchema, toPrismaUpdate, validateTimeSemantics } from "./api/patch/planPatch.js";
import { generateToken } from "./api/tokens.js";

const app = express();
app.use(cors());
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
const APP_BASE_URL = process.env.APP_BASE_URL || "https://yellowbook.example.com";

const v1 = express.Router();
app.use("/v1", v1);

v1.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// GET /v1/me — Get the current authenticated user (MeResponse)
// ---------------------------------------------------------------------------
v1.get("/me", ...requireUser([]), async (req, res, next) => {
    try {
        const id = (req as any).userId as string;
        const authSubject = (req as any).authSubject as string;

        const user = await prisma.user.findUniqueOrThrow({ where: { id } });

        res.json({
            data: { id, authSubject, displayName: user.displayName },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/me — Update the current user's profile
// ---------------------------------------------------------------------------
const PatchMeSchema = z.object({
    displayName: z.string().trim().min(1).max(120),
});

v1.patch("/me", ...requireUser([]), async (req, res, next) => {
    try {
        const id = (req as any).userId as string;
        const authSubject = (req as any).authSubject as string;
        const data = PatchMeSchema.parse(req.body);
        const displayName = requireDisplayName(data.displayName);

        const user = await prisma.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id },
                data: { displayName },
            });

            await tx.person.updateMany({
                where: {
                    linkedUserId: id,
                    displayName: SYSTEM_FRIEND_PLACEHOLDER,
                },
                data: { displayName },
            });

            return updatedUser;
        });

        res.json({
            data: { id: user.id, authSubject, displayName: user.displayName },
        });
    } catch (e) {
        next(e);
    }
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

const PersonBirthdaySchema = z
    .object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        year: z.number().int().min(1900).max(2100).nullable().optional(),
    })
    .superRefine((data, ctx) => {
        // Validate actual calendar day while allowing yearless birthdays.
        const year = data.year ?? 2000; // leap-safe reference year
        const dt = new Date(Date.UTC(year, data.month - 1, data.day));
        const valid =
            dt.getUTCFullYear() === year &&
            dt.getUTCMonth() === data.month - 1 &&
            dt.getUTCDate() === data.day;

        if (!valid) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "birthday is not a valid calendar date",
                path: ["day"],
            });
        }
    });

const CreatePersonSchema = z.object({
    displayName: z.string().trim().min(1).max(120),
    pronouns: z.string().trim().min(1).max(80).nullable().optional(),
    neighborhood: z.string().trim().min(1).max(120).nullable().optional(),
    notes: z.string().trim().max(20000).nullable().optional(),
    birthday: PersonBirthdaySchema.nullable().optional(),
});

const PatchPersonSchema = z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    pronouns: z.string().trim().min(1).max(80).nullable().optional(),
    neighborhood: z.string().trim().min(1).max(120).nullable().optional(),
    notes: z.string().trim().max(20000).nullable().optional(),
    birthday: PersonBirthdaySchema.nullable().optional(),
    archivedAt: z.string().datetime().nullable().optional(),
});

function nullIfBlank(value: string | null | undefined) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function toJsonSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

const SYSTEM_FRIEND_PLACEHOLDER = "Friend";

function requireDisplayName(value: string | null | undefined) {
    const displayName = nullIfBlank(value);
    if (!displayName) {
        throw { status: 409, expose: true, message: "display_name_required" };
    }
    return displayName;
}

async function loadConnectionMapForUser(userId: string) {
    const linkedPeople = await prisma.person.findMany({
        where: { ownerId: userId, linkedUserId: { not: null } },
        select: { linkedUserId: true, displayName: true, id: true },
    });

    return new Map(
        linkedPeople.map((person) => [
            person.linkedUserId!,
            { personId: person.id, displayName: person.displayName },
        ])
    );
}

function toPersonCreateData(ownerId: string, input: z.infer<typeof CreatePersonSchema>): Prisma.PersonUncheckedCreateInput {
    return {
        ownerId,
        displayName: input.displayName,
        pronouns: nullIfBlank(input.pronouns),
        neighborhood: nullIfBlank(input.neighborhood),
        notes: nullIfBlank(input.notes),
        birthdayMonth: input.birthday?.month ?? null,
        birthdayDay: input.birthday?.day ?? null,
        birthdayYear: input.birthday?.year ?? null,
        archivedAt: null,
    };
}

function toPersonPatchData(patch: z.infer<typeof PatchPersonSchema>): Prisma.PersonUncheckedUpdateInput {
    const data: Prisma.PersonUncheckedUpdateInput = {};

    if ("displayName" in patch && patch.displayName !== undefined) data.displayName = patch.displayName;
    if ("pronouns" in patch) data.pronouns = nullIfBlank(patch.pronouns);
    if ("neighborhood" in patch) data.neighborhood = nullIfBlank(patch.neighborhood);
    if ("notes" in patch) data.notes = nullIfBlank(patch.notes);
    if ("birthday" in patch) {
        data.birthdayMonth = patch.birthday?.month ?? null;
        data.birthdayDay = patch.birthday?.day ?? null;
        data.birthdayYear = patch.birthday?.year ?? null;
    }
    if ("archivedAt" in patch) {
        data.archivedAt = patch.archivedAt ? new Date(patch.archivedAt) : null;
    }

    return data;
}

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
            const userId = (req as any).userId as string;
            const scope = (typeof req.query.scope === "string" ? req.query.scope : "owned") as "owned" | "subscribed" | "all";

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

            const orderBy = [{ updatedAt: "desc" as const }, { id: "desc" as const }];

            const cursorFilter = cursor
                ? {
                    OR: [
                        { updatedAt: { lt: cursor.updatedAt } },
                        { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                    ],
                }
                : {};

            type OwnedPlanRow = Prisma.SocialPlanGetPayload<{
                include: { participants: true };
            }>;
            type SubscribedPlanRow = Prisma.SocialPlanGetPayload<{
                include: {
                    owner: { select: { displayName: true } };
                    participants: {
                        include: { person: { select: { linkedUserId: true } } };
                    };
                };
            }>;
            type AnnotatedPlan =
                | { plan: OwnedPlanRow; role: "owner" }
                | { plan: SubscribedPlanRow; role: "subscriber" };

            const annotated: AnnotatedPlan[] = [];

            if (scope === "owned" || scope === "all") {
                const ownedRows = await prisma.socialPlan.findMany({
                    where: { ownerId: userId, ...cursorFilter },
                    orderBy,
                    take: limit + 1,
                    include: { participants: true },
                });
                for (const row of ownedRows) {
                    annotated.push({ plan: row, role: "owner" });
                }
            }

            if (scope === "subscribed" || scope === "all") {
                const subscriptions = await prisma.planSubscription.findMany({
                    where: { userId },
                    select: { planId: true },
                });
                const subscribedPlanIds = subscriptions.map((s) => s.planId);

                if (subscribedPlanIds.length > 0) {
                    const subscribedRows = await prisma.socialPlan.findMany({
                        where: { id: { in: subscribedPlanIds }, ...cursorFilter },
                        orderBy,
                        take: limit + 1,
                        include: {
                            owner: { select: { displayName: true } },
                            participants: {
                                include: { person: { select: { linkedUserId: true } } },
                            },
                        },
                    });
                    for (const row of subscribedRows) {
                        annotated.push({ plan: row, role: "subscriber" });
                    }
                }
            }

            // Sort combined results and paginate
            annotated.sort((a, b) => {
                const timeDiff = b.plan.updatedAt.getTime() - a.plan.updatedAt.getTime();
                if (timeDiff !== 0) return timeDiff;
                return b.plan.id < a.plan.id ? -1 : b.plan.id > a.plan.id ? 1 : 0;
            });

            const hasNext = annotated.length > limit;
            const pageItems = hasNext ? annotated.slice(0, limit) : annotated;

            let nextCursor: string | null = null;
            if (hasNext && pageItems.length > 0) {
                const last = pageItems[pageItems.length - 1]!.plan;
                nextCursor = encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id });
            }

            // Build connectionMap for subscriber plans
            let connectionMap: Map<string, { personId: string; displayName: string }> | null = null;
            const hasSubscribed = pageItems.some((a) => a.role === "subscriber");
            if (hasSubscribed) {
                connectionMap = await loadConnectionMapForUser(userId);
            }

            const serialized = pageItems.map((a) => {
                if (a.role === "subscriber") {
                    return { ...serializeSubscribedPlan(a.plan, connectionMap!), role: "subscriber" as const };
                }
                return { ...serializeSocialPlan(a.plan), role: "owner" as const };
            });

            res.setHeader("Cache-Control", "no-cache");
            res.json(
                toJsonSafe({
                    data: serialized,
                    page: { limit, nextCursor },
                })
            );
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
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const plan = await prisma.socialPlan.findFirst({
            where: { id: planId },
            include: {
                owner: { select: { displayName: true } },
                participants: { include: { person: { select: { linkedUserId: true } } } },
            },
        });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        const isOwner = plan.ownerId === userId;
        const isSubscriber = !isOwner && await prisma.planSubscription.findUnique({
            where: { planId_userId: { planId, userId } },
        });

        if (!isOwner && !isSubscriber) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        if (isOwner) {
            res.setHeader("ETag", planEtag(plan));
            res.setHeader("Cache-Control", "no-cache");
            res.json(toJsonSafe({ data: { ...serializeSocialPlan(plan), role: "owner" } }));
        } else {
            const connectionMap = await loadConnectionMapForUser(userId);

            res.setHeader("Cache-Control", "no-cache");
            res.json(
                toJsonSafe({
                    data: { ...serializeSubscribedPlan(plan, connectionMap), role: "subscriber" },
                })
            );
        }
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

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId — Permanently delete a social plan
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId as string;

        const result = await prisma.socialPlan.deleteMany({
            where: { id: planId, ownerId },
        });

        if (result.count === 0) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/plans/:planId/participants — Add a participant to a plan
// ---------------------------------------------------------------------------
const AddParticipantSchema = z.object({
    personId: z.string().uuid().nullable().optional(),
    displayName: z.string().max(120).nullable().optional(),
    isPrimary: z.boolean().default(false),
}).refine(
    (d) => d.personId || d.displayName,
    { message: "At least one of personId or displayName is required" }
);

v1.post(
    "/plans/:planId/participants",
    ...requireUser(["create:socialplans"]),
    withIdempotency("POST /v1/plans/:planId/participants", async (req, res, next) => {
        try {
            const ownerId = (req as any).userId as string;
            const planId = req.params.planId as string;

            const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
            if (!plan) return next({ status: 404, expose: true, message: "not_found" });

            const data = AddParticipantSchema.parse(req.body);

            // If personId provided, verify the person belongs to this user
            if (data.personId) {
                const person = await prisma.person.findFirst({
                    where: { id: data.personId, ownerId },
                });
                if (!person) return next({ status: 404, expose: true, message: "person_not_found" });
            }

            const [participant] = await prisma.$transaction([
                prisma.socialPlanParticipant.create({
                    data: {
                        planId: planId,
                        personId: data.personId ?? null,
                        displayName: data.displayName ?? null,
                        isPrimary: data.isPrimary,
                    },
                }),
                prisma.socialPlan.update({
                    where: { id: planId },
                    data: { updatedAt: new Date() },
                }),
            ]);

            res.setHeader("Location", `/v1/plans/${planId}/participants/${participant.id}`);
            res.status(201).json({
                data: {
                    id: participant.id,
                    planId: participant.planId,
                    personId: participant.personId,
                    displayName: participant.displayName,
                    isPrimary: participant.isPrimary,
                    createdAt: participant.createdAt.toISOString(),
                },
            });
        } catch (e: any) {
            // Unique constraint violation → 409 Conflict
            if (e?.code === "P2002") {
                return next({ status: 409, expose: true, message: "participant_already_exists" });
            }
            next(e);
        }
    })
);

// ---------------------------------------------------------------------------
// PATCH /v1/plans/:planId/participants/:participantId — Update a participant
// ---------------------------------------------------------------------------
const PatchParticipantSchema = z.object({
    displayName: z.string().max(120).nullable().optional(),
    isPrimary: z.boolean().optional(),
});

v1.patch("/plans/:planId/participants/:participantId", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId as string;
        const participantId = req.params.participantId as string;

        const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        const existing = await prisma.socialPlanParticipant.findFirst({
            where: { id: participantId, planId },
        });
        if (!existing) return next({ status: 404, expose: true, message: "not_found" });

        const patch = PatchParticipantSchema.parse(req.body);
        const updateData: Record<string, unknown> = {};
        if ("displayName" in patch) updateData.displayName = patch.displayName ?? null;
        if ("isPrimary" in patch) updateData.isPrimary = patch.isPrimary;

        if (Object.keys(updateData).length === 0) {
            return res.json({
                data: {
                    id: existing.id,
                    planId: existing.planId,
                    personId: existing.personId,
                    displayName: existing.displayName,
                    isPrimary: existing.isPrimary,
                    createdAt: existing.createdAt.toISOString(),
                },
            });
        }

        const [updated] = await prisma.$transaction([
            prisma.socialPlanParticipant.update({
                where: { id: participantId },
                data: updateData,
            }),
            prisma.socialPlan.update({
                where: { id: planId },
                data: { updatedAt: new Date() },
            }),
        ]);

        res.json({
            data: {
                id: updated.id,
                planId: updated.planId,
                personId: updated.personId,
                displayName: updated.displayName,
                isPrimary: updated.isPrimary,
                createdAt: updated.createdAt.toISOString(),
            },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId/participants/:participantId — Remove a participant
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId/participants/:participantId", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId as string;
        const participantId = req.params.participantId as string;

        const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        const result = await prisma.socialPlanParticipant.deleteMany({
            where: { id: participantId, planId },
        });

        if (result.count === 0) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        await prisma.socialPlan.update({
            where: { id: planId },
            data: { updatedAt: new Date() },
        });

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// GET /v1/people — List people in the user's People Library
// ---------------------------------------------------------------------------
v1.get("/people", ...requireUser([]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;

        const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
        const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
        const qRaw = typeof req.query.q === "string" ? req.query.q : undefined;
        const q = qRaw?.trim();

        if (qRaw !== undefined && !q) {
            return next({ status: 400, expose: true, message: "q must not be blank" });
        }

        let cursor: { updatedAt: Date; id: string } | null = null;
        if (cursorStr) {
            try {
                const c = decodeCursor(cursorStr);
                cursor = { updatedAt: new Date(c.updatedAt), id: c.id };
            } catch (_e) {
                return next({ status: 400, expose: true, message: "invalid_cursor" });
            }
        }

        const where: Prisma.PersonWhereInput = {
            ownerId,
            ...(q
                ? {
                    displayName: {
                        contains: q,
                        mode: "insensitive",
                    },
                }
                : {}),
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

        const rows = await prisma.person.findMany({
            where,
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: limit + 1,
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
            data: pageRows.map(serializePerson),
            page: { limit, nextCursor },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/people — Create a person in the user's People Library
// ---------------------------------------------------------------------------
v1.post(
    "/people",
    ...requireUser([]),
    withIdempotency("POST /v1/people", async (req, res, next) => {
        try {
            const ownerId = (req as any).userId as string;
            const input = CreatePersonSchema.parse(req.body);

            const person = await prisma.person.create({
                data: toPersonCreateData(ownerId, input),
            });

            res.setHeader("Location", `/v1/people/${person.id}`);
            res.status(201).json({ data: serializePerson(person) });
        } catch (e) {
            next(e);
        }
    })
);

// ---------------------------------------------------------------------------
// GET /v1/people/:personId — Get a person
// ---------------------------------------------------------------------------
v1.get("/people/:personId", ...requireUser([]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personId = req.params.personId;

        const person = await prisma.person.findFirst({ where: { id: personId, ownerId } });
        if (!person) return next({ status: 404, expose: true, message: "not_found" });

        res.json({ data: serializePerson(person) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/people/:personId — Update a person (JSON Merge Patch)
// ---------------------------------------------------------------------------
v1.patch("/people/:personId", ...requireUser([]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personId = req.params.personId;

        const current = await prisma.person.findFirst({ where: { id: personId, ownerId } });
        if (!current) return next({ status: 404, expose: true, message: "not_found" });

        const patch = PatchPersonSchema.parse(req.body);
        const data = toPersonPatchData(patch);

        if (Object.keys(data).length === 0) {
            return res.json({ data: serializePerson(current) });
        }

        const updated = await prisma.person.update({
            where: { id: current.id },
            data,
        });

        res.json({ data: serializePerson(updated) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/people/:personId — Delete a person
// ---------------------------------------------------------------------------
v1.delete("/people/:personId", ...requireUser([]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personId = req.params.personId;

        const result = await prisma.person.deleteMany({
            where: { id: personId, ownerId },
        });

        if (result.count === 0) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

async function linkOrCreatePerson(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    params: { ownerId: string; linkedUserId: string; displayName: string }
) {
    const { ownerId, linkedUserId, displayName } = params;

    // Already linked
    const alreadyLinked = await tx.person.findFirst({
        where: { ownerId, linkedUserId },
    });
    if (alreadyLinked) return alreadyLinked;

    // Try to find an existing unlinked Person with a matching displayName
    const nameMatch = await tx.person.findFirst({
        where: {
            ownerId,
            linkedUserId: null,
            displayName: { equals: displayName, mode: "insensitive" },
        },
    });
    if (nameMatch) {
        return tx.person.update({
            where: { id: nameMatch.id },
            data: { linkedUserId },
        });
    }

    return tx.person.create({
        data: { ownerId, linkedUserId, displayName },
    });
}

// ---------------------------------------------------------------------------
// POST /v1/connections/invites — Generate a connection invite
// ---------------------------------------------------------------------------
v1.post("/connections/invites", ...requireUser([]), async (req, res, next) => {
    try {
        const senderId = (req as any).userId as string;
        const senderUser = await prisma.user.findUniqueOrThrow({
            where: { id: senderId },
            select: { displayName: true },
        });

        requireDisplayName(senderUser.displayName);

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const invite =
            await prisma.connectionInvite.findFirst({
                where: {
                    senderId,
                    status: "PENDING",
                    expiresAt: { gt: now },
                },
                orderBy: { createdAt: "desc" },
            }) ??
            await prisma.connectionInvite.create({
                data: { token: generateToken(), senderId, expiresAt },
            });

        res.status(201).json({
            data: {
                id: invite.id,
                token: invite.token,
                url: `${APP_BASE_URL}/invite/${invite.token}`,
                expiresAt: invite.expiresAt.toISOString(),
            },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/connections/invites/:token/accept — Accept a connection invite
// ---------------------------------------------------------------------------
v1.post("/connections/invites/:token/accept", ...requireUser([]), async (req, res, next) => {
    try {
        const acceptorId = (req as any).userId as string;
        const token = req.params.token;

        const invite = await prisma.connectionInvite.findUnique({ where: { token } });

        if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
            return next({ status: 404, expose: true, message: "invite_not_found_or_expired" });
        }

        if (invite.senderId === acceptorId) {
            return next({ status: 400, expose: true, message: "cannot_accept_own_invite" });
        }

        const existing = await prisma.connection.findUnique({
            where: { userId_targetId: { userId: invite.senderId, targetId: acceptorId } },
        });
        if (existing) {
            return next({ status: 409, expose: true, message: "already_connected" });
        }

        const [senderUser, acceptorUser] = await Promise.all([
            prisma.user.findUniqueOrThrow({ where: { id: invite.senderId } }),
            prisma.user.findUniqueOrThrow({ where: { id: acceptorId } }),
        ]);
        const senderDisplayName = requireDisplayName(senderUser.displayName);
        const acceptorDisplayName = requireDisplayName(acceptorUser.displayName);

        await prisma.$transaction(async (tx) => {
            // Create bidirectional connections
            await tx.connection.createMany({
                data: [
                    { userId: invite.senderId, targetId: acceptorId },
                    { userId: acceptorId, targetId: invite.senderId },
                ],
            });

            // Link or create Person records in each other's libraries
            await linkOrCreatePerson(tx, {
                ownerId: invite.senderId,
                linkedUserId: acceptorId,
                displayName: acceptorDisplayName,
            });
            await linkOrCreatePerson(tx, {
                ownerId: acceptorId,
                linkedUserId: invite.senderId,
                displayName: senderDisplayName,
            });

            // Mark invite as accepted
            await tx.connectionInvite.update({
                where: { id: invite.id },
                data: { status: "ACCEPTED" },
            });
        });

        res.json({ data: { status: "connected" } });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// GET /v1/connections — List connections
// ---------------------------------------------------------------------------
v1.get("/connections", ...requireUser([]), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;

        const connections = await prisma.connection.findMany({
            where: { userId },
            include: { target: { select: { id: true, displayName: true } } },
            orderBy: { createdAt: "desc" },
        });

        // Find the Person record in the current user's library for each target
        const targetIds = connections.map((c) => c.targetId);
        const linkedPeople = await prisma.person.findMany({
            where: { ownerId: userId, linkedUserId: { in: targetIds } },
            select: { id: true, linkedUserId: true },
        });
        const personByLinkedUser = new Map(linkedPeople.map((p) => [p.linkedUserId!, p]));

        res.json({
            data: connections.map((c) =>
                serializeConnection(c, personByLinkedUser.get(c.targetId) ?? null)
            ),
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/connections/:connectionId — Remove a connection
// ---------------------------------------------------------------------------
v1.delete("/connections/:connectionId", ...requireUser([]), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const connectionId = req.params.connectionId;

        const conn = await prisma.connection.findFirst({
            where: { id: connectionId, userId },
        });
        if (!conn) return next({ status: 404, expose: true, message: "not_found" });

        await prisma.$transaction(async (tx) => {
            // Delete both directions
            await tx.connection.deleteMany({
                where: {
                    OR: [
                        { userId: conn.userId, targetId: conn.targetId },
                        { userId: conn.targetId, targetId: conn.userId },
                    ],
                },
            });

            // Nullify linkedUserId on both Person records (don't delete them)
            await tx.person.updateMany({
                where: { ownerId: conn.userId, linkedUserId: conn.targetId },
                data: { linkedUserId: null },
            });
            await tx.person.updateMany({
                where: { ownerId: conn.targetId, linkedUserId: conn.userId },
                data: { linkedUserId: null },
            });
        });

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/plans/:planId/share — Share a plan
// ---------------------------------------------------------------------------
v1.post("/plans/:planId/share", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        const plan = await prisma.socialPlan.findFirst({
            where: { id: planId, ownerId },
            include: { participants: { include: { person: { select: { linkedUserId: true } } } } },
        });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        // Create or reuse active ShareToken
        let shareToken = await prisma.shareToken.findFirst({
            where: { planId, revokedAt: null },
        });
        if (!shareToken) {
            shareToken = await prisma.shareToken.create({
                data: { token: generateToken(), planId, createdBy: ownerId },
            });
        }

        // Create PlanSubscription for each connected participant
        const linkedUserIds = plan.participants
            .map((p) => p.person?.linkedUserId)
            .filter((id): id is string => id != null && id !== ownerId);

        const subscribedUserIds: string[] = [];
        for (const linkedUserId of linkedUserIds) {
            try {
                await prisma.planSubscription.create({
                    data: { planId, userId: linkedUserId },
                });
                subscribedUserIds.push(linkedUserId);
            } catch (e: any) {
                // Ignore unique constraint violations (already subscribed)
                if (e?.code !== "P2002") throw e;
                subscribedUserIds.push(linkedUserId);
            }
        }

        res.json({
            data: {
                shareToken: {
                    id: shareToken.id,
                    token: shareToken.token,
                    url: `${APP_BASE_URL}/share/${shareToken.token}`,
                },
                subscribedUserIds,
            },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// GET /v1/plans/:planId/share — Get share status
// ---------------------------------------------------------------------------
v1.get("/plans/:planId/share", ...requireUser(["read:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        const shareToken = await prisma.shareToken.findFirst({
            where: { planId, revokedAt: null },
        });

        const subscribers = await prisma.planSubscription.findMany({
            where: { planId },
            include: { user: { select: { id: true, displayName: true } } },
        });

        res.json({
            data: {
                shareToken: shareToken
                    ? {
                          id: shareToken.id,
                          token: shareToken.token,
                          url: `${APP_BASE_URL}/share/${shareToken.token}`,
                      }
                    : null,
                subscribers: subscribers.map((s) => ({
                    userId: s.user.id,
                    displayName: s.user.displayName,
                    subscribedAt: s.createdAt.toISOString(),
                })),
            },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId/share — Revoke sharing
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId/share", ...requireUser(["create:socialplans"]), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        const plan = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId } });
        if (!plan) return next({ status: 404, expose: true, message: "not_found" });

        await prisma.$transaction(async (tx) => {
            await tx.shareToken.updateMany({
                where: { planId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await tx.planSubscription.deleteMany({ where: { planId } });
        });

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// GET /v1/shared/:token — Public view of a shared plan
// ---------------------------------------------------------------------------
v1.get("/shared/:token", async (req, res, next) => {
    try {
        const token = req.params.token;

        const shareToken = await prisma.shareToken.findUnique({
            where: { token },
            include: {
                plan: {
                    include: {
                        participants: true,
                        owner: { select: { displayName: true } },
                    },
                },
            },
        });

        if (!shareToken || shareToken.revokedAt) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        const plan = shareToken.plan;

        res.json({
            data: {
                id: plan.id,
                ownerDisplayName: plan.owner.displayName,
                intentText: plan.intentText,
                locationText: plan.locationText,
                state: plan.state,
                timePrecision: plan.timePrecision,
                anchorStart: plan.anchorStart?.toISOString() ?? null,
                anchorEnd: plan.anchorEnd?.toISOString() ?? null,
                timezone: plan.timezone,
                participants: plan.participants.map((p) => ({
                    id: p.id,
                    displayName: p.displayName,
                    createdAt: p.createdAt.toISOString(),
                })),
                createdAt: plan.createdAt.toISOString(),
                updatedAt: plan.updatedAt.toISOString(),
            },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/shared/:token/subscribe — Subscribe via share link
// ---------------------------------------------------------------------------
v1.post("/shared/:token/subscribe", ...requireUser([]), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const token = req.params.token;

        const shareToken = await prisma.shareToken.findUnique({
            where: { token },
            include: { plan: { select: { id: true, ownerId: true } } },
        });

        if (!shareToken || shareToken.revokedAt) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        if (shareToken.plan.ownerId === userId) {
            return next({ status: 409, expose: true, message: "cannot_subscribe_to_own_plan" });
        }

        try {
            await prisma.planSubscription.create({
                data: { planId: shareToken.plan.id, userId },
            });
        } catch (e: any) {
            if (e?.code === "P2002") {
                return next({ status: 409, expose: true, message: "already_subscribed" });
            }
            throw e;
        }

        res.status(201).json({ data: { status: "subscribed" } });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId/subscription — Unsubscribe from a plan
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId/subscription", ...requireUser([]), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const result = await prisma.planSubscription.deleteMany({
            where: { planId, userId },
        });

        if (result.count === 0) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// Put AFTER all routes (including the OpenAPI validator middleware)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err?.status || err?.statusCode || 500);

    if (status >= 500) {
        console.error("[api-error]", {
            method: req.method,
            path: req.originalUrl,
            status,
            message: err?.message,
            errors: err?.errors,
            stack: err?.stack,
        });
    }

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
                    : status === 403
                        ? "https://api.yellowbook.example.com/problems/forbidden"
                        : status === 404
                            ? "https://api.yellowbook.example.com/problems/not-found"
                            : status === 409
                                ? "https://api.yellowbook.example.com/problems/conflict"
                                : status === 412
                                    ? "https://api.yellowbook.example.com/problems/precondition-failed"
                                    : "https://api.yellowbook.example.com/problems/server-error",
        title:
            status === 400
                ? "Validation error"
                : status === 401
                    ? "Unauthorized"
                    : status === 403
                        ? "Forbidden"
                        : status === 404
                            ? "Not found"
                            : status === 409
                                ? "Conflict"
                                : status === 412
                                    ? "Precondition failed"
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
