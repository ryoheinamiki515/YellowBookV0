import type { SocialPlan } from "../api/generated/model/socialPlan";
import type { SocialPlanTimePrecision } from "../api/generated/model/socialPlanTimePrecision";

// ---------------------------------------------------------------------------
// PlanWhen — discriminated union modelling user intent for "when"
// ---------------------------------------------------------------------------

export type PlanWhenUnspecified = { kind: "unspecified" };
export type PlanWhenWhenever = { kind: "whenever" };
export type PlanWhenDay = { kind: "day"; date: string; timezone: string | null };
export type PlanWhenWindow = { kind: "window"; start: string; end: string; timezone: string | null };
export type PlanWhenExactTime = { kind: "exactTime"; datetime: string; timezone: string | null };

export type PlanWhen =
    | PlanWhenUnspecified
    | PlanWhenWhenever
    | PlanWhenDay
    | PlanWhenWindow
    | PlanWhenExactTime;

// ---------------------------------------------------------------------------
// Storage fields — the wire/DB representation
// ---------------------------------------------------------------------------

export type PlanWhenStorageFields = {
    timePrecision: SocialPlanTimePrecision;
    anchorStart: string | null;
    anchorEnd: string | null;
    timezone: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function fromStorageFields(fields: PlanWhenStorageFields): PlanWhen {
    switch (fields.timePrecision) {
        case "UNSPECIFIED":
            return { kind: "unspecified" };
        case "NONE":
            return { kind: "whenever" };
        case "WINDOW":
            if (!fields.anchorStart) return { kind: "whenever" };
            if (fields.anchorEnd) {
                return { kind: "window", start: fields.anchorStart, end: fields.anchorEnd, timezone: fields.timezone ?? null };
            }
            return { kind: "day", date: fields.anchorStart, timezone: fields.timezone ?? null };
        case "EXACT":
            if (!fields.anchorStart) return { kind: "whenever" };
            return { kind: "exactTime", datetime: fields.anchorStart, timezone: fields.timezone ?? null };
        default:
            return { kind: "unspecified" };
    }
}

export function toStorageFields(when: PlanWhen): PlanWhenStorageFields {
    switch (when.kind) {
        case "unspecified":
            return { timePrecision: "UNSPECIFIED", anchorStart: null, anchorEnd: null, timezone: null };
        case "whenever":
            return { timePrecision: "NONE", anchorStart: null, anchorEnd: null, timezone: null };
        case "day":
            return { timePrecision: "WINDOW", anchorStart: when.date, anchorEnd: null, timezone: when.timezone };
        case "window":
            return { timePrecision: "WINDOW", anchorStart: when.start, anchorEnd: when.end, timezone: when.timezone };
        case "exactTime":
            return { timePrecision: "EXACT", anchorStart: when.datetime, anchorEnd: null, timezone: when.timezone };
    }
}

export function fromPlan(plan: Pick<SocialPlan, "timePrecision" | "anchorStart" | "anchorEnd" | "timezone">): PlanWhen {
    return fromStorageFields({
        timePrecision: plan.timePrecision,
        anchorStart: plan.anchorStart ?? null,
        anchorEnd: plan.anchorEnd ?? null,
        timezone: plan.timezone ?? null,
    });
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export function isDefined(when: PlanWhen): boolean {
    return when.kind === "day" || when.kind === "window" || when.kind === "exactTime";
}

export function getDueAnchor(when: PlanWhen): string | null {
    switch (when.kind) {
        case "window": return when.end;
        case "day": return when.date;
        case "exactTime": return when.datetime;
        default: return null;
    }
}

export function getStartAnchor(when: PlanWhen): string | null {
    switch (when.kind) {
        case "day": return when.date;
        case "window": return when.start;
        case "exactTime": return when.datetime;
        default: return null;
    }
}

export function getDateKey(when: PlanWhen): string | null {
    const iso = getStartAnchor(when);
    if (!iso) return null;
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function isBeforeToday(when: PlanWhen): boolean {
    const anchor = getDueAnchor(when);
    if (!anchor) return false;
    const diff = getDaysDiffFromIso(anchor);
    return diff !== null && diff < 0;
}

export type OpenPlanTimeSection = "Coming Up" | "This Week" | "Later" | "Someday";

export function getTimeSection(when: PlanWhen): OpenPlanTimeSection {
    const iso = getStartAnchor(when);
    const days = getDaysDiffFromIso(iso);

    if (days === null) return "Someday";
    if (days < 0) return "Later";
    if (days <= 1) return "Coming Up";
    if (days <= 7) return "This Week";
    return "Later";
}

// ---------------------------------------------------------------------------
// Display / formatting
// ---------------------------------------------------------------------------

export type WhenBadgeTone = "today" | "tomorrow" | "soon" | "pastDue" | "neutral";

export function getBadgeTone(when: PlanWhen): WhenBadgeTone {
    const iso = getStartAnchor(when);
    const days = getDaysDiffFromIso(iso);
    if (days === null) return "neutral";
    if (days < 0) return "pastDue";
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days <= 7) return "soon";
    return "neutral";
}

export function formatBadge(when: PlanWhen): string | null {
    switch (when.kind) {
        case "unspecified":
            return null;
        case "whenever":
            return "Whenever";
        case "day": {
            return formatRelativeDateStr(when.date);
        }
        case "exactTime": {
            const rel = formatRelativeDateStr(when.datetime);
            if (!rel) return null;
            const timeStr = formatTimeStr(when.datetime);
            return `${rel}, ${timeStr}`;
        }
        case "window": {
            const rel = formatRelativeDateStr(when.start);
            if (!rel) return null;
            const startDate = new Date(when.start);
            const endDate = new Date(when.end);
            if (
                startDate.getFullYear() === endDate.getFullYear() &&
                startDate.getMonth() === endDate.getMonth() &&
                startDate.getDate() === endDate.getDate()
            ) {
                return rel;
            }
            const endStr = endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return `${rel} — ${endStr}`;
        }
    }
}

export function formatDisplay(when: PlanWhen): { primary: string | null; secondary: string | null } {
    switch (when.kind) {
        case "unspecified":
            return { primary: null, secondary: null };
        case "whenever":
            return { primary: "Whenever works", secondary: null };
        case "day": {
            const relative = formatRelativeDateStr(when.date);
            const full = formatFullDateStr(when.date);
            return { primary: relative, secondary: full };
        }
        case "exactTime": {
            const relative = formatRelativeDateStr(when.datetime);
            const full = formatFullDateStr(when.datetime);
            const timeStr = formatTimeStr(when.datetime);
            return {
                primary: relative ? `${relative} at ${timeStr}` : timeStr,
                secondary: full,
            };
        }
        case "window": {
            const relative = formatRelativeDateStr(when.start);
            const full = formatFullDateStr(when.start);
            const endFull = formatFullDateStr(when.end);
            return {
                primary: relative,
                secondary: full && endFull ? `${full} - ${endFull}` : full,
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function getDaysDiffFromIso(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    return Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDateStr(iso: string | null | undefined): string | null {
    const diffDays = getDaysDiffFromIso(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)} days ago`;

    const date = new Date(iso!);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFullDateStr(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function formatTimeStr(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}
