import "dotenv/config";
import path from "node:path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { middleware as openapiValidator } from "express-openapi-validator";
import {
    buildSharedPeople,
    serializeSocialPlan,
    serializeSubscribedPlan,
} from "./api/serializers/socialPlan.js";
import { serializePlanActivity } from "./api/serializers/planActivity.js";
import { serializeBirthday, serializePerson, linkedUserProfileSelect } from "./api/serializers/person.js";
import { serializeConnection } from "./api/serializers/connection.js";
import { makeRequireUser } from "./middleware/requireUser.js";
import { planEtag, representationEtag, ifMatchFailed } from "./api/etag.js";
import { makeWithIdempotency } from "./api/idempotency.js";
import { decodeCursor, encodeCursor } from "./api/pagination/planCursor.js";
import { decodeDisplayNameCursor, encodeDisplayNameCursor } from "./api/pagination/planCursor.js";
import { PlanPatchSchema, toPrismaUpdate, validateTimeSemantics } from "./api/patch/planPatch.js";
import { generateToken } from "./api/tokens.js";
import { mergePeople } from "./personMerge.js";
import { linkOrCreateLinkedPerson } from "./personLinking.js";
import { nullIfBlank, requireDisplayName } from "./api/displayName.js";
import { acceptConnectionInvite } from "./services/connectionInvite.js";
import { createProfileImageUploadUrl, deleteProfileImage } from "./r2.js";
import { sendPushToUsers } from "./services/pushNotifications.js";
import {
    getPlanView,
    assertPlanPermission,
    updateMembership,
    loadConnectionMapForUser,
} from "./services/planView.js";

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

// ---------------------------------------------------------------------------
// Universal Links (iOS) & App Links (Android)
// Served before the OpenAPI validator so they are not rejected.
// ---------------------------------------------------------------------------
const IOS_BUNDLE_ID = "dev.yellowbook.mobile";
const ANDROID_PACKAGE = "dev.yellowbook.mobile";

app.get("/.well-known/apple-app-site-association", (_req, res) => {
    const teamId = process.env.APPLE_TEAM_ID;
    if (!teamId) {
        res.status(503).json({ error: "APPLE_TEAM_ID not configured" });
        return;
    }
    res.setHeader("Content-Type", "application/json");
    res.json({
        applinks: {
            apps: [],
            details: [
                {
                    appID: `${teamId}.${IOS_BUNDLE_ID}`,
                    paths: ["/share/*", "/invite/*"],
                },
            ],
        },
    });
});

