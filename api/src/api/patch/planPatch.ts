import { z } from "zod";

// Only fields you explicitly allow to be patched.
export const PlanPatchSchema = z.object({
    intentText: z.string().min(1).max(5000).optional(),
    contextNote: z.string().max(20000).nullable().optional(),
    locationText: z.string().max(5000).nullable().optional(),
    state: z.enum(["OPEN", "DONE", "DROPPED", "ARCHIVED"]).optional(),
    timePrecision: z.enum(["UNSPECIFIED", "NONE", "WINDOW", "EXACT"]).optional(),
    anchorStart: z.string().datetime().nullable().optional(),
    anchorEnd: z.string().datetime().nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
}).strict();

export type PlanPatch = z.infer<typeof PlanPatchSchema>;

export function validateTimeSemantics(final: {
    timePrecision: "UNSPECIFIED" | "NONE" | "WINDOW" | "EXACT";
    anchorStart: Date | null;
    anchorEnd: Date | null;
}) {
    if (final.timePrecision === "NONE" || final.timePrecision === "UNSPECIFIED") {
        if (final.anchorStart || final.anchorEnd) {
            throw Object.assign(new Error("Anchors must be null when timePrecision is NONE or UNSPECIFIED."), {
                status: 400,
                expose: true,
            });
        }
    }
    if (final.timePrecision === "EXACT" || final.timePrecision === "WINDOW") {
        if (!final.anchorStart) {
            throw Object.assign(new Error("anchorStart is required when timePrecision is EXACT or WINDOW."), {
                status: 400,
                expose: true,
            });
        }
    }
}

export function toPrismaUpdate(patch: PlanPatch) {
    const data: any = {};

    if ("intentText" in patch) data.intentText = patch.intentText;
    if ("contextNote" in patch) data.contextNote = patch.contextNote;
    if ("locationText" in patch) data.locationText = patch.locationText;
    if ("state" in patch) data.state = patch.state;
    if ("timePrecision" in patch) data.timePrecision = patch.timePrecision;

    if ("anchorStart" in patch && patch.anchorStart !== undefined)
        data.anchorStart = patch.anchorStart === null ? null : new Date(patch.anchorStart);
    if ("anchorEnd" in patch && patch.anchorEnd !== undefined)
        data.anchorEnd = patch.anchorEnd === null ? null : new Date(patch.anchorEnd);

    if ("timezone" in patch) data.timezone = patch.timezone;

    return data;
}
