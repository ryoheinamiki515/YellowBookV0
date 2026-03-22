import type { SocialPlan } from "../api/generated/model/socialPlan";
import { getDaysDiff } from "./planListDerivations";
import { fromPlan, formatBadge } from "./planWhen";
import { getSharedPeopleForDisplay } from "./sharedPeople";

export function formatWhenBadge(plan: SocialPlan): string | null {
    return formatBadge(fromPlan(plan));
}

export function participantNames(plan: SocialPlan): string | null {
    const names = getSharedPeopleForDisplay(plan, {
        excludeViewer: plan.role === "member",
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