app.get("/.well-known/assetlinks.json", (_req, res) => {
    const sha256 = process.env.ANDROID_SHA256_CERT_FINGERPRINT;
    if (!sha256) {
        res.status(503).json({ error: "ANDROID_SHA256_CERT_FINGERPRINT not configured" });
        return;
    }
    res.setHeader("Content-Type", "application/json");
    res.json([
        {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app",
                package_name: ANDROID_PACKAGE,
                sha256_cert_fingerprints: [sha256],
            },
        },
    ]);
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
const APP_BASE_URL = process.env.APP_BASE_URL || "https://yellowbookv0-production.up.railway.app";

const v1 = express.Router();
app.use("/v1", v1);

v1.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Me helpers
// ---------------------------------------------------------------------------
function serializeMe(user: { id: string; displayName: string | null; birthdayMonth: number | null; birthdayDay: number | null; birthdayYear: number | null; profileImageUrl: string | null }, authSubject: string) {
    return {
        id: user.id,
        authSubject,
        displayName: user.displayName,
        birthday: serializeBirthday(user),
        profileImageUrl: user.profileImageUrl ?? null,
    };
}

// ---------------------------------------------------------------------------
// GET /v1/me — Get the current authenticated user (MeResponse)
// ---------------------------------------------------------------------------
v1.get("/me", ...requireUser(), async (req, res, next) => {
    try {
        const id = (req as any).userId as string;
        const authSubject = (req as any).authSubject as string;

        const user = await prisma.user.findUniqueOrThrow({ where: { id } });

        res.json({ data: serializeMe(user, authSubject) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/me — Update the current user's profile
// ---------------------------------------------------------------------------
v1.patch("/me", ...requireUser(), async (req, res, next) => {
    try {
        const id = (req as any).userId as string;
        const authSubject = (req as any).authSubject as string;
        const parsed = PatchMeSchema.parse(req.body);

        const updateData: Record<string, unknown> = {};

        if (parsed.displayName !== undefined) {
            updateData.displayName = requireDisplayName(parsed.displayName);
        }

        if (parsed.birthday !== undefined) {
            if (parsed.birthday) {
                updateData.birthdayMonth = parsed.birthday.month;
                updateData.birthdayDay = parsed.birthday.day;
                updateData.birthdayYear = parsed.birthday.year ?? null;
            } else {
                updateData.birthdayMonth = null;
                updateData.birthdayDay = null;
                updateData.birthdayYear = null;
            }
        }

        if (parsed.profileImageUrl !== undefined) {
            updateData.profileImageUrl = parsed.profileImageUrl;
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        res.json({
            data: serializeMe(user, authSubject),
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/me/profile-image-upload — Get a presigned URL to upload a profile image
// ---------------------------------------------------------------------------
v1.post("/me/profile-image-upload", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const { uploadUrl, publicUrl } = await createProfileImageUploadUrl(userId);
        res.json({ data: { uploadUrl, publicUrl } });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/me/profile-image — Remove the current user's profile image
// ---------------------------------------------------------------------------
v1.delete("/me/profile-image", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        await deleteProfileImage(userId);
        await prisma.user.update({
            where: { id: userId },
            data: { profileImageUrl: null },
        });
        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

const RegisterPushTokenSchema = z.object({
    token: z.string().min(1).max(255),
    platform: z.enum(["ios", "android"]),
});

// ---------------------------------------------------------------------------
// POST /v1/me/push-tokens — Register this device's push token for the current user
// ---------------------------------------------------------------------------
v1.post("/me/push-tokens", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const { token, platform } = RegisterPushTokenSchema.parse(req.body);

        // Re-registering the same device (token) re-associates it to the current
        // user — important on a shared device after a sign-out / sign-in.
        await prisma.pushToken.upsert({
            where: { token },
            create: { token, platform, userId },
            update: { platform, userId },
        });

        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/me/push-tokens/:token — Unregister a device's push token (on sign-out)
// ---------------------------------------------------------------------------
v1.delete("/me/push-tokens/:token", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        // deleteMany (scoped to the caller) is idempotent — no 404 if already gone.
        await prisma.pushToken.deleteMany({
            where: { token: req.params.token, userId },
        });
        res.status(204).end();
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
        if (data.timePrecision === "NONE" || data.timePrecision === "UNSPECIFIED") {
            if (data.anchorStart !== null || data.anchorEnd !== null) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `anchorStart and anchorEnd must be null when timePrecision is ${data.timePrecision}`,
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

const MergePersonSchema = z.object({
    sourcePersonId: z.string().uuid(),
});

const PatchMeSchema = z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    birthday: PersonBirthdaySchema.nullable().optional(),
    profileImageUrl: z.string().url().max(2048).nullable().optional(),
}).refine(
    (data) => data.displayName !== undefined || data.birthday !== undefined || data.profileImageUrl !== undefined,
    { message: "at_least_one_field_required" }
);

function toJsonSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// loadConnectionMapForUser moved to services/planView.ts

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
        timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).default("NONE"),
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
    ...requireUser(),
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
                    memberships: {
                        create: { userId: ownerId, role: "OWNER", response: "ACCEPTED" },
                    },
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
    ...requireUser(),
    async (req, res, next) => {
        try {
            const userId = (req as any).userId as string;
            const scope = (typeof req.query.scope === "string" ? req.query.scope : "owned") as "owned" | "subscribed" | "all";
            const markedDone = req.query.markedDone === "true";
            const participantPersonId =
                typeof req.query.participantPersonId === "string"
                    ? req.query.participantPersonId
                    : undefined;
            const stateParams = Array.isArray(req.query.state)
                ? req.query.state
                : typeof req.query.state === "string"
                  ? [req.query.state]
                  : [];
            const planStates = stateParams.filter(
                (
                    state
                ): state is "OPEN" | "DONE" | "DROPPED" | "ARCHIVED" =>
                    state === "OPEN" ||
                    state === "DONE" ||
                    state === "DROPPED" ||
                    state === "ARCHIVED"
            );

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
            const stateFilter =
                planStates.length > 0
                    ? { state: { in: planStates } }
                    : {};
            const participantPerson = participantPersonId
                ? await prisma.person.findFirst({
                    where: { id: participantPersonId, ownerId: userId },
                    select: { id: true, linkedUserId: true },
                })
                : null;
            const participantFilter =
                participantPersonId == null
                    ? {}
                    : participantPerson
                      ? {
                          OR: [
                              { participants: { some: { personId: participantPerson.id } } },
                              ...(participantPerson.linkedUserId
                                  ? [
                                      { ownerId: participantPerson.linkedUserId },
                                      {
                                          participants: {
                                              some: {
                                                  person: {
                                                      is: { linkedUserId: participantPerson.linkedUserId },
                                                  },
                                              },
                                          },
                                      },
                                  ]
                                  : []),
                          ],
                        }
                      : { id: { in: [] as string[] } };

            const roleFilter =
                scope === "owned"
                    ? { role: "OWNER" as const }
                    : scope === "subscribed"
                      ? { role: "MEMBER" as const }
                      : {};

            const membershipFilter = {
                memberships: { some: { userId, ...roleFilter } },
            };

            // markedDone=true: fetch only plans the viewer personally marked done
            // (inverts the default filter that hides them)
            const viewerDoneFilter = markedDone
                ? { memberships: { some: { userId, markedDoneAt: { not: null } } } }
                : planStates.includes("DONE")
                  ? {}
                  : { memberships: { some: { userId, markedDoneAt: null } } };

            const rows = await prisma.socialPlan.findMany({
                where: {
                    ...membershipFilter,
                    ...cursorFilter,
                    ...stateFilter,
                    ...participantFilter,
                    ...viewerDoneFilter,
                },
                orderBy,
                take: limit + 1,
                include: {
                    owner: { select: { displayName: true, profileImageUrl: true } },
                    memberships: {
                        where: { userId },
                        take: 1,
                    },
                    participants: {
                        include: {
                            person: {
                                select: {
                                    linkedUserId: true,
                                    displayName: true,
                                    linkedUser: { select: { profileImageUrl: true } },
                                },
                            },
                        },
                    },
                },
            });

            const hasNext = rows.length > limit;
            const pageItems = hasNext ? rows.slice(0, limit) : rows;

            let nextCursor: string | null = null;
            if (hasNext && pageItems.length > 0) {
                const last = pageItems[pageItems.length - 1]!;
                nextCursor = encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id });
            }

            const connectionMap = await loadConnectionMapForUser(prisma, userId);

            const serialized = pageItems.map((row) => {
                const membership = row.memberships[0]!;
                const role = membership.role === "OWNER" ? "owner" as const : "member" as const;
                const context = membership.role === "OWNER"
                    ? { role: "owner" as const }
                    : { role: "member" as const, connectionMap, viewerUserId: userId };
                return {
                    ...serializeSocialPlan(row, context),
                    role,
                    membership: {
                        role,
                        response: membership.response,
                        privateNote: membership.privateNote,
                        markedDoneAt: membership.markedDoneAt?.toISOString() ?? null,
                    },
                };
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
v1.get("/plans/:planId", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const view = await getPlanView(prisma, userId, planId);
        if (!view) return next({ status: 404, expose: true, message: "not_found" });

        const payload = toJsonSafe({
            data: {
                ...view.plan,
                role: view.membership.role,
                membership: view.membership,
                permissions: view.permissions,
            },
        });

        res.setHeader("ETag", representationEtag(payload));
        res.setHeader("Cache-Control", "no-cache");
        res.json(payload);
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/plans/:planId — Update a social plan (JSON Merge Patch)
// ---------------------------------------------------------------------------
v1.patch("/plans/:planId", ...requireUser(), async (req: any, res, next) => {
    try {
        const userId = req.userId as string;
        const planId = req.params.planId;

        await assertPlanPermission(prisma, userId, planId, "canEdit");

        const current = await prisma.socialPlan.findFirst({ where: { id: planId, ownerId: userId } });
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
v1.delete("/plans/:planId", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId as string;

        await assertPlanPermission(prisma, userId, planId, "canDelete");

        await prisma.socialPlan.delete({ where: { id: planId } });

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
    ...requireUser(),
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

v1.patch("/plans/:planId/participants/:participantId", ...requireUser(), async (req, res, next) => {
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
v1.delete("/plans/:planId/participants/:participantId", ...requireUser(), async (req, res, next) => {
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
v1.get("/people", ...requireUser(), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;

        const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
        const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
        const qRaw = typeof req.query.q === "string" ? req.query.q : undefined;
        const q = qRaw?.trim();

        if (qRaw !== undefined && !q) {
            return next({ status: 400, expose: true, message: "q must not be blank" });
        }

        let cursor: { displayName: string; id: string } | null = null;
        if (cursorStr) {
            try {
                cursor = decodeDisplayNameCursor(cursorStr);
            } catch (_e) {
                return next({ status: 400, expose: true, message: "invalid_cursor" });
            }
        }

        const where: Prisma.PersonWhereInput = {
            ownerId,
            ...(q
                ? { displayName: { contains: q, mode: "insensitive" } }
                : {}),
            ...(cursor
                ? {
                    OR: [
                        { displayName: { gt: cursor.displayName } },
                        { displayName: cursor.displayName, id: { gt: cursor.id } },
                    ],
                }
                : {}),
        };

        const rows = await prisma.person.findMany({
            where,
            include: { linkedUser: { select: linkedUserProfileSelect } },
            orderBy: [{ displayName: "asc" }, { id: "asc" }],
            take: limit + 1,
        });

        const hasNext = rows.length > limit;
        const pageRows = hasNext ? rows.slice(0, limit) : rows;

        let nextCursor: string | null = null;
        if (hasNext) {
            const lastRow = pageRows[pageRows.length - 1];
            if (lastRow) {
                nextCursor = encodeDisplayNameCursor({
                    displayName: lastRow.displayName,
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
    ...requireUser(),
    withIdempotency("POST /v1/people", async (req, res, next) => {
        try {
            const ownerId = (req as any).userId as string;
            const input = CreatePersonSchema.parse(req.body);

            const person = await prisma.person.create({
                data: toPersonCreateData(ownerId, input),
                include: { linkedUser: { select: linkedUserProfileSelect } },
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
v1.get("/people/:personId", ...requireUser(), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personId = req.params.personId;

        const person = await prisma.person.findFirst({
            where: { id: personId, ownerId },
            include: { linkedUser: { select: linkedUserProfileSelect } },
        });
        if (!person) return next({ status: 404, expose: true, message: "not_found" });

        res.json({ data: serializePerson(person) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/people/:personId — Update a person (JSON Merge Patch)
// ---------------------------------------------------------------------------
v1.patch("/people/:personId", ...requireUser(), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personId = req.params.personId;

        const current = await prisma.person.findFirst({
            where: { id: personId, ownerId },
            include: { linkedUser: { select: linkedUserProfileSelect } },
        });
        if (!current) return next({ status: 404, expose: true, message: "not_found" });

        const patch = PatchPersonSchema.parse(req.body);
        const data = toPersonPatchData(patch);

        if (Object.keys(data).length === 0) {
            return res.json({ data: serializePerson(current) });
        }

        const updated = await prisma.person.update({
            where: { id: current.id },
            data,
            include: { linkedUser: { select: linkedUserProfileSelect } },
        });

        res.json({ data: serializePerson(updated) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/people/:personId/merge — Merge another person into this person
// ---------------------------------------------------------------------------
v1.post("/people/:personId/merge", ...requireUser(), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const personToKeepId = req.params.personId;
        const { sourcePersonId } = MergePersonSchema.parse(req.body);

        const merged = await prisma.$transaction((tx) =>
            mergePeople({
                tx,
                ownerId,
                personToKeepId,
                personToMergeId: sourcePersonId,
            })
        );

        const mergedPerson = await prisma.person.findUniqueOrThrow({
            where: { id: merged.id },
            include: { linkedUser: { select: linkedUserProfileSelect } },
        });

        res.json({ data: serializePerson(mergedPerson) });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/people/:personId — Delete a person
// ---------------------------------------------------------------------------
v1.delete("/people/:personId", ...requireUser(), async (req, res, next) => {
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

// ---------------------------------------------------------------------------
// POST /v1/connections/invites — Generate a connection invite
// ---------------------------------------------------------------------------
v1.post("/connections/invites", ...requireUser(), async (req, res, next) => {
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
v1.post("/connections/invites/:token/accept", ...requireUser(), async (req, res, next) => {
    try {
        const acceptorId = (req as any).userId as string;
        const token = req.params.token;

        const result = await acceptConnectionInvite(prisma, { acceptorId, token });

        res.json({ data: result });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// GET /v1/connections — List connections
// ---------------------------------------------------------------------------
v1.get("/connections", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;

        const connections = await prisma.connection.findMany({
            where: { userId },
            include: { target: { select: { id: true, displayName: true, profileImageUrl: true } } },
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
v1.delete("/connections/:connectionId", ...requireUser(), async (req, res, next) => {
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
v1.post("/plans/:planId/share", ...requireUser(), async (req, res, next) => {
    try {
        const ownerId = (req as any).userId as string;
        const planId = req.params.planId;

        await assertPlanPermission(prisma, ownerId, planId, "canShare");

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

        // Create PlanMembership for each connected participant
        const linkedUserIds = plan.participants
            .map((p) => p.person?.linkedUserId)
            .filter((id): id is string => id != null && id !== ownerId);

        const subscribedUserIds: string[] = [];
        const newlyAddedUserIds: string[] = [];
        for (const linkedUserId of linkedUserIds) {
            try {
                await prisma.planMembership.create({
                    data: { planId, userId: linkedUserId, role: "MEMBER", response: "PENDING" },
                });
                subscribedUserIds.push(linkedUserId);
                newlyAddedUserIds.push(linkedUserId);
            } catch (e: any) {
                if (e?.code !== "P2002") throw e;
                // Already a member — re-sharing shouldn't re-notify.
                subscribedUserIds.push(linkedUserId);
            }
        }

        if (newlyAddedUserIds.length > 0) {
            const owner = await prisma.user.findUnique({
                where: { id: ownerId },
                select: { displayName: true },
            });
            const sharerName = owner?.displayName?.trim() || "Someone";
            void sendPushToUsers(prisma, newlyAddedUserIds, {
                title: `${sharerName} shared a plan`,
                body: plan.intentText,
                data: { type: "plan_shared", planId },
            });
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
v1.get("/plans/:planId/share", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        await assertPlanPermission(prisma, userId, planId, "canShare");

        const shareToken = await prisma.shareToken.findFirst({
            where: { planId, revokedAt: null },
        });

        const members = await prisma.planMembership.findMany({
            where: { planId, role: "MEMBER" },
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
                subscribers: members.map((m) => ({
                    userId: m.user.id,
                    displayName: m.user.displayName,
                    subscribedAt: m.createdAt.toISOString(),
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
v1.delete("/plans/:planId/share", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        await assertPlanPermission(prisma, userId, planId, "canShare");

        await prisma.$transaction(async (tx) => {
            await tx.shareToken.updateMany({
                where: { planId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await tx.planMembership.deleteMany({ where: { planId, role: "MEMBER" } });
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
                        participants: {
                            include: {
                                person: {
                                    select: {
                                        linkedUserId: true,
                                        displayName: true,
                                        linkedUser: { select: { profileImageUrl: true } },
                                    },
                                },
                            },
                        },
                        owner: { select: { displayName: true, profileImageUrl: true } },
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
                    displayName: p.displayName ?? null,
                    createdAt: p.createdAt.toISOString(),
                })),
                sharedPeople: buildSharedPeople({
                    ownerId: plan.ownerId,
                    ownerDisplayName: plan.owner.displayName,
                    ownerProfileImageUrl: plan.owner.profileImageUrl,
                    participants: plan.participants,
                }),
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
v1.post("/shared/:token/subscribe", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const token = req.params.token;

        const shareToken = await prisma.shareToken.findUnique({
            where: { token },
            include: {
                plan: {
                    select: {
                        id: true,
                        ownerId: true,
                        owner: { select: { displayName: true } },
                    },
                },
            },
        });

        if (!shareToken || shareToken.revokedAt) {
            return next({ status: 404, expose: true, message: "not_found" });
        }

        if (shareToken.plan.ownerId === userId) {
            return next({ status: 409, expose: true, message: "cannot_subscribe_to_own_plan" });
        }

        const ownerDisplayName = requireDisplayName(shareToken.plan.owner.displayName);
        let alreadySubscribed = false;

        await prisma.$transaction(async (tx) => {
            await linkOrCreateLinkedPerson(tx, {
                ownerId: userId,
                linkedUserId: shareToken.plan.ownerId,
                displayName: ownerDisplayName,
            });

            try {
                await tx.planMembership.create({
                    data: { planId: shareToken.plan.id, userId, role: "MEMBER", response: "PENDING" },
                });
            } catch (e: any) {
                if (e?.code === "P2002") {
                    alreadySubscribed = true;
                    return;
                }
                throw e;
            }
        });

        if (alreadySubscribed) {
            return next({ status: 409, expose: true, message: "already_subscribed" });
        }

        res.status(201).json({ data: { status: "subscribed" } });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId/subscription — Unsubscribe from a plan
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId/subscription", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const result = await prisma.planMembership.deleteMany({
            where: { planId, userId, role: "MEMBER" },
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
// PATCH /v1/plans/:planId/membership — Update own membership (response, privateNote, markedDoneAt)
// ---------------------------------------------------------------------------
const MembershipPatchSchema = z.object({
    response: z.enum(["PENDING", "ACCEPTED", "DECLINED", "MAYBE"]).optional(),
    privateNote: z.string().max(20000).nullable().optional(),
    markedDoneAt: z.string().datetime().nullable().optional(),
});

v1.patch("/plans/:planId/membership", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const patch = MembershipPatchSchema.parse(req.body);

        const updateData: Parameters<typeof updateMembership>[3] = {};
        if (patch.response !== undefined) updateData.response = patch.response as any;
        if (patch.privateNote !== undefined) updateData.privateNote = patch.privateNote;
        if (patch.markedDoneAt !== undefined) {
            updateData.markedDoneAt = patch.markedDoneAt === null ? null : new Date(patch.markedDoneAt);
        }

        const membershipView = await updateMembership(prisma, userId, planId, updateData);

        res.json({ data: { membership: membershipView } });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/plans/:planId/membership — Leave a plan (alias for unsubscribe)
// ---------------------------------------------------------------------------
v1.delete("/plans/:planId/membership", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const result = await prisma.planMembership.deleteMany({
            where: { planId, userId, role: "MEMBER" },
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
// GET /v1/plans/:planId/activity — Activity feed (discussion, events)
// ---------------------------------------------------------------------------
v1.get("/plans/:planId/activity", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const membership = await prisma.planMembership.findUnique({
            where: { planId_userId: { planId, userId } },
        });
        if (!membership) return next({ status: 404, expose: true, message: "not_found" });

        const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
        const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

        let cursorFilter = {};
        if (cursorStr) {
            try {
                const decoded = Buffer.from(cursorStr, "base64url").toString("utf8");
                const { createdAt, id } = JSON.parse(decoded);
                cursorFilter = {
                    OR: [
                        { createdAt: { gt: new Date(createdAt) } },
                        { createdAt: new Date(createdAt), id: { gt: id } },
                    ],
                };
            } catch {
                return next({ status: 400, expose: true, message: "invalid_cursor" });
            }
        }

        const activities = await prisma.planActivity.findMany({
            where: { planId, ...cursorFilter },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: limit + 1,
            include: { actor: { select: { displayName: true } } },
        });

        const hasNext = activities.length > limit;
        const pageItems = hasNext ? activities.slice(0, limit) : activities;

        let nextCursor: string | null = null;
        if (hasNext && pageItems.length > 0) {
            const last = pageItems[pageItems.length - 1]!;
            nextCursor = Buffer.from(
                JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })
            ).toString("base64url");
        }

        const connectionMap = await loadConnectionMapForUser(prisma, userId);

        res.json({
            data: pageItems.map((a) => serializePlanActivity(a, connectionMap, userId)),
            page: { limit, nextCursor },
        });
    } catch (e) {
        next(e);
    }
});

// ---------------------------------------------------------------------------
// POST /v1/plans/:planId/activity — Post a discussion message
// ---------------------------------------------------------------------------
const PostActivitySchema = z.object({
    body: z.string().min(1).max(20000),
});

v1.post("/plans/:planId/activity", ...requireUser(), async (req, res, next) => {
    try {
        const userId = (req as any).userId as string;
        const planId = req.params.planId;

        const membership = await prisma.planMembership.findUnique({
            where: { planId_userId: { planId, userId } },
        });
        if (!membership) return next({ status: 404, expose: true, message: "not_found" });

        const data = PostActivitySchema.parse(req.body);

        const activity = await prisma.planActivity.create({
            data: {
                planId,
                actorId: userId,
                kind: "MESSAGE",
                body: data.body,
            },
            include: { actor: { select: { displayName: true } } },
        });

        const connectionMap = await loadConnectionMapForUser(prisma, userId);

        res.status(201).json({
            data: serializePlanActivity(activity, connectionMap, userId),
        });
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
