import { useMemo } from "react";

import { useListPlans } from "../api/generated/plans/plans";
import type { SocialPlan } from "../api/generated/model/socialPlan";
import {
    buildAgendaSections,
    getAttentionCount,
    type AgendaPlanRowData,
} from "../lib/agendaGrouping";

export function useAttentionPlans() {
    const { data: ownedResponse, isLoading: ownedLoading } = useListPlans({
        state: ["OPEN"],
        sort: "anchorStart",
        scope: "owned",
    });

    const { data: subscribedResponse, isLoading: subscribedLoading } =
        useListPlans({
            scope: "subscribed",
            sort: "anchorStart",
        });

    const ownedPlans: SocialPlan[] = useMemo(
        () =>
            ownedResponse?.data && "data" in ownedResponse.data
                ? (ownedResponse.data as { data: SocialPlan[] }).data
                : [],
        [ownedResponse]
    );

    const subscribedPlans: SocialPlan[] = useMemo(
        () =>
            subscribedResponse?.data && "data" in subscribedResponse.data
                ? (subscribedResponse.data as { data: SocialPlan[] }).data
                : [],
        [subscribedResponse]
    );

    const agendaSections = useMemo(
        () => buildAgendaSections(ownedPlans, subscribedPlans),
        [ownedPlans, subscribedPlans]
    );

    const attentionPlans = useMemo<AgendaPlanRowData[]>(() => {
        const result: AgendaPlanRowData[] = [];
        for (const section of agendaSections) {
            for (const row of section.data) {
                if (row.attentionReason) result.push(row);
            }
        }
        return result;
    }, [agendaSections]);

    const attentionCount = useMemo(
        () => getAttentionCount(agendaSections),
        [agendaSections]
    );

    return {
        attentionCount,
        attentionPlans,
        isLoading: ownedLoading || subscribedLoading,
    };
}
