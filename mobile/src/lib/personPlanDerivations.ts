import type { SocialPlan } from "../api/generated/model/socialPlan";
import { buildOpenPlanSections } from "./planListDerivations";

function toTimeMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const value = new Date(iso).getTime();
    return Number.isNaN(value) ? null : value;
}

function compareNullableNumberDesc(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
}

function compareHistoryPlans(a: SocialPlan, b: SocialPlan): number {
    return (
        compareNullableNumberDesc(toTimeMs(a.updatedAt), toTimeMs(b.updatedAt)) ||
        compareNullableNumberDesc(toTimeMs(a.createdAt), toTimeMs(b.createdAt)) ||
        a.id.localeCompare(b.id)
    );
}

export function buildPersonEventSections(plans: SocialPlan[]): {
    upcoming: SocialPlan[];
    history: SocialPlan[];
} {
    const openPlans = plans.filter((plan) => plan.state === "OPEN");
    const upcoming = buildOpenPlanSections(openPlans).flatMap((item) =>
        item.type === "plan" ? [item.derived.plan] : []
    );

    const history = plans
        .filter((plan) => plan.state !== "OPEN")
        .sort(compareHistoryPlans);

    return { upcoming, history };
}
