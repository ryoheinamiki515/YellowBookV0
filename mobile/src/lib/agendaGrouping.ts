import type { SocialPlan } from "../api/generated/model/socialPlan";
import {
    getAttentionReason,
    getQuickActionsForAttention,
    isPastDueOpenPlan,
    type PlanAttentionReason,
    type PlanQuickActionKind,
} from "./planListDerivations";
import { fromPlan, getDateKey } from "./planWhen";

export type AgendaPlanRowData = {
    plan: SocialPlan;
    attentionReason: PlanAttentionReason | null;
    quickActions: PlanQuickActionKind[];
    isShared: boolean;
};

export type AgendaSection = {
    dayKey: string;
    label: string;
    isToday: boolean;
    hasConflict: boolean;
    data: AgendaPlanRowData[];
};

function getCalendarDateKey(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getTodayKey(): string {
    return getCalendarDateKey(new Date().toISOString());
}

function getDayLabel(dateKey: string, today: Date): string {
    const [y, m, d] = dateKey.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = target.getTime() - todayStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    if (diffDays >= 2 && diffDays <= 6) {
        return target.toLocaleDateString(undefined, { weekday: "long" });
    }

    return target.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function getPlanDateKey(plan: SocialPlan): string | null {
    return getDateKey(fromPlan(plan));
}

function toRowData(plan: SocialPlan, isShared: boolean): AgendaPlanRowData {
    const attentionReason = plan.state === "OPEN" ? getAttentionReason(plan) : null;
    const quickActions = attentionReason
        ? getQuickActionsForAttention(plan, attentionReason)
        : [];
    return { plan, attentionReason, quickActions, isShared };
}

export function buildAgendaSections(
    ownedPlans: SocialPlan[],
    subscribedPlans: SocialPlan[]
): AgendaSection[] {
    const openOwned = ownedPlans.filter((p) => p.state === "OPEN");
    const openSubscribed = subscribedPlans.filter((p) => p.state === "OPEN");
    const allOpen = [
        ...openOwned.map((p) => toRowData(p, false)),
        ...openSubscribed.map((p) => toRowData(p, true)),
    ];

    const todayKey = getTodayKey();
    const today = new Date();

    const pastDue: AgendaPlanRowData[] = [];
    const someday: AgendaPlanRowData[] = [];
    const byDate = new Map<string, AgendaPlanRowData[]>();

    for (const row of allOpen) {
        if (isPastDueOpenPlan(row.plan)) {
            pastDue.push(row);
            continue;
        }

        const dateKey = getPlanDateKey(row.plan);
        if (!dateKey) {
            someday.push(row);
            continue;
        }

        const bucket = byDate.get(dateKey);
        if (bucket) {
            bucket.push(row);
        } else {
            byDate.set(dateKey, [row]);
        }
    }

    const sortByAnchorAsc = (a: AgendaPlanRowData, b: AgendaPlanRowData) => {
        const aTime = a.plan.anchorStart ? new Date(a.plan.anchorStart).getTime() : 0;
        const bTime = b.plan.anchorStart ? new Date(b.plan.anchorStart).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        const aUp = new Date(a.plan.updatedAt).getTime();
        const bUp = new Date(b.plan.updatedAt).getTime();
        return bUp - aUp;
    };

    const sortByUpdatedDesc = (a: AgendaPlanRowData, b: AgendaPlanRowData) => {
        return new Date(b.plan.updatedAt).getTime() - new Date(a.plan.updatedAt).getTime();
    };

    const sections: AgendaSection[] = [];

    if (pastDue.length > 0) {
        pastDue.sort(sortByAnchorAsc);
        sections.push({
            dayKey: "PAST_DUE",
            label: "Past Due",
            isToday: false,
            hasConflict: false,
            data: pastDue,
        });
    }

    const sortedDateKeys = Array.from(byDate.keys()).sort();
    for (const dateKey of sortedDateKeys) {
        const bucket = byDate.get(dateKey)!;
        bucket.sort(sortByAnchorAsc);
        sections.push({
            dayKey: dateKey,
            label: getDayLabel(dateKey, today),
            isToday: dateKey === todayKey,
            hasConflict: bucket.length > 1,
            data: bucket,
        });
    }

    if (someday.length > 0) {
        someday.sort(sortByUpdatedDesc);
        sections.push({
            dayKey: "SOMEDAY",
            label: "Someday",
            isToday: false,
            hasConflict: false,
            data: someday,
        });
    }

    return sections;
}

export function getAttentionCount(sections: AgendaSection[]): number {
    let count = 0;
    for (const section of sections) {
        for (const row of section.data) {
            if (row.attentionReason) count++;
        }
    }
    return count;
}

export function findFirstAttentionIndex(sections: AgendaSection[]): {
    sectionIndex: number;
    itemIndex: number;
} | null {
    for (let s = 0; s < sections.length; s++) {
        for (let i = 0; i < sections[s].data.length; i++) {
            if (sections[s].data[i].attentionReason) {
                return { sectionIndex: s, itemIndex: i };
            }
        }
    }
    return null;
}
