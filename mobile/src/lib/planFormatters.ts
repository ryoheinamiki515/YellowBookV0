import type { SocialPlan } from "../api/generated/model/socialPlan";
import { getDaysDiff } from "./planListDerivations";
import { getSharedPeopleForDisplay } from "./sharedPeople";

export function formatRelativeDate(iso: string | null | undefined): string | null {
    const diffDays = getDaysDiff(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6) {
        return `${Math.abs(diffDays)} days ago`;
    }

    const date = new Date(iso!);
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

export function formatWhenBadge(plan: SocialPlan): string | null {
    if (plan.timePrecision === "NONE") return "Whenever";
    if (plan.timePrecision === "UNSPECIFIED" || !plan.anchorStart) return null;

    const start = formatRelativeDate(plan.anchorStart);
    if (!start) return null;

    if (plan.timePrecision === "EXACT") {
        const date = new Date(plan.anchorStart);
        const timeStr = date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
        });
        return `${start}, ${timeStr}`;
    }

    if (plan.anchorEnd) {
        const endDate = new Date(plan.anchorEnd);
        const startDate = new Date(plan.anchorStart);
        if (
            startDate.getFullYear() === endDate.getFullYear() &&
            startDate.getMonth() === endDate.getMonth() &&
            startDate.getDate() === endDate.getDate()
        ) {
            return start;
        }

        const endStr = endDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
        return `${start} — ${endStr}`;
    }

    return start;
}

export function participantNames(plan: SocialPlan): string | null {
    const names = getSharedPeopleForDisplay(plan, {
        excludeViewer: plan.role === "subscriber",
    }).map((person) => person.displayName);

    if (names.length === 0) return null;
    if (names.length === 1) return `with ${names[0]}`;
    if (names.length === 2) return `with ${names[0]} & ${names[1]}`;
    return `with ${names[0]} & ${names.length - 1} others`;
}

export function planSubtitleText(
    plan: SocialPlan,
    options?: { allowNoteFallback?: boolean }
): string | null {
    const allowNoteFallback = options?.allowNoteFallback ?? true;
    const people = participantNames(plan);
    const location = plan.locationText?.trim();
    const note = notePreview(plan.contextNote);

    if (people && location) return `${people} • at ${location}`;
    if (people) return people;
    if (location) return `at ${location}`;
    if (allowNoteFallback && note) return `Note: ${note}`;
    return null;
}

export function notePreview(text: string | null | undefined, maxChars = 48): string | null {
    const normalized = text?.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function formatTimeOnly(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}

export function planLifecycleText(plan: SocialPlan): string | null {
    const relative = formatRelativePastLabel(plan.updatedAt);
    const relativeLabel = relative ?? "recently";

    if (plan.state === "DONE") return `Completed ${relativeLabel}`;
    if (plan.state === "DROPPED") return `Dropped ${relativeLabel}`;
    if (plan.state === "ARCHIVED") return `Archived ${relativeLabel}`;

    return null;
}

function formatRelativePastLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const diffDays = getDaysDiff(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "today";
    if (diffDays === -1) return "yesterday";
    if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)}d ago`;

    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}
