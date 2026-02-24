import type { SocialPlan } from "../api/generated/model/socialPlan";

export type PlanAttentionReason =
    | "missing-people"
    | "missing-date"
    | "missing-people-and-date"
    | "past-due"
    | "stale-open";

export type PlanQuickActionKind =
    | "open"
    | "focus-people"
    | "focus-when"
    | "mark-done"
    | "let-go";

export type OpenPlanTimeSection = "Coming Up" | "This Week" | "Later" | "Someday";
export type OpenPlanSection = "Needs Attention" | OpenPlanTimeSection;

export type DerivedPlanListItem = {
    plan: SocialPlan;
    isHeroCandidate: boolean;
    attentionReason: PlanAttentionReason | null;
    quickActions: PlanQuickActionKind[];
    section: OpenPlanSection | null;
    sortKey: string;
};

export type PlanListSectionItem =
    | {
          type: "section-header";
          title: OpenPlanSection;
          key: string;
          count: number;
      }
    | {
          type: "plan";
          key: string;
          derived: DerivedPlanListItem;
      };

const STALE_OPEN_THRESHOLD_DAYS = 14;

const ATTENTION_REASON_ORDER: Record<PlanAttentionReason, number> = {
    "missing-people-and-date": 0,
    "past-due": 1,
    "missing-date": 2,
    "missing-people": 3,
    "stale-open": 4,
};

function toTimeMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const value = new Date(iso).getTime();
    return Number.isNaN(value) ? null : value;
}

function compareNullableNumberAsc(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
}

function compareNullableNumberDesc(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
}

function compareById(a: SocialPlan, b: SocialPlan): number {
    return a.id.localeCompare(b.id);
}

function compareByCreatedDesc(a: SocialPlan, b: SocialPlan): number {
    return (
        compareNullableNumberDesc(toTimeMs(a.createdAt), toTimeMs(b.createdAt)) ||
        compareById(a, b)
    );
}

function stableSort<T>(items: T[], compare: (a: T, b: T) => number): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
        .map((entry) => entry.item);
}

function getPlanDueAnchor(plan: SocialPlan): string | null | undefined {
    return plan.anchorEnd ?? plan.anchorStart;
}

function hasMissingPeople(plan: SocialPlan): boolean {
    return plan.participants.length === 0;
}

function hasMissingDate(plan: SocialPlan): boolean {
    return !plan.anchorStart && plan.timePrecision !== "NONE";
}

export function getDaysDiff(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    return Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isPastDueOpenPlan(plan: SocialPlan): boolean {
    if (plan.state !== "OPEN") return false;
    const dueIso = getPlanDueAnchor(plan);
    const diff = getDaysDiff(dueIso);
    return diff !== null && diff < 0;
}

export function isStaleOpenPlan(plan: SocialPlan): boolean {
    if (plan.state !== "OPEN") return false;
    const lacksAnchoredTime = !plan.anchorStart || plan.timePrecision === "UNSPECIFIED";
    if (!lacksAnchoredTime) return false;
    const diff = getDaysDiff(plan.updatedAt);
    return diff !== null && diff <= -STALE_OPEN_THRESHOLD_DAYS;
}

export function getAttentionReason(plan: SocialPlan): PlanAttentionReason | null {
    if (plan.state !== "OPEN") return null;

    const missingPeople = hasMissingPeople(plan);
    const missingDate = hasMissingDate(plan);

    if (missingPeople && missingDate) return "missing-people-and-date";
    if (isPastDueOpenPlan(plan)) return "past-due";
    if (missingDate) return "missing-date";
    if (missingPeople) return "missing-people";
    if (isStaleOpenPlan(plan)) return "stale-open";
    return null;
}

export function getOpenPlanTimeSection(plan: SocialPlan): OpenPlanTimeSection {
    const days = getDaysDiff(plan.anchorStart);

    if (days === null) return "Someday";
    if (days < 0) return "Later";
    if (days <= 1) return "Coming Up";
    if (days <= 7) return "This Week";
    return "Later";
}

function getQuickActionsForAttention(
    plan: SocialPlan,
    reason: PlanAttentionReason
): PlanQuickActionKind[] {
    switch (reason) {
        case "missing-people-and-date":
            return ["focus-people", "focus-when"];
        case "missing-date":
            return ["focus-when"];
        case "missing-people":
            return ["focus-people"];
        case "past-due":
            return ["focus-when", "let-go"];
        case "stale-open":
            return !plan.anchorStart || plan.timePrecision === "UNSPECIFIED"
                ? ["focus-when"]
                : ["open"];
        default:
            return [];
    }
}

function compareAttentionItems(
    a: DerivedPlanListItem,
    b: DerivedPlanListItem
): number {
    const aReason = a.attentionReason;
    const bReason = b.attentionReason;

    if (!aReason && !bReason) return 0;
    if (!aReason) return 1;
    if (!bReason) return -1;

    const reasonOrder = ATTENTION_REASON_ORDER[aReason] - ATTENTION_REASON_ORDER[bReason];
    if (reasonOrder !== 0) return reasonOrder;

    const aHasDate = Boolean(a.plan.anchorStart);
    const bHasDate = Boolean(b.plan.anchorStart);
    if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;

    if (aHasDate && bHasDate) {
        return (
            compareNullableNumberAsc(
                toTimeMs(a.plan.anchorStart),
                toTimeMs(b.plan.anchorStart)
            ) ||
            compareNullableNumberDesc(toTimeMs(a.plan.updatedAt), toTimeMs(b.plan.updatedAt)) ||
            compareByCreatedDesc(a.plan, b.plan)
        );
    }

    if (aReason === "stale-open") {
        return (
            compareNullableNumberAsc(toTimeMs(a.plan.updatedAt), toTimeMs(b.plan.updatedAt)) ||
            compareByCreatedDesc(a.plan, b.plan)
        );
    }

    return (
        compareNullableNumberDesc(toTimeMs(a.plan.updatedAt), toTimeMs(b.plan.updatedAt)) ||
        compareByCreatedDesc(a.plan, b.plan)
    );
}

function compareTimeSectionItems(
    section: OpenPlanTimeSection,
    a: DerivedPlanListItem,
    b: DerivedPlanListItem
): number {
    if (section === "Someday") {
        return (
            compareNullableNumberDesc(toTimeMs(a.plan.updatedAt), toTimeMs(b.plan.updatedAt)) ||
            compareByCreatedDesc(a.plan, b.plan)
        );
    }

    return (
        compareNullableNumberAsc(toTimeMs(a.plan.anchorStart), toTimeMs(b.plan.anchorStart)) ||
        compareNullableNumberDesc(toTimeMs(a.plan.updatedAt), toTimeMs(b.plan.updatedAt)) ||
        compareByCreatedDesc(a.plan, b.plan)
    );
}

function toDerivedPlanListItem(params: {
    plan: SocialPlan;
    attentionReason: PlanAttentionReason | null;
    section: OpenPlanSection | null;
    quickActions: PlanQuickActionKind[];
    isHeroCandidate?: boolean;
    sortKey: string;
}): DerivedPlanListItem {
    return {
        plan: params.plan,
        attentionReason: params.attentionReason,
        quickActions: params.quickActions,
        section: params.section,
        sortKey: params.sortKey,
        isHeroCandidate: params.isHeroCandidate ?? false,
    };
}

export function buildOpenPlanSections(plans: SocialPlan[]): PlanListSectionItem[] {
    const openPlans = plans.filter((plan) => plan.state === "OPEN");
    if (openPlans.length === 0) return [];

    const attentionItems: DerivedPlanListItem[] = [];
    const timeBuckets = new Map<OpenPlanTimeSection, DerivedPlanListItem[]>();
    const timeSections: OpenPlanTimeSection[] = ["Coming Up", "This Week", "Later", "Someday"];

    for (const section of timeSections) {
        timeBuckets.set(section, []);
    }

    for (const plan of openPlans) {
        const attentionReason = getAttentionReason(plan);

        if (attentionReason) {
            attentionItems.push(
                toDerivedPlanListItem({
                    plan,
                    attentionReason,
                    quickActions: getQuickActionsForAttention(plan, attentionReason),
                    section: "Needs Attention",
                    sortKey: `attention:${attentionReason}:${plan.id}`,
                })
            );
            continue;
        }

        const section = getOpenPlanTimeSection(plan);
        timeBuckets.get(section)!.push(
            toDerivedPlanListItem({
                plan,
                attentionReason: null,
                quickActions: [],
                section,
                sortKey: `time:${section}:${plan.id}`,
            })
        );
    }

    const sortedAttention = stableSort(attentionItems, compareAttentionItems);
    const sortedTimeBuckets = new Map<OpenPlanTimeSection, DerivedPlanListItem[]>();

    for (const section of timeSections) {
        const bucket = timeBuckets.get(section)!;
        sortedTimeBuckets.set(
            section,
            stableSort(bucket, (a, b) => compareTimeSectionItems(section, a, b))
        );
    }

    const orderedDerived: DerivedPlanListItem[] = [
        ...sortedAttention,
        ...timeSections.flatMap((section) => sortedTimeBuckets.get(section) ?? []),
    ].map((item, index) => ({
        ...item,
        isHeroCandidate: index === 0,
        sortKey: `${index.toString().padStart(3, "0")}:${item.sortKey}`,
    }));

    const heroPlanId = orderedDerived[0]?.plan.id;
    const byPlanId = new Map<string, DerivedPlanListItem>(
        orderedDerived.map((item) => [item.plan.id, item])
    );

    const hasAttention = sortedAttention.length > 0;
    const populatedTimeSections = timeSections.filter(
        (section) => (sortedTimeBuckets.get(section) ?? []).length > 0
    );
    const showHeaders = hasAttention || populatedTimeSections.length > 1;

    const result: PlanListSectionItem[] = [];

    if (sortedAttention.length > 0) {
        if (showHeaders) {
            result.push({
                type: "section-header",
                title: "Needs Attention",
                key: "header-Needs Attention",
                count: sortedAttention.length,
            });
        }
        for (const item of sortedAttention) {
            result.push({
                type: "plan",
                key: `plan-${item.plan.id}`,
                derived:
                    byPlanId.get(item.plan.id) ??
                    {
                        ...item,
                        isHeroCandidate: item.plan.id === heroPlanId,
                    },
            });
        }
    }

    for (const section of timeSections) {
        const bucket = sortedTimeBuckets.get(section) ?? [];
        if (bucket.length === 0) continue;

        if (showHeaders) {
            result.push({
                type: "section-header",
                title: section,
                key: `header-${section}`,
                count: bucket.length,
            });
        }

        for (const item of bucket) {
            result.push({
                type: "plan",
                key: `plan-${item.plan.id}`,
                derived:
                    byPlanId.get(item.plan.id) ??
                    {
                        ...item,
                        isHeroCandidate: item.plan.id === heroPlanId,
                    },
            });
        }
    }

    return result;
}

export function buildFilteredSectionItems(
    plans: SocialPlan[],
    filterLabel: string
): PlanListSectionItem[] {
    if (plans.length === 0) return [];

    if (filterLabel === "Open") {
        return buildOpenPlanSections(plans);
    }

    return plans.map((plan, index) => {
        const attentionReason = getAttentionReason(plan);
        return {
            type: "plan" as const,
            key: `plan-${plan.id}`,
            derived: toDerivedPlanListItem({
                plan,
                attentionReason,
                quickActions: [],
                section: null,
                sortKey: `raw:${index.toString().padStart(3, "0")}`,
            }),
        };
    });
}
